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
| Video/still overlays | Shared compositor | Same compositor, independent decode slots for concurrent layers of one source | Physical memory/thermal QA; preflight caps retained RGBA surfaces at 96 MiB |
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
across frames and sequential clips. Preparation snapshots the authored project across async probes and is consumed
by a single render; concurrent/repeated reuse is rejected without disposing the
active render. Inputs are disposed on setup failures;
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

Keep the production gate off. The preflight now bounds retained RGBA canvas/image surfaces (including the
output canvas) to 96 MiB using decoded video dimensions and per-source peak
overlap. Sequential clips reuse slots; this is not total decoder/encoder RSS.
Test same-source layered clips at mobile resolution, then compare all
supported visual effects and mixed-speed audio against the existing compositor.
Verify exact codec output and native recovery on permitted hosts. APK/IPA,
emulator and physical acceptance require the owner's milestone authorization.
Capture, Meta DAT, microphone routing, RTMP/RTMPS, simultaneous recording,
teleprompter and Director remain separate acceptance rows; passing export tests
does not certify those integrations. Preserve their existing implementations.

## W50 1080p composition canary (2026-11-04)

`node tools/browser-composition-parity.cjs` produces a real 1920x1080,
30fps, 3.2-second VP9/Opus or supported MP4 file in isolated Chromium/Linux.
Ten decoded output frames are compared against independent per-layer source
lookups drawn by the existing `drawFrame` compositor (mean absolute RGB error
<8; fewer than 3% of sampled channels may differ by >30). Independent scene
color checks verify source switching, shared-source layers, 0.5x/2x source time
and a black gap. The project includes fade/slide/zoom, opacity/crop, a circular
image with border and styled captions. This tests parity with the existing
compositor; it is not a separate editorial reference or physical-device test.

Known sine tracks verify slowed/accelerated voice frequencies (440/1760 Hz),
voice placement, continuous music (220 Hz), the authored 2:1 gain ratio and
absence of a muted 3300 Hz track in decoded output PCM. Cancellation and an
injected random-write failure each cancel the real output and dispose all five
media inputs. The browser workflow archives the JSON evidence.

Oversized authoring now fails the bounded ledger before the full project clone,
while the authoring snapshot still precedes every asynchronous decoder probe.
Production activation, arbitrary project effects and physical acceptance remain
outside this canary's evidence.

### Real WebGL failure and aspect-ratio coverage

The same canary now loads the existing `filters-gl.mjs` in Chromium with an
explicit SwiftShader QA flag. It compares a healthy WebGL pixel against the
independent `filterRGB` CPU formula, then encodes filtered 9:16 (1080x1920),
4:5 (1080x1350) and 1:1 (1080x1080) files and checks decoded colors/dimensions.
This is software WebGL evidence, not mobile GPU compatibility.

A real `WEBGL_lose_context` call reproduced a failure: before the async context
loss event, `fxRender` returned a non-null canvas despite `isContextLost()`.
The accelerator consequently accepted the apparent filter result. The filter
now checks context loss before uploading/drawing and after drawing, returning
null so the existing accelerated guard cancels output. The injected-loss test
requires zero finalization, one cancellation and one input disposal. Healthy
preview behavior and CPU/GPU parity remain covered. The exercise timer includes
negative renders and is named `exerciseSeconds`; it is not a throughput benchmark.
