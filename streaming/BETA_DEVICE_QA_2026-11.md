# Wivra unified beta: physical-device acceptance checklist

Delivery target: before November 19, 2026 (owner instruction, October 30). This checklist is **not** evidence of a passed physical test.

## Build provenance
- [ ] Download `Wivra-BETA-Android-DEBUG-apk` and `Wivra-BETA-Android-SHA256` from the **same** successful workflow run.
- [ ] Verify APK SHA-256 locally before installing.
- [ ] Download `Wivra-BETA-iOS-UNSIGNED-ipa` and `Wivra-BETA-iOS-SHA256` from the same run; verify hash. Unsigned IPA **cannot be installed** until signed by the owner.
- [ ] Record Git SHA, workflow run ID, device model, OS version, app build, date and tester. Never put personal tokens or Meta credentials in GitHub.

## Android full flavor
- [ ] Clean install and launch with no network; editor renders from packaged assets.
- [ ] Create a project, import local video, save, force-close, reopen; verify persistence and media references.
- [ ] Edit timeline and export a short MP4; play with device player and check video/audio synchronization.
- [ ] Record phone-camera video and verify local file, orientation, and playback, if supported in this build.
- [ ] Switch microphones (phone, Bluetooth, USB) where available; document which routes are actually selectable.
- [ ] Test background/lock during capture and after app recreation; log interruptions, **do not assume pocket mode works**.
- [ ] Repeat 5-, 15-, and 30-minute capture/export with battery and thermal observations.

## Ray-Ban Meta / DAT
- [ ] Complete owner-initiated registration and permissions.
- [ ] Connect glasses and confirm real preview frames, stream state and video saved to device.
- [ ] Test 5-, 15-, and 30-minute HEVC segments, MediaStore publication and playback.
- [ ] Interrupt Bluetooth, change phone network, lock/unlock screen and reopen app; verify recovery and pending files.
- [ ] Trigger Meta AI speech during capture; verify whether capture and audio continue, and record any SDK conflicts.
- [ ] Test photo during capture only where SDK allows it; do not mark unsupported combinations as passed.
- [ ] Verify actual audio route and independent audio track, not just UI labels.

## iPhone
- [ ] Obtain valid owner signing/provisioning; install signed app on physical iPhone.
- [ ] Test editor offline, persistence, import, export, orientation, background/lock and local file permissions.
- [ ] Test Ray-Ban connection, camera, audio and Meta AI coexistence on hardware; distinguish simulator success.


## Long Ray-Ban take and export acceptance (P0, NOT YET TESTED)
- [ ] On one phone with registered physical glasses, record a continuous session long enough to create at least 81 numbered parts; note the session ID privately (never add private captures to GitHub).
- [ ] Lock the screen and pocket the phone during an owner-initiated recording; confirm real *finalized* MP4 growth, not merely a foreground-service notification. Unplug/reconnect only in a separate, consented recovery test.
- [ ] Import **40 + 40 + 1** successive original parts into one Director take. Verify exact numeric order, consistent session, all 81 linked assets, saved project, force-close/reopen and all original source files still present.
- [ ] After each batch, play the beginning and last two cuts using the actual device decoder. Verify the 40/41 and 80/81 boundaries, image, audio, duration, orientation, HEVC support, and any silent or frozen frames.
- [ ] Export a short selection, then 10/30/60 minutes only when storage and thermal conditions permit. In the integrated native build, automatic mode writes chunks progressively with a bounded JS queue; the browser and explicitly selected memory mode still accumulate the output. Container repair may need a second on-disk copy. Estimated file size **is not** a measurement of free RAM or proof of export capability.
- [ ] For each exported file, reopen in the device player, seek the first/middle/last 10 seconds, compare video/audio synchronization against originals, verify nonzero audio where expected, check rotation, duration and actual file size. Repeat a reopen after app force-close.
- [ ] Record free storage before/after, export wall clock, memory pressure/crash, thermal behavior and battery drop. Treat a frozen render, corrupt file, silent voice loss, wrong clip order or unexplained app termination as FAIL, not as a warning to ignore.
- [ ] Confirm cancelling an export or running out of storage does not erase, truncate or silently modify the 81 original files. Do not delete source footage to make space.
- [ ] Repeat on iPhone **only after** owner-provided signing and installation. Emulator, Chromium Linux and unsigned IPA checks are separate and cannot satisfy this checklist.

## Progressive export and editor recreation (unverified on physical devices)
- [ ] Confirm automatic mode uses native storage and reports the saved file; separately test the selectable memory fallback on a short clip.
- [ ] Close the editor during an unfinished export and reopen it. Verify its partial file is removed, a new export completes, and previously published exports remain playable.
- [ ] Repeat during rotation/recreation and rapid close/reopen. Cleanup from the previous editor must not cancel the new editor's export. Android serializes all bridge storage operations on one process worker; both platforms scope cancellation by editor owner.
- [ ] Cancel during chunk writing and container finalization. Record whether completion or cancellation won; preserve any verified published output and all original footage. Do not assume a published export can be undone by cancellation.
- [ ] Reopen the saved video outside Wivra and seek first/middle/last frames. Check duration, independent voice/audio and rotation, including when container repair reports a fallback.
- [ ] Test screen lock separately for native capture and for editor export. DAT background capture support does not establish that WebView rendering/export continues while locked.

For audit, record build SHA + run ID, device/OS, 81 source-file count, session identity match, segment-boundary observations, exported container/codec/duration, external-player playability, interruptions and PASS/FAIL. Upload no private footage, credentials or precise location. All checkboxes remain open until actual physical execution.

## LIVE
- [ ] Validate authenticated RTMP/streaming with explicit test destination and consent; verify reconnection, audio and local backup.
- [ ] No production streaming or real platform credentials in CI.

## Release decision
A physical test is PASS only with reproducible evidence (device, OS, commit, steps, output, logs with secrets removed).
A feature without hardware evidence is UNVERIFIED. A failure affecting data loss, corrupted MP4, permissions, or involuntary capture blocks release.
