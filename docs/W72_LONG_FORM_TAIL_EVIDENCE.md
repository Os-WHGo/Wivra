# Wivra W72 | Final-frame proof for 10/20/30/60-minute accelerated exports

**Source:** stacked on W71 PR #180. This changes Linux Chromium/WebCodecs QA evidence only. Wivra still uses the approved WebCodecs + Mediabunny path in isolated QA, while `ACCELERATED_EXPORT_IMPLEMENTED=false` and the existing MediaRecorder fallback remain unchanged.

## Why this gate matters

The prior accelerated 10/20/30/60-minute soak checked exact frame and audio block counts, container duration and seek index, early/middle scene parity, PCM voice near the tail and a continuous music bed. These are valuable but don't independently demonstrate that a **video frame near the end can actually be decoded** or that the **last authored scene transition** survives.

## W72 software proof

The synthetic 120-clip long soak alternates orange/blue main shots. The last two authored clips are clip 118 (orange) and clip 119 (blue). The browser harness now requests fresh decoded pixels **from the produced video file** at two measured seek offsets:

- `previousAtSeconds = duration - duration / 120 - 0.25`, inside the penultimate orange clip.
- `finalAtSeconds = duration - 0.25`, inside the final blue clip.

The stored report includes the measured RGB samples, both exact requested offsets, and boolean color checks. A missing decode, a mismatched scene or an incorrect end offset fails immediately. The independent report auditor revalidates timestamps, channel bounds and RGB contrast, requires the 10/20/30/60 minute files, and includes the last decoded video timestamp in the evidence summary. Mutation tests reject missing, incorrect, malformed or fabricated color/status fields.

The check does not replay the entire media end-to-end or prove every middle frame is independently playable. It confirms two targeted late frames can be decoded from the final disk file, **in addition to** the existing full frame-count, voice/music, seek-index, ffprobe and resource tests. The test remains synthetic **320×240 Linux WebM VP9/Opus**. It is not a native Android/iOS H.264/AAC MP4 export or phone performance benchmark.

## Required gates for next device milestone

| Gate | Software CI evidence | Actual phone acceptance still required |
| --- | --- | --- |
| 10-minute export | 18,000 reported frames, 600 audio blocks, decoded penultimate/final scenes, voice/music presence, ffprobe and resources | Export, play and reopen real project in WKWebView and Android WebView; verify A/V sync and Photos/MediaStore |
| 20-minute export | 36,000 reported frames, 1,200 audio blocks and same tail/continuity checks | Reopen/seek and verify long file on the actual supported device |
| 30-minute export | 54,000 reported frames, 1,800 audio blocks and same tail/continuity checks | Observe memory/temperature/battery and export after microphone or camera route change |
| 60-minute export | 108,000 reported frames, 3,600 audio blocks and same tail/continuity checks | Real camera/Meta recordings, post-interruption recovery and exact AVC/AAC MP4 final checks |
| Interrupted files | Existing iOS W69–W70 no-overwrite, receipt integrity and safe recovery contracts | Force-kill and low-storage scenarios with preserved bytes, checked on a phone |
| LIVE/local MP4 | Existing LIVE recording preflight/source checks unchanged | Real RTMP delivery, reconnect, audio path and simultaneous local recording |

**Failure policy:** never convert an unsupported WebView codec, missing picture, absent audio tail, incomplete receipt, thermal abort or interrupted Photos save into an automatic success. Preserve original media and surface a reviewable failure; keep working production export as fallback.

## Boundaries

This step performs no release packaging, APK/IPA signing, hardware installation, permissions change, server upload, forced merge or changes to `main`. Exact-SHA CI success only validates the software checks named in the passing workflow; physical acceptance remains separate.
