# Wivra · Ray-Ban Meta: video quality, profiles and LIVE (DAT 1.0.1)

Research and changes by Claude, 06-11-2026. The owner tests on physical devices from 16-11.

## Official sources consulted (verified)

- `meta-wearables-dat-ios` and `meta-wearables-dat-android`: `AGENTS.md`, the `camera-streaming` and `camera-capture` skills, and both `CHANGELOG.md` files (main branch, latest tag **1.0.1**, 09-10-2026). Wivra already pins **1.0.1** on both platforms.
- `developers.meta.com/wearables/faq`: the page did not return readable text to the scraper. No data is taken from it.

## What the SDK really offers (verified in official sources)

| Topic | Official fact |
|-|-|
| Stream resolutions | `.high` 720×1280, `.medium` 504×896, `.low` 360×640 |
| Frame rates | 2, 7, 15, 24, 30 fps |
| SDK default | `.raw`, `.medium`, 30 fps |
| Transport for camera streaming | **Bluetooth Classic**, per the iOS docs' link table |
| Wi-Fi | iOS 0.8.0: «[Feature] WiFi transport». It needs `NSLocalNetworkUsageDescription` and `NSBonjourServices`, and Wivra already declares both. **Not documented** that the camera stream uses it. Android lists no Wi-Fi transport. |
| Bandwidth limit | The SDK lowers resolution first, then fps, **never below 15 fps**. Meta: «Lower resolution and frame rate yield higher visual quality due to less Bluetooth compression». |
| Compressed frames | iOS `.hvc1` (HEVC, passthrough to file); Android `compressVideo = true` (`isCompressed`, `isCodecConfig`). 1.0.1 fixes HEVC buffer corruption on Android. |
| Device state (1.0.0) | `batteryLevel`, `thermalLevel`, `chargingState`, `donState` and `hingeState` on `Device`. `StreamError` thermal/power cases. |
| Glasses audio (1.0.0, experimental) | `StreamConfiguration.audioCodec` plus an audio frame publisher/stream |
| High-quality photo (1.0.0, experimental) | `Camera.photo`: **photos only**, with transfer progress |
| 3K original video recorded by the glasses | **No API** in DAT. The originals reach the phone through the Meta AI app and its gallery, and Wivra imports them like any video. **No private integration** is invented. |

Consequence: **3K LIVE cannot be enabled through a parameter.** The highest stream is 720×1280.

## Initial state in Wivra (before this block)

- **iPhone:** 4 profiles: saver 360×640@15, balanced 504×896@24, motion 504×896@30, detail 720×1280@15.
- **Android:** one fixed profile, 504×896@24, both in the preview and in the background service.
- **HEVC:** passthrough recording already exists, `.hvc1` on iPhone and `compressVideo` on Android.
- **Ray-Ban LIVE:** **does not exist** on either platform. iPhone's LIVE explicitly excludes DAT.

## Changes (code, both platforms)

- **One shared profile table:** `WivraDatProfiles.kt` / `WivraDatProfiles.swift` / `streaming/contracts/dat-profiles.json`.
  - saver 360×640@15
  - balanced 504×896@24 (**default**)
  - motion 504×896@30
  - detail 720×1280@15
  - **maximum 720×1280@30** (new; Meta may lower it on its own)
  - **Automático**
- **Android now has profiles:** in the preview, and the same profile in the background capture service.
- **«Automático» with hysteresis:**
  - It decides the **next** start from what the previous session actually delivered: real fps, gaps, received resolution and heat.
  - During a session it only **suggests** going down, never up. It judges after ≥ 10 s, at most once per minute.
  - The change restarts the camera, so it is applied only when the person taps it, and **never while recording or live**.
  - It never goes to 720p by itself.
- **Private diagnostics** (on screen only): requested vs received profile, real FPS, p95 frame interval, gaps (> max(500 ms, 4 periods)) and Mbps. It keeps only times, sizes and byte counts, with a limit of 600 intervals. It never stores images and sends nothing anywhere.
- **Heat:** on Android, `THERMAL*` and `PEAK_POWER_LIMIT` errors from the stream feed «Automático»; on iPhone, the existing heat signal does. Reading the glasses' temperature level directly from `Device` (1.0.0) is pending: its exact API was not confirmed without a compiler.
- **Tests:** the same vectors run in a JVM test (Kotlin), a macOS Swift 6 smoke test (iPhone code) and a Node contract test.

## Default profile recommendation (with evidence)

**Balanced 504×896@24.**

- Meta advises lower resolution and fps for better quality per frame over Bluetooth.
- The SDK lowers 720p first when bandwidth falls short.
- Meta's own examples use `.medium` at 24 fps.
- 720p@30 stays available as «Máxima» for the physical tests, without promising that it holds.

This is not yet measured on Wivra's glasses; the physical matrix below confirms it or changes it.

## LIVE with Ray-Ban (analysis; next step)

