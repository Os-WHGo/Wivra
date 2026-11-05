# Wivra W73 · iOS accelerated export cold-recovery catalogue

## Scope and source

Stacked on W72 PR #181, which itself contains W71 QA codec matrix, W70 write-once capture receipts, W69 dual-camera recovery and W68 integration of Claude + Codex. This block changes **only** the iOS private v2 accelerated-export discovery and associated QA. No renderer, timeline, stable MediaRecorder fallback, camera, LIVE, Ray-Ban, Photos or Android implementation is replaced.

## Bug addressed

The previous `WivraAcceleratedExportStore.recovered()` applied `urls.prefix(200)` to **all items in the directory** before checking whether an entry was actually a generated completed `Wivra_Fast_<UUID>.mp4`. Temporary files, unrelated local exports or malformed names could exhaust that budget, making an existing verified export invisible to the recovery library after relaunch.

The scan also accepted a verified AVFoundation report and a SHA-256 hash when the size matched its initial observation, without checking whether the on-disk file's modification stamp had changed during codec inspection or hashing.

## W73 implementation

- Filter filenames to **exact generated UUID MP4 names**, regular, nonempty, non-symlink files that resolve within the canonical private directory, within the existing maximum-size bound.
- Order eligible candidates by descending modification time, using filename only as a deterministic tie break. Limit to the latest **200 eligible candidates**, not first 200 arbitrary directory members.
- Snapshot file size and modification time before AVFoundation track/codec verification, recheck after that asynchronous step and again after SHA-256 readback. Discard changed files; do not attempt to repair, overwrite, publish to Photos or delete them.
- Preserve existing native H.264/AAC compatibility checks, verified audio/video duration/seek index, SHA-256 computation and local-only recovery behavior.
- Add 270 unrelated / invalid-name entries to the existing real H.264/AAC macOS Swift 6 recovery smoke and require the legitimate completed MP4 to remain discoverable.
- Add Node source contracts to the macOS native build gate so future changes cannot accidentally reintroduce the unfiltered `urls.prefix(200)` scan or remove freshness rechecks.

## Explicit evidence limits

An unchanged size and modification timestamp is a conservative freshness check against ordinary concurrent edits, **not** a cryptographic immutable-file guarantee against malicious same-size/same-time rewriting. AVFoundation inspection of the actual MP4 plus a SHA-256 of the read bytes remain necessary. An iPhone process can still be interrupted during scanning. The QA proof is native compilation + macOS fixture, **not** physical iOS testing.

### Remaining acceptance

1. Check exact-head Node and Swift regression workflows, and iOS Simulator/generic arm64 **compile only**.
2. During the owner-authorized iPhone milestone, cold-launch with 200+ irrelevant private files and multiple valid completed exports; verify newest files appear and can actually be opened/played.
3. Test interruption during recovery, low-storage situations, verified primary and secondary mic routes, existing Photos add-only behavior and repeat scan without duplicates or missing media.
4. Keep WebCodecs + Mediabunny selected but experimental. `ACCELERATED_EXPORT_IMPLEMENTED=false` and stable MediaRecorder remain unchanged until full real-device AVC/AAC, multitrack and recovery acceptance.

No APK/IPA, physical installation, app signing, paid services, upload of user media, `main` merge or permission changes in W73.
