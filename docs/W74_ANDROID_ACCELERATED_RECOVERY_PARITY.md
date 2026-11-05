# Wivra W74 · Android private accelerated recovery: candidate and freshness safety

## Source and scope

Stacked on W73 PR #182 HEAD `7ef7fc5e7026d3783ec9215687e7556dd3fe07db`. Android `WivraRandomExportStore.recovered()` only, plus new JVM filesystem tests. Preserve the W68 combined Claude/Codex editor, multicam, Ray-Ban and LIVE, W69–W70 iOS capture recovery, W71 codec matrix, W72 long export tests and W73 iOS catalogue. No changes to Android recording, MediaStore publication/restore, native transport, or export encoder.

The faster WebCodecs + Mediabunny engine remains selected; `ACCELERATED_EXPORT_IMPLEMENTED=false` and the stable MediaRecorder fallback remain unchanged.

## Problems addressed

- The Android `recovered()` scanner sorted and capped at 100 files after only a cheap name check, permitting empty files, symlinks, arbitrary-length/unreadable files, and other invalid directory entries to occupy a slot and hide a good sealed export.
- `validateSealed` probed Android tracks and computed SHA-256 but did not recheck its initial file length/mtime after codec inspection and hashing. A modified file could be catalogued using stale inspection data.

## W74

- `recoveryCandidates(folder, limit)` selects only ordinary regular, locally contained, non-symlinked, nonempty and in-budget sealed Wivra filename candidates before the 100-item cap, sorted by modification time (newest first). The cap is not user-configurable above 100.
- `validateSealed` takes a size/time stamp, checks it after Android multimedia inspection and again after SHA-256 reading, and rejects unreadable/changing media rather than offering a possibly stale recovery record. Any filesystem exception is a safe refusal.
- The validation does **not** delete, overwrite, publish or modify a sealed file. `restore` retains its existing explicit user-action gate, independent MediaStore copy verification and duplicate checks.
- New JVM regression tests exercise 240 unrelated files, 35 partial/malformed Wivra names, newest-first order, a symlink, empty files and limit refusal.

## Evidence boundary

The expected Android CI jobs are native full/Capture compile, Gradle JVM unit tests and instrumentation test **compilation only**. Synthetic fixture bytes are deliberately not decodable videos. A successful CI run proves the selector and compilation, not Android WebView AVC/AAC compatibility, hardware recording, actual long export or runtime MediaStore availability.

On the owner-authorized beta milestone, physically test 100+ private files, crash/cold restart, changing/insufficient storage, recovered audio/video and `restoreRecovered` duplicate protection; check exact media duration, sound, seeking and permissions. Do not record credentials or private media in CI.

No signing, APK/IPA, installation, emulator, production activation, changes to `main` or user media deletion are included.
