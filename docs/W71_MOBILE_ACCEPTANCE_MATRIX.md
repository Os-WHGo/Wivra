# Wivra W71 · Six-case H.264/AAC synthetic matrix and physical acceptance gates

**Branch:** `chatgpt/wivra-w71-codec-matrix-20261105`, stacked on W70 #179 (not on `main`).
**Decision:** WebCodecs + pinned Mediabunny 1.61.6 remains the selected accelerated engine. The production implementation gate stays `ACCELERATED_EXPORT_IMPLEMENTED=false`. MediaRecorder remains the default and fallback.

## Implemented in W71

In the opt-in, pinned **offline QA build only**, Settings has a *Matriz de compatibilidad H.264/AAC (QA)* panel. It executes the original W66 `runAcceleratedCodecDiagnostic` sequentially for six cases, never more than one at once. Every case encodes **one second of synthetic color frames and stereo audio**, checks genuine configured AVC/AAC encoders, MP4 structure, real decoded picture and PCM, seeking and muted playback.

| Case | Pixels | FPS | Status before running |
| --- | ---: | ---: | --- |
| qvga30 | 320×240 | 30 | Not measured on phone |
| qvga60 | 320×240 | 60 | Not measured on phone |
| hd30 | 1280×720 | 30 | Not measured on phone |
| hd60 | 1280×720 | 60 | Not measured on phone |
| fhd30 | 1920×1080 | 30 | Not measured on phone |
| fhd60 | 1920×1080 | 60 | Not measured on phone |

The report is a bounded JSON summary with sanitized case ID, exact geometry/FPS, pass/fail/cancelled/unrun status and **unauthenticated** runtime hints. Matrix pass requires all six cases and a stable runtime. Failure in one case is retained without aborting other cases. Cancellation stops new cases; an interrupted diagnostic leaves a bounded per-case recovery receipt for the existing QA UI. Native project media, actual files, URLs, user agent strings, paths and hardware model are not collected.

Run the guard suite: `node --test app/tests/accelerated-codec-matrix.test.mjs`. The isolated browser workflow also runs that suite with its existing Linux synthetic AVC/AAC diagnostic. A passing CI report **never counts as mobile acceptance**.

## Required physical acceptance (future owner-approved beta milestone)

Testing must record exact app SHA/branch, OS and embedded rendering context **separately** for iOS WKWebView and Android System WebView, without storing identifying hardware numbers. Do not treat Safari, Android Chrome, Linux Chromium or Linux WebKit as equivalent.

| Area | iPhone / Android real-world test | Sufficient evidence for manual review |
| --- | --- | --- |
| Synthetic codec matrix | Run all six W71 cases in the actual app WebView; repeat after cold start | Downloaded bounded JSON, exact case outcomes, observed AVC/AAC and decoded audio/seek; report remains unauthenticated until independently checked |
| Native export | Export a real project in portrait/landscape, with voice, music, overlays, PiP, text, filter, speed change, gaps and cuts, at 720p and 1080p | Played-back MP4 with correct frame sequence, audio sync, duration, seek and track samples; no missing/muted audio |
| 10-minute run | Record/edit/export continuously with phone and real mic, then relaunch app | Original and exported media preserved; no unexplained gaps, valid audio/video and seek |
| 30-minute run | Capture and export with changing audio scenes and external route interruption | Measured duration/AV drift, complete verified original, fallback behavior, memory, heat and battery |
| 60-minute run | Record uninterrupted and interrupted segments and export long-form | Process/memory/thermal observations, verified A/V tail, successful file reopen, no silent truncated success |
| Recovery | Force-close during native dual camera, finalization, Photos save and accelerated native staging | Independent sample/boundary verification; no overwritten original, orphan receipts retained, no duplicate gallery save |
| LIVE | RTMP/RTMPS real broadcast, camera/video scene switch, optional mic, simultaneous local MP4, disconnect/reconnect | Verified endpoint reception, separate correct audio, and safely recoverable local recording |
| Ray-Ban | Capture HEVC from actual Meta Gen 2, interrupted long segmented recording and import | Verified original segments and joined complete take; no false camera, timestamps, or extra gallery parts |

**For each hardware case:** report observed result, explicit failure stage, raw media retained locally for verification, app/version SHA and environment, and whether any action was cancelled or interrupted. Do not upload private media or stream credentials to GitHub Actions.

## Hard no-go criteria

- Any missing, re-encoded-to-an-unrequested-codec, overwritten, undecodable, silent or unexpectedly truncated output.
- No physical sample proof, unclear runtime, or inferred multicamera PTS.
- Process resource data missing or unacceptable in sustained workloads.
- A successful one-second matrix being used to authorize long-form recording, native storage, LIVE, installations, or production.
- Automatic replacement of the working export fallback, publishing to Photos without consent or signing/releasing a beta before the owner-approved milestone.

**W71 is QA infrastructure, not a physical release.** No APK/IPA, emulator, physical installation, public release, purchases, cloud uploads or change to `main` was authorized or performed by this block.
