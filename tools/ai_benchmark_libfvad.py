#!/usr/bin/env python3
"""Compare standalone, BSD-3-Clause WebRTC-derived libfvad to a cheap RMS control.
No Wivra APK/IPA modifications, no voice uploaded from users. Synthetic controls
and the exact public WAV used in Silero CPU smoke benchmark run 39073016439.
Outcomes are NOT ground-truth voice detection precision/recall or phone results.
"""
import ctypes
import hashlib
import io
import json
import math
import resource
import time
import urllib.request
import wave
from pathlib import Path

SILERO_COMMIT="1e261b036686cd0017d500ee96acd1c4ba572a9d"
WAV_URL=("https://raw.githubusercontent.com/snakers4/silero-vad/"
         +SILERO_COMMIT+"/tests/data/test.wav")
WAV_BLOB="0b1b64ecd9b316445e06cfd5b6b709b0e5fcf18f"
FVAD_SHA="532ab666c20d3cfda38bca63abbb0f152706c369"
SAMPLE_RATE=16000

def wav_samples():
    import numpy as np
    req=urllib.request.Request(WAV_URL,headers={"User-Agent":"Wivra-public-fixture-benchmark"})
    with urllib.request.urlopen(req,timeout=60) as res:
        data=res.read(2_000_000)
    blob=hashlib.sha1(b"blob "+str(len(data)).encode()+b"\0"+data).hexdigest()
    if blob!=WAV_BLOB: raise ValueError("Pinned upstream WAV hash mismatch")
    with wave.open(io.BytesIO(data),"rb") as f:
        sr=f.getframerate(); chans=f.getnchannels()
        if f.getsampwidth()!=2 or chans not in (1,2):raise ValueError("Unexpected WAV")
        x=np.frombuffer(f.readframes(f.getnframes()),dtype="<i2").astype("float32")/32768
        x=x.reshape(-1,chans).mean(axis=1)
    if sr!=SAMPLE_RATE:
        t=np.arange(0,len(x)/sr,1/SAMPLE_RATE)
        x=np.interp(t,np.arange(len(x))/sr,x).astype("float32")
    return x

def init_lib():
    f=ctypes.CDLL("/tmp/wivra-libfvad.so")
    f.fvad_new.restype=ctypes.c_void_p
    f.fvad_free.argtypes=[ctypes.c_void_p]
    f.fvad_set_mode.argtypes=[ctypes.c_void_p,ctypes.c_int]
    f.fvad_set_sample_rate.argtypes=[ctypes.c_void_p,ctypes.c_int]
    f.fvad_process.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_int16),ctypes.c_size_t]
    f.fvad_process.restype=ctypes.c_int
    return f

def score(lib,audio,mode):
    import numpy as np
    handle=lib.fvad_new()
    if not handle: raise MemoryError("fvad_new returned NULL")
    try:
        assert lib.fvad_set_mode(handle,mode)==0
        assert lib.fvad_set_sample_rate(handle,SAMPLE_RATE)==0
        length=480 # 30ms; distinct from Silero 32ms window.
        n=int(math.ceil(len(audio)/length))
        samples=np.clip(np.pad(audio,(0,n*length-len(audio))),-1,1)
        pcm=(samples*32767).astype("<i2")
        positives=0;start=time.perf_counter()
        for i in range(n):
            ptr=pcm[i*length:(i+1)*length].ctypes.data_as(ctypes.POINTER(ctypes.c_int16))
            value=lib.fvad_process(handle,ptr,length)
            if value not in (0,1):raise ValueError("libfvad rejected frame")
            positives+=value
        seconds=time.perf_counter()-start
        return {"frames":n,"voice_frames":positives,"voice_fraction":round(positives/n,4),
                "processing_seconds":round(seconds,4),"rtf":round(seconds/(len(audio)/SAMPLE_RATE),4)}
    finally:
        lib.fvad_free(handle)

def main():
    import numpy as np
    lib=init_lib()
    rng=np.random.default_rng(17017)
    cases={
      "official_unlabelled_speech_fixture":wav_samples(),
      "zero_signal":np.zeros(SAMPLE_RATE*6,dtype="float32"),
      "continuous_pure_tone":(0.20*np.sin(2*np.pi*440*np.arange(SAMPLE_RATE*6)/SAMPLE_RATE)).astype("float32"),
      "broadband_random_noise":(0.03*rng.standard_normal(SAMPLE_RATE*6)).astype("float32")
    }
    report={}
    for label,wav in cases.items():
        report[label]={"audio_seconds":round(len(wav)/SAMPLE_RATE,3),
                       "mode0_quality":score(lib,wav,0),
                       "mode2_aggressive":score(lib,wav,2)}
    output={
      "type":"REAL_COMPILED_LIBFVAD_CPU_SMOKE",
      "upstream":"dpirch/libfvad",
      "upstream_sha":FVAD_SHA,
      "platform":"GitHub Actions Ubuntu 24.04 x86_64, C library via Python ctypes",
      "license_declared":"BSD-3-Clause, PATENTS notice (recheck compliance on distribution)",
      "frame_ms":30,
      "process_peak_rss_kib":resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
      "no_mobile_code_or_models_installed":True,
      "limits":"Unlabelled public speech, synthetic controls only. No recall/precision/word accuracy/hardware, not exactly comparable to Silero 32ms frames.",
      "cases":report
    }
    text=json.dumps(output,ensure_ascii=False,indent=2)
    print(text)
    Path("wivra-libfvad-smoke.json").write_text(text+"\n",encoding="utf-8")

if __name__=="__main__":main()
