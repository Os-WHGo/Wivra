#!/usr/bin/env python3
"""Isolated, reproducible sherpa-onnx + Moonshine v2 tiny EN CPU speech test.

NO Wivra mobile packages/models are modified. Only public speech and official
release model are fetched. Checksums and archive paths are checked before use.
Results are not representative of physical phone power, WER in other languages,
or relative accuracy beyond the SINGLE known English test sentence.
"""
import hashlib
import io
import json
import re
import resource
import tarfile
import time
import urllib.request
import wave
from pathlib import Path

MODEL_URL = ("https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/"
             "sherpa-onnx-moonshine-tiny-en-quantized-2026-02-27.tar.bz2")
MODEL_SHA256 = "9ec31b342d8fa3240c3b81b8f82e1cf7e3ac467c93ca5a999b741d5887164f8d"
MODEL_ARCHIVE_BYTES = 29858559
SAMPLE_URL = ("https://raw.githubusercontent.com/ggml-org/whisper.cpp/"
              "0c7be696371069e0baa2515ed7aa08d5a5473aa6/samples/jfk.wav")
SAMPLE_GIT_BLOB = "3184d372cd2f8b804d3a540c70ec50d927b335d2"
REFERENCE = ("and so my fellow Americans ask not what your country can do for you "
             "ask what you can do for your country")

def download(url, maximum):
    req = urllib.request.Request(url, headers={"User-Agent": "Wivra-AI-public-fixture-benchmark"})
    with urllib.request.urlopen(req, timeout=180) as response:
        data = response.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError("Download exceeded declared public fixture cap")
    return data

def extract_model(data, dest):
    expected = {"encoder_model.ort", "decoder_model_merged.ort", "tokens.txt", "LICENSE"}
    found = {}
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:bz2") as archive:
        for item in archive.getmembers():
            if not item.isfile():
                continue
            # NEVER extract arbitrary paths or symlinks.
            name = Path(item.name).name
            if name not in expected or name in found:
                continue
            if item.size > 125_000_000 or ".." in Path(item.name).parts:
                raise ValueError("Unexpected archive member")
            stream = archive.extractfile(item)
            if stream is None:
                raise ValueError("Unexpected non-file model member")
            content = stream.read(item.size + 1)
            if len(content) != item.size:
                raise ValueError("Invalid archive member size")
            output = dest / name
            output.write_bytes(content)
            found[name] = output
    if set(found) != expected:
        raise ValueError("Model archive missing expected resources: " + str(expected - set(found)))
    if not (found["encoder_model.ort"].stat().st_size > 10_000_000
            and found["decoder_model_merged.ort"].stat().st_size > 10_000_000):
        raise ValueError("Truncated model")
    return found

def read_jfk(data):
    import numpy as np
    blob = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
    if blob != SAMPLE_GIT_BLOB:
        raise ValueError("Official whisper sample Git blob mismatch")
    with wave.open(io.BytesIO(data), "rb") as f:
        if f.getsampwidth() != 2 or f.getnchannels() != 1 or f.getframerate() != 16000:
            raise ValueError("Unexpected WAV properties")
        audio = np.frombuffer(f.readframes(f.getnframes()), dtype="<i2").astype("float32")/32768.
        seconds = len(audio)/f.getframerate()
    return audio, seconds

def words(s):
    return re.findall(r"[a-z']+",s.casefold())

def wer(reference, transcript):
    ref, hyp = words(reference), words(transcript)
    row = list(range(len(hyp)+1))
    for i, x in enumerate(ref, 1):
        nxt=[i]
        for j,y in enumerate(hyp,1):
            nxt.append(min(nxt[-1]+1,row[j]+1,row[j-1]+(x!=y)))
        row=nxt
    return row[-1]/len(ref),len(ref),len(hyp)

