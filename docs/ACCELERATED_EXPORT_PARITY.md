# Accelerated export parity and beta acceptance

Software audit: 2026-11-04, PR #164 / issue #165, baseline `de3f063`.
MediaRecorder remains the production default. `ACCELERATED_EXPORT_IMPLEMENTED`
remains false. No physical device, installer or release is certified here.

The old cut renderer is deliberately narrower than the existing multitrack
renderer. Rejecting a montage in `acceleratedCutEligibility` is not evidence
that the separate multitrack implementation is missing. The explicit native
QA route already uses `recordExperimentalNativeMultitrack`; the legacy memory
QA route still uses the cut renderer. Do not rebuild either editor or Director.

| Semantics | Existing stable export | Existing accelerated multitrack QA | Acceptance still needed |
| --- | --- | --- | --- |
| Different video sources, trims, gaps | Supported | Timestamp decoding; black gaps; source duration checks | Mobile codecs and physical output QA |
| Camera audio and independent voice/music | Supported | PCM windows, gain/mute, speed, voice ducking, stereo/mono | Physical A/V and audio-route QA; surround rejected |
| Video/still overlays | Shared compositor | Same compositor, independent decode slots for concurrent layers of one source | Mobile memory/thermal budget with many layers |
| Text/subtitles, aspect, crop, shape | Shared compositor | Reuses `drawFrame`, existing text/style contracts and aspect selection | Broader rendered-pixel comparisons and mobile fonts |
| Speed and clip fade/slide/zoom | Existing timeline contracts | Source-time mapping and shared compositor; unknown effects rejected | Physical mixed-speed A/V and all compatible effects |
| Arbitrary project effects/transitions | Varies by existing compositor | Explicitly rejected | Implement only with complete semantics and tests |
| Cancel/setup failure | Existing recovery | Cancel output; dispose inputs even before encoder start | Process interruption QA on devices |
| Native random-write and publication | Existing hosts/recovery | v2 staging, codec preflight, SHA/duration/audio verification | WKWebView/WebView H264/AAC end-to-end, Photos/MediaStore physical QA |
| Long video | Existing tests | 10/20/30/60-minute Linux soak workflow | Read final reports for each new SHA; no mobile extrapolation |

## Reproduced and corrected

A `CanvasSink` with `poolSize:1` reuses its surface. Decoding a second clip
from that same asset before compositing overwrote the main picture. The renderer
now reserves distinct sink slots for simultaneous layers and reuses those slots
across frames and sequential clips. Inputs are disposed on setup failures;
an allocated output is cancelled even when encoder construction fails.
Unknown clip transitions, overlay shapes and visual edits attached to independent
audio fail before output creation instead of disappearing silently.

`node tools/browser-multitrack-accelerated.cjs --shared-source` encodes a changing
orange/blue source. At timeline 0.2s the main must remain orange while its inset
reads blue at source 1.02s. ffmpeg decodes both regions from the exported file.
The baseline renderer fails (both regions blue); the corrected renderer passes.
This is real Chromium/Linux WebCodecs + Mediabunny 1.61.6 encoding, not a device
or H264/AAC guarantee. The existing WAV delay, duration, tracks and seek checks
also run. The browser matrix archives this regression alongside existing tests.

## Next acceptance block

Keep the production gate off. Bound aggregate decoder/canvas memory for concurrent
layers, test same-source layered clips at mobile resolution, then compare all
supported visual effects and mixed-speed audio against the existing compositor.
Verify exact codec output and native recovery on permitted hosts. APK/IPA,
emulator and physical acceptance require the owner's milestone authorization.
Capture, Meta DAT, microphone routing, RTMP/RTMPS, simultaneous recording,
teleprompter and Director remain separate acceptance rows; passing export tests
does not certify those integrations. Preserve their existing implementations.
