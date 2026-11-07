# Wivra beta · journeys A–E: what is verified end to end, and what only works in parts

Claude, 07-11-2026. Rule followed: a journey counts as verified only when **all its steps run chained in one session**; a journey whose steps only pass in separate tests is marked **in parts**. Phone tests (physical) from 16-11 by the owner.

| Journey | Steps | Automatic, chained | Automatic, in parts | Physical (16-11) |
|-|-|-|-|-|
| **A. Normal creation** | Capture → import → edit → audio → subtitles → MP4 → gallery | **Chromium, real editor** (`tools/browser-journey-a.cjs`, Whisper WASM workflow): capture import → Whisper subtitles → 9:16 + title → separate music (the «Audio» button path) → stable export → ffprobe: duration, video + audio, seek, subtitle burned in the picture, music in the sound. **Not included:** «Guardar en galería» (native). | Saving to the gallery: native export tests (Android MediaStore, iPhone Photos journal). | Whole journey on each phone, with MP4 (H.264/AAC) and the gallery. |
| **B. Ray-Ban** | Connect → capture → import parts → recover → edit → export | — (no glasses in CI) | Profiles and «Automático» (JVM + Swift + Node); HEVC parts and recovery; independent WAV, slices and editor import (JVM + contract); the editor accepts the `android-rayban-dat` manifest. | The whole journey with Gen 2, with each microphone. |
| **C. LIVE** | Configure → scenes and audio → start → local MP4 → disconnect/reconnect → finish → recover | — (no RTMP server in CI) | Reconnection policy (core + JVM); scenes; Ray-Ban engine → private MP4 in the emulator (upright, unmirrored); key handling guards. | Phone LIVE and glasses LIVE with a real server: router off for 20 s, keep the copy. |
| **D. Long video** | Long import → progressive processing → Whisper → multitrack → export → check start, middle and end | — | 11-min Whisper (Chromium, Android emulator, iPhone simulator); long accelerated export soak (QA); progressive export. | 30–60 min on each phone: time, heat, storage. |
| **E. Screen recording** | Record without streaming → save → recover → editor → export | **Android emulator** (W105 test, extended): records the screen → the recording is offered for recovery → saved to Movies/Wivra (the real MediaStore publication) → imported into the REAL editor WebView from that saved item → exported with the editor's own Export buttons (native progressive save, verified). | Android emulator records a real MP4 (W105); iPhone writer + «Pasar a Wivra» + editor manifest parser (macOS). | Record 1–2 min of another app on each phone, import, export. |

## Next steps to chain more journeys automatically

- **E on iPhone:** ReplayKit cannot record in the simulator; the chain stays physical there.
- **C:** a local RTMP server inside the CI emulator job (no external network) to test start → server cut → reconnect → private copy.
- **D:** chain the long-subtitle fixture into a multitrack export with start, middle and end checks (Chromium first).
