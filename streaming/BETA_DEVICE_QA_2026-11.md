# Wivra unified beta: physical-device acceptance checklist

Target: November 13, 2026. This checklist is **not** evidence of a passed physical test.

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

## LIVE
- [ ] Validate authenticated RTMP/streaming with explicit test destination and consent; verify reconnection, audio and local backup.
- [ ] No production streaming or real platform credentials in CI.

## Release decision
A physical test is PASS only with reproducible evidence (device, OS, commit, steps, output, logs with secrets removed).
A feature without hardware evidence is UNVERIFIED. A failure affecting data loss, corrupted MP4, permissions, or involuntary capture blocks release.
