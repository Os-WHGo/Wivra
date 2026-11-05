# W66: export audit and mobile codec acceptance

Base: PR #174, `48de1cf1700ff0e8bc54a56ecbc1ea7d7b565356`.
This work concerns export only. The editor, Director, multicamera capture,
LIVE scenes and their existing recovery systems are preserved.
`ACCELERATED_EXPORT_IMPLEMENTED=false`; MediaRecorder remains the default.
A successful diagnostic never changes that gate or grants production approval.

## Existing engine and limits

The isolated multitrack renderer already decodes distinct video sources and
simultaneous layers of the same source by timeline timestamp. It supports
trims, gaps, speed, still images, video/image overlays, styled captions,
aspect ratios and the existing compositor's crop, shapes, fade/slide/zoom and
color filters. Its PCM mixer preserves offsets, gain, mute, mono/stereo and
explicit narration ducking. Existing browser canaries compare decoded picture
and audio against known sources; source mocks alone do not prove encoding.

Unknown edits, arbitrary project-level effects/transitions, animated GIFs and
unvalidated surround downmix are explicitly rejected. Native QA remains
bounded to 180 seconds and 160 authored items. Retained compositor surfaces
have a 96 MiB budget; decoded PCM windows and unacknowledged native writes
have separate bounds. These limits do not measure total decoder/encoder RAM.

Preparation snapshots authoring and is single-use. Missing samples, failed
painting and GPU filter/context failure stop export. Failure paths cancel the
output and dispose inputs. Existing native random-write storage rejects empty
files and unwritten ranges, then verifies final bytes, SHA-256, duration and
required audio. Existing MediaStore/Photos recovery is reused.

The prior 10/20/30/60-minute Linux/Chromium soak reports are evidence for their
recorded SHAs, configuration and synthetic codec pair only. They are not a
fresh W66 run, mobile H.264/AAC evidence or a device memory/thermal result.
W66 does not alter the desktop long-soak codec negotiation or mixer.

## Corrected codec mismatch

The native preflight chose an AVC profile/level using dimensions and FPS, but
the renderer passed only the `avc` family to Mediabunny. Its automatic profile
could differ from the configuration that passed preflight. Native rendering
now uses the shared `mobileCodecConfig` full codec strings, including
FPS-aware AVC levels and AAC, and shares the same video bitrate with preflight.
Encoder configuration callbacks reject deviations in profile, dimensions,
FPS, bitrate, AVC packing, audio sample rate or channels. A deviation cancels
the temporary output instead of finalizing a misleading success.

## Running the synthetic diagnostic

Use the explicitly enabled, pinned offline Mediabunny QA build. In Settings,
select the diagnostic resolution/FPS, consent to the synthetic test and run
**Diagnóstico MP4 H.264/AAC (QA)**. Cancellation and JSON download are available.
The ordinary build includes neither the vendor bundle nor this diagnostic.
No CDN is loaded at runtime.

The same test is available to a QA harness:

```js
const report = await WivraAcceleratedQA.diagnoseCodecs({
  width: 1280,
  height: 720,
  fps: 60,
  isCancelled: () => cancelled
});
```

Each run uses one second of generated red/blue video and separate stereo
tones, without reading projects or recordings. It checks exact encoder
configuration, initializes real encoders, obtains encoded packets, muxes MP4,
inspects the container, decodes picture markers and audio tones, then checks
metadata, seeking and muted HTML video playback. Required failures remain
failures; there is no silent VP9/Opus substitution for an H.264/AAC verdict.
Muted playback and decoded PCM do not verify sound from a physical speaker.

The diagnostic limits output to 8 MiB and pending video frames to four, has a
deadline and cancellation checks, closes encoders, disposes input and revokes
temporary object URLs. It does not write native storage or publish to a gallery.
Its report explicitly leaves total process memory, physical verification and
production eligibility unconfirmed.

Reports contain standardized configuration, stage outcomes, bounded metrics
and runtime classification. Raw user agents, device models, URLs, project
content, media names and arbitrary platform error messages are excluded.
Android System WebView differs from Android Chrome; WKWebView differs from
Safari. An observed app bridge is a context signal, not authenticated device
attestation. Ambiguous or contradictory signals remain unknown.

## Evidence and acceptance

| Evidence | Meaning and limit |
| --- | --- |
| Node regression tests | Exercise exact configuration, failure cleanup, cancellation, malformed files and policy using controlled source/codec mocks. They do not certify platform encoders. |
| Linux Chromium diagnostic | Local Chromium 141 rejected both AVC and AAC configurations at 320x24030 and 1080p30. Safe refusal, cancellation/retry and injected fault handling passed; no positive codec compatibility claim. |
| Linux WebKit diagnostic | Local WebKit 26 rejected AVC at both tested sizes, while accepting the exact AAC configuration query. Encoding and complete MP4 playback therefore remain unverified. This is neither Safari nor WKWebView evidence. |
| Native source compilation | Separate evidence for native code and packaging integration; it cannot establish JavaScript encoder availability inside the embedded browser. |
| Physical Android/iOS | Not executed by this block. No APK/IPA, device installation, emulator or hardware certification is implied. |

The browser harness is `tools/browser-accelerated-codec-diagnostic.cjs`; it
writes `wivra-accelerated-codec-diagnostic.json`. Inspect per-browser and
per-stage outcomes, rather than treating the harness's successful exit as
proof that AAC/H.264 is supported. Use the execution artifacts and final-SHA
workflow results for actual counts and outcomes.

Next block: collect reports at 320x240, 720p and 1080p, at 30 and 60 FPS, in
the actual Android System WebView and iOS WKWebView builds. Compare Chrome and
Safari separately. Retain exact configuration and build/SHA evidence, exercise
cancellation/retry and resource pressure, then measure real device memory,
long-duration synchronization, process interruption and verified native file
recovery under the owner's authorized device milestone. Production activation
also requires the remaining composition, compatibility and storage acceptance;
one successful synthetic second is insufficient.

— Codex
