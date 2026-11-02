#!/usr/bin/env python3
"""Wivra isolated Silero VAD CPU smoke bench. No app dependency or private media.
No WER, ASR, phone performance, or accuracy claims from this unlabelled fixture.
"""
import argparse
import hashlib
import io
import json
import math
import resource
import time
import urllib.request
import wave
from pathlib import Path

# Pinned official Silero revision and official Git blob IDs, retrieved 2026-10-17.
UPSTREAM = "1e261b036686cd0017d500ee96acd1c4ba572a9d"
FILES = {
    "silero_vad.onnx": ("src/silero_vad/data/silero_vad.onnx", "80c5592ef1f4c9ede3e357bbd02eb863358a6a9d", 2327524),
    "test.wav": ("tests/data/test.wav", "0b1b64ecd9b316445e06cfd5b6b709b0e5fcf18f", 1920044),
}
BASE = "https://raw.githubusercontent.com/snakers4/silero-vad/" + UPSTREAM + "/"

def git_blob_sha(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def retrieve(outdir, key):
    rel, blob, size = FILES[key]
    dest = outdir / key
    if dest.exists():
        data = dest.read_bytes()
    else:
        req = urllib.request.Request(BASE + rel, headers={"User-Agent": "Wivra-benchmark-readonly"})
        with urllib.request.urlopen(req, timeout=60) as response:
            data = response.read(size + 1)
    if len(data) != size or git_blob_sha(data) != blob:
        raise ValueError("Upstream fixture checksum/size mismatch: " + key)
    if not dest.exists():
        dest.write_bytes(data)
    return data

def load_wav(data):
    import numpy as np
    with wave.open(io.BytesIO(data), "rb") as wav:
        rate, channels, width = wav.getframerate(), wav.getnchannels(), wav.getsampwidth()
        if width != 2 or channels not in (1, 2) or rate not in (8000, 16000, 32000, 48000):
            raise ValueError("Unexpected upstream WAV format: " + str((rate, channels, width)))
        a = np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype("float32") / 32768
        a = a.reshape(-1, channels).mean(axis=1)
    if rate != 16000:
        t = np.arange(0, len(a) / rate, 1 / 16000)
        a = np.interp(t, np.arange(len(a)) / rate, a).astype("float32")
    return a.astype("float32")

def onnx_scores(session, signal):
    import numpy as np
    # Official Silero ONNX 16 kHz contract: 512 samples + 64 previous context,
    # recurrent state [2, 1, 128]. See upstream utils_vad.py OnnxWrapper.
    state = np.zeros((2, 1, 128), dtype="float32")
    context = np.zeros((1, 64), dtype="float32")
    total = len(signal)
    windows = int(math.ceil(total / 512))
    padded = np.pad(signal, (0, windows * 512 - total)).astype("float32")
    probs = np.empty(windows, dtype="float32")
    started = time.perf_counter()
    for idx in range(windows):
        chunk = padded[idx*512:(idx+1)*512][None, :]
        model_input = np.concatenate((context, chunk), axis=1)
        outs = session.run(None, {"input": model_input, "state": state, "sr": np.array(16000, dtype="int64")})
        probs[idx] = float(np.asarray(outs[0]).reshape(-1)[0])
        state = outs[1]
        context = model_input[:, -64:]
    elapsed = time.perf_counter() - started
    if not np.all(np.isfinite(probs)) or np.min(probs) < 0 or np.max(probs) > 1:
        raise AssertionError("Invalid Silero output probability")
    return probs, elapsed

def energy_activity(signal, threshold=0.03):
    # REFERENCE fixed amplitude detector for qualitative contrast only, NOT
    # identical to Wivra's adaptive envelopeFromSamples/silencesFromEnvelope.
    import numpy as np
    n = int(math.ceil(len(signal) / 512))
    padded = np.pad(signal, (0, n*512-len(signal))).reshape(n, 512)
    rms = np.sqrt(np.mean(padded.astype("float64") ** 2, axis=1))
    return float(np.mean(rms > threshold))

def run(outdir):
    import numpy as np
    import onnxruntime as ort
    outdir.mkdir(parents=True, exist_ok=True)
    model = retrieve(outdir, "silero_vad.onnx")
    wav = retrieve(outdir, "test.wav")
    import tempfile
    model_path = outdir / "silero_vad.onnx"
    options = ort.SessionOptions()
    options.intra_op_num_threads = options.inter_op_num_threads = 1
    session = ort.InferenceSession(str(model_path), options, providers=["CPUExecutionProvider"])
    signal = load_wav(wav)
    # Artificial controls are NOT labelled speech-recognition ground truth.
    rng = np.random.default_rng(17017)
    cases = {
        "official_unlabelled_speech_fixture": signal,
        "zero_signal": np.zeros(16000 * 6, dtype="float32"),
        "continuous_pure_tone": (0.20*np.sin(2*np.pi*440*np.arange(16000*6)/16000)).astype("float32"),
        "broadband_random_noise": (0.03*rng.standard_normal(16000*6)).astype("float32"),
    }
    res = {}
    for label, audio in cases.items():
        probs, seconds = onnx_scores(session, audio)
        res[label] = {
            "audio_seconds": round(len(audio)/16000, 3),
            "processing_seconds_cpu": round(seconds, 4),
            "real_time_factor_cpu": round(seconds/(len(audio)/16000), 4),
            "silero_frames_p_ge_0_5": int(np.sum(probs>=0.5)),
            "silero_fraction_p_ge_0_5": round(float(np.mean(probs>=0.5)), 4),
            "energy_fixed_rms_fraction": round(energy_activity(audio), 4),
            "silero_probability_mean": round(float(probs.mean()), 4),
        }
    if res["zero_signal"]["silero_fraction_p_ge_0_5"] > 0.01:
        raise AssertionError("Silero classified near all-zero samples as voice")
    if res["official_unlabelled_speech_fixture"]["silero_frames_p_ge_0_5"] == 0:
        raise AssertionError("Silero detected no voice at all in upstream speech fixture")
    result = {
        "type":"REAL_ONNX_MODEL_CPU_SMOKE_BENCHMARK",
        "date_source":"2026-10-17",
        "upstream_repository":"snakers4/silero-vad",
        "upstream_commit":UPSTREAM,
        "onnxruntime":ort.__version__,
        "run_environment":"github_actions_ubuntu_x86_64_CPU",
        "peak_rss_kib":resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "models_installed_in_wivra_app":False,
        "measures":"model load, voice probability response, processing time on CI CPU",
        "does_not_measure":"ground-truth precision/recall, word error rate, ASR, real iOS/Android performance, battery, real wind",
        "cases":res
    }
    print(json.dumps(result,ensure_ascii=False,indent=2,sort_keys=True))
    return result

if __name__ == "__main__":
    ap=argparse.ArgumentParser()
    ap.add_argument("--cache", default="/tmp/wivra-silero-model-fixture")
    args=ap.parse_args()
    run(Path(args.cache))
