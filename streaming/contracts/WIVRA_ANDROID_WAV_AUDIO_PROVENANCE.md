# Android WAV microphone provenance

Part of the existing Wivra #121 capture and audio scope.

## Reason
Earlier Android WAV v2 manifests wrote `tracks[0].source = "android-phone-mic"` even if Android had routed the recording to an external microphone. The source field must reflect observed routing, not the selected device label.

## Contract
- The WAV recorder observes Android AudioRecord routing during successful reads.
- A manually selected route that changes makes the WAV unusable, as in #130.
- Automatic routing that changes during capture is recorded as `android-mixed-input`.
- Source labels are limited to built-in, wired, USB, Bluetooth, mixed and unknown Android input. Unknown is never assumed to mean the phone mic.
- Only the coarse source category is saved in the existing version-2 capture manifest. No device names or identifiers are saved.
- Embedded MP4 audio is unaffected. This does not establish Ray-Ban microphone support or hardware-accurate audio/video synchronization.
- The user still chooses whether to publish captured media.

## Physical QA outstanding
Record with built-in and external Android microphone inputs, inspect the version-2 source, and check WAV/MP4 playback. Disconnect an explicitly selected external microphone while recording and verify the WAV is rejected without losing the pending MP4. Switch automatic input during recording and check mixed-source reporting. Test an unsupported route and confirm unknown-source reporting.

Node contract tests and Android build checks do not replace testing on actual devices.