def main():
    import numpy as np
    import sherpa_onnx
    from tempfile import TemporaryDirectory
    overall=time.perf_counter()
    with TemporaryDirectory(prefix="wivra-sherpa-") as tmp:
        dest=Path(tmp)
        archive=download(MODEL_URL,MODEL_ARCHIVE_BYTES)
        if len(archive)!=MODEL_ARCHIVE_BYTES or hashlib.sha256(archive).hexdigest()!=MODEL_SHA256:
            raise ValueError("Official GitHub release size/digest mismatch")
        paths=extract_model(archive,dest)
        wav=download(SAMPLE_URL,600_000)
        samples,seconds=read_jfk(wav)
        loaded=time.perf_counter()
        recognizer=sherpa_onnx.OfflineRecognizer.from_moonshine_v2(
            encoder=str(paths["encoder_model.ort"]),
            decoder=str(paths["decoder_model_merged.ort"]),
            tokens=str(paths["tokens.txt"]),
            num_threads=2,
            debug=False
        )
        # An 11s clip FAILED on these pinned versions in run 39080238074
        # (ONNX decoder broadcast 2 by 457). Do not claim continuous support.
        # Try short sections separately and expose limitations in the output.
        def transcribe_part(data):
            stream=recognizer.create_stream()
            stream.accept_waveform(16000,data)
            recognizer.decode_stream(stream)
            return stream.result.text.strip()
        runs=[]
        for chunk_s in (5.5,3.0):
            start=time.perf_counter()
            parts=[]
            length=int(chunk_s*16000)
            for offset in range(0,len(samples),length):
                piece=samples[offset:offset+length]
                if len(piece)<8000:
                    continue
                parts.append(transcribe_part(piece))
            duration=time.perf_counter()-start
            transcript=" ".join(parts)
            rate,ref_count,hyp_count=wer(REFERENCE,transcript)
            runs.append({
                "chunk_seconds":chunk_s,
                "decoded_sections":len(parts),
                "transcript":transcript,
                "WER_against_JFK_quote_segmented":round(rate,4),
                "recognized_words":hyp_count,
                "processing_seconds":round(duration,4)
            })
        usable=[x for x in runs if x["recognized_words"]>=5]
        if not usable:
            raise AssertionError("Pinned Moonshine v2 failed even when short chunks were used")
        best=min(usable,key=lambda r:r["WER_against_JFK_quote_segmented"])
        transcript=best["transcript"]
        rate,ref_count,hyp_count=wer(REFERENCE,transcript)
        decode_time=best["processing_seconds"]
        res = {
            "test_type":"REAL_SHERPA_ONNX_MOONSHINE_V2_CPU_ENGLISH_ASR_SMOKE",
            "runner":"GitHub Actions Ubuntu 24.04 x86_64 CPU, 2 threads",
            "runtime_version":"sherpa-onnx 1.13.8",
            "model":"Moonshine v2 tiny English only, sherpa-onnx quantized archive",
            "release_sha256":MODEL_SHA256,
            "reference_audio":"whisper.cpp pinned public samples/jfk.wav",
            "duration_seconds":round(seconds,3),
            "transcript":transcript,
            "reference_words":ref_count,
            "recognized_words":hyp_count,
            "WER_single_English_excerpt":round(rate,4),
            "decode_seconds_no_model_load":round(decode_time,4),
            "model_init_seconds":None,
            "continuous_11s_result":"FAILED on pinned 1.13.8 ONNX decoder Add broadcast (run 39080238074)",
            "chunk_tests":runs,
            "best_chunk_seconds":best["chunk_seconds"],
            "fair_comparison_to_continuous_whisper":False,
            "total_seconds_including_download":round(time.perf_counter()-overall,3),
            "process_peak_rss_kib":resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            "mobile_weights_integrated":False,
            "not_measured":"WER in any other audio, iOS/Android performance, wind/music, energy, latency of streaming, licenses of non-English Moonshine weights"
        }
    out=json.dumps(res,ensure_ascii=False,indent=2)
    print(out)
    Path("wivra-sherpa-moonshine-results.json").write_text(out+"\n",encoding="utf-8")

if __name__=="__main__":
    main()
