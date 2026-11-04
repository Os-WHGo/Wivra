# Beta acceptance matrix after W49–W55 software work

2026-11-04. This is a software acceptance checklist, not release approval or a
replacement for the operational checkpoint. Keep MediaRecorder as default and
`ACCELERATED_EXPORT_IMPLEMENTED=false`. Preserve the integrated editor/Director,
Capture edition, native capture, Meta DAT, LIVE and existing recovery.

| Area | Source/automated evidence | Acceptance still open |
| --- | --- | --- |
| W49 multipista | Existing source switching, PCM mixes, gain/mute, trims/gaps and native v2 route retained. Fixed same-source concurrent canvas overwrite; real encoded-pixel regression added to browser CI. | Mobile layered-source A/V, resolution and RAM/thermal QA. |
| W50 composition | Shared `drawFrame`; text/filter validation reuses editor contracts. Unsupported transitions, shapes, styles and filter parameters fail closed. | 1080p comparison now covers fade/slide/zoom/crop, shared sources, mixed speed, styled text and circle/border. Remaining: every shape, spatial grain/vignette, safe-zone placement and mobile fonts. Arbitrary project transitions/effects remain rejected. |
| W51 random-write/storage | Existing Android/iOS stores, SHA/duration/audio inspection, MediaStore recovery and Photos journal retained. Native bridge regression passes locally. No new native implementation in this session. | H264/AAC WebView/WKWebView end-to-end and process interruption on actual Android/iOS; Photos/MediaStore permissions and gallery verification. |
| W52 performance | 96 MiB bound on retained RGBA surfaces, decoded dimensions, per-source peak overlap. Existing 10/20/30/60-minute Linux workflow remains mandatory when triggered. | Require complete reports for the exact final SHA. Surface accounting excludes decoder/encoder RAM; Linux RSS/CPU does not measure mobile battery/temperature. |
| W53 phone/Meta capture | Existing contracts executed; no replacement capture prototype. | Real SDK/firmware compatibility, permissions, front/back handoff and background recovery. |
| W53 microphones | Existing internal/external selection, disconnect and permission contracts executed. | Confirm actual input route, Bluetooth/external disconnection and synchronization on devices. |
| W53 LIVE/local recording | Existing RTMP/RTMPS endpoint, consent, source and local-file contracts executed. | Real stream server, reconnect, simultaneous local MP4 integrity, camera/mic changes and interrupted sessions. |
| W53 teleprompter/Director | Existing app/core and capture-import regressions executed. | Full end-user capture/import/export acceptance and physical presentation conditions. |
| W54 failures/security | Snapshot project during async preflight, single render ownership, cancel on setup failure, explicit unsupported-input rejection. No new runtime dependency/service. | Broader dependency/license/permissions review before release; production Mediabunny MPL-2.0 distribution notices; device process-failure acceptance. This session is not a complete security audit. |
| W55 consolidation | Local suite: 1,158 PASS, 0 FAIL, 10 existing TODOs across 1,168 tests. Normal build and isolated offline QA HTML verified. Source and test changes stay in PR #164. | Close final-SHA CI, retain evidence, then request only the outstanding owner-controlled delivery milestone. |

## Evidence boundaries

- Run the normal build before app tests: `node app/build.mjs`.
- Local regression command: `node --test app/tests/*.test.mjs core/tests/*.test.mjs tools/*.test.cjs streaming/tests/*.test.mjs`.
- Real short export regressions: `node tools/browser-multitrack-accelerated.cjs --shared-source`, `--gap`, `--duck`.
- Long export reports require exact frames, audio blocks, duration/seek, scene pixels, voice/music tail, resource samples and zero monitoring errors. Use `tools/accelerated-long-soak-report.cjs` on all four reports.
- Ten existing TODOs remain visible, including physical source handoff and interrupted capture. Passing tests must not be described as all physical acceptance complete.
- Native source compilation, generated web HTML, APK/IPA packaging, installation, physical tests and publication are separate evidence categories. This session generates no APK/IPA and performs no emulator, signing, installation or physical tests.

## Exact next software block

First close CI for the current PR HEAD and repair any failure without weakening
gates. The 1080p montage with shared-source main/inset layers, 0.5x/2x trims,
mic/music/mute, fades, circle/border, captions and gap now passes decoded-pixel
and PCM checks, including cancellation/write failure. Software WebGL color and
9:16/4:5/1:1 output checks plus actual context-loss rejection are also covered.

Continue W50 spatial effects: filtered main and inset together, vignette at
center/corners, time-varying grain, explicit safe-zone caption placement and
context loss during the inset. Check output pixels and reject unavailable GPU
operations. Then validate H264/AAC output on a compatible authorized host and
retain the existing native verification/recovery checks. Device acceptance is
a separate milestone. Preserve the mobile QA ceiling and production gate.