- **Path:** DAT (`.raw`, already-decoded frames) → existing LIVE engine (HaishinKit on iPhone, RootEncoder on Android) → H.264/AAC → RTMP/RTMPS. No new engine is created.
- **HEVC instead of raw?** Decoding HEVC and re-encoding H.264 on the phone adds a step and latency. `.raw` already delivers decoded frames over the same link. For LIVE, `.raw` is preferred; for local recording, HEVC passthrough (already implemented).
- **Reference `specbridge`** (MIT, 327 lines of Swift, depends on DAT and HaishinKit):
  - 720×1280@24 raw → HaishinKit, H.264 High 3.1, 2.5 Mbps, keyframe every 2 s.
  - Its useful idea is «priming»: send frames before `publish` so the metadata carries the real size (no black screen and no 1×1).
  - It stores the Twitch key on the phone. Wivra does not do this and does not copy that part. No code is copied.
- **Still to implement:**
  - The Ray-Ban source inside the existing LIVE, iPhone first. DAT's `VideoFrame.sampleBuffer` feeds HaishinKit directly.
  - Bounded queue that drops old frames.
  - Simultaneous local MP4.
  - Reconnection with the existing policy.

## «Solo vídeo» + independent microphone (Gen 2 priority)

The glasses' microphone (Bluetooth HFP) is **never** used for these recordings. The person chooses the audio:

- the phone's microphone (default);
- a wired or USB-C one, including USB wireless receivers;
- an external Bluetooth one, only if Android/iOS gives it a readable name that is not the glasses';
- no audio («Solo vídeo»).

### iPhone

- `WivraAudioRoute`: Bluetooth (HFP) stays closed unless the person explicitly picks a Bluetooth input. If HFP is open for another choice, the audio does not start.
- It records the existing CAF sidecar, the manifest v2 and the local mux.
- The CAF offset is now anchored on the **least-delayed** DAT sample, `min(arrival − pts)`, instead of the first arrival (`WivraRayBanSync.swift`). This is checked by a macOS Swift smoke test.

### Android

| Item | What happens |
|-|-|
| Capture | The chosen input records a 48 kHz WAV inside the capture service, next to the HEVC parts. The `microphone` service type is declared only when a microphone was chosen. The recorder checks, on every read, that the routed input is the chosen one. |
| Missing microphone | The person is told and offered the inputs that are connected, or «Grabar solo vídeo». Wivra never switches by itself. |
| Microphone lost midway | The video continues, the audio up to that moment is kept, and the person is told. |
| Sync | Everything uses one monotonic clock (`elapsedRealtimeNanos`). Each 30-second part is anchored on its least-delayed sample. The audio is anchored on its first read minus the first chunk. Drift is measured, and corrected only after ≥ 5 min of audio and when it is ≤ 2000 ppm. |
| «Conservar» | Each part gets its exact PCM frames: a byte copy, with no re-encoding. The audio is published in `Music/Wivra/` with the same name as its MP4, and the editor imports the pair as a capture (manifest v2, `android-rayban-dat`). If a part cannot get its slice, the complete WAV is published. The private original is deleted only when its audio is already public. |
| «Descartar» | Confirmed twice. The audio of the discarded parts is deleted with them. |

- **Contract:** `streaming/contracts/rayban-audio-sync.json`, checked by a JVM test, a JavaScript twin and the Swift smoke test.
- **Not measured:** the delay between the glasses' sensor and the phone. DAT 1.0.1 does not expose it. The manifest says `videoLinkLatencyMs: null`. The physical clap test measures it.

### LIVE with an external microphone (next step)

The same choice will feed the existing LIVE engine: Ray-Ban video plus AAC from the selected microphone, over RTMP/RTMPS. It is not implemented yet in this block.

### Physical tests for this mode (from 16-11)

1. Clap in front of the glasses at 1 m with each microphone (phone, USB-C, USB wireless receiver, external Bluetooth). In the editor, note the gap between the image and the sound of the clap, at the start and at minute 10.
2. With the glasses connected: check that the HFP line says «cerrado» and that Android/iOS shows no Bluetooth call.
3. Unplug the USB microphone in the middle of a recording. Check that the video continues, the notice appears, and the audio up to that point is saved.
4. Record 10 minutes, then «Conservar». Check that each part has its WAV with the same name, and that the editor imports «Captura» with its audio.
5. Compare one take with the glasses' microphone (outside Wivra, for reference) against the phone or USB microphone: noise, volume and sync.

## Image improvements

None were added in this block. The original image stays untouched, and resolution is not invented. Possible options for later, measuring heat:

- Core Image or Metal on iPhone, and GPU shaders on Android;
- mild noise reduction, exposure and sharpness, only on the copy that is transmitted or exported.

## Short physical matrix (from 16-11)

For each profile (saver, balanced, motion, detail, maximum) in 1-minute sessions, note the diagnostic line (received, FPS, p95, gaps):

1. Indoors, good light, still: sharpness of text at 1 m.
2. Indoors, low light: noise and fps.
3. Outdoors, walking: smoothness and gaps.
4. Fast movement (turning the head): smearing and drops.
5. Phone in a pocket, 10 min of recording: real fps at the end, glasses and phone temperature, battery.
6. «Automático»: two sessions in a row. Check that the second starts at what the first suggested.

Report the default profile that holds 24 fps with 0 gaps in 3, 4 and 5.
