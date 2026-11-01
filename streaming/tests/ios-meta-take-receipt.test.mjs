// Metadata integrity contracts for long Meta Gen2 HEVC recording recovery.
// Source contracts supplement macOS Swift compiler checks and physical QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const receipt = read('../ios/B0/Sources/WivraSegmentedTakeReceipt.swift');
const recorder = read('../ios/B0/Sources/WivraSegmentedHEVCRecorder.swift');
const model = read('../ios/B0/Sources/MetaB0Model.swift');
const joiner = read('../ios/B0/Sources/WivraSegmentedCaptureJoiner.swift');
const catalog = read('../ios/B0/Sources/WivraNativeCaptureLibrary.swift');
const pending = read('../ios/B0/Sources/WivraPendingRecordingStore.swift');

test('writer persists an atomic private receipt after every segment has finished', () => {
  assert.match(recorder, /private struct StopSnapshot/);
  assert.match(recorder, /expectedParts: partIndex/);
  assert.match(recorder, /rotationFailed = true/);
  assert.match(recorder, /lastTakeReceiptURL: URL\?/);
  assert.match(recorder, /snapshot\.jobs\.count == snapshot\.expectedParts/);
  assert.match(recorder, /files\.count == snapshot\.expectedParts/);
  assert.match(recorder, /files\.enumerated\(\)\.allSatisfy/);
  assert.match(recorder, /!snapshot\.rotationFailed/);
  assert.match(recorder, /lastFailure == nil && !hadEmptyPart && everyPartPresent/);
  const stop = recorder.split('func stop() async -> WivraRecordingResult')[1];
  const finalWait = stop.indexOf('for job in snapshot.jobs');
  const ledgerWrite = stop.indexOf('WivraSegmentedTakeReceipt.write(');
  assert.ok(finalWait >= 0 && ledgerWrite > finalWait,
    'receipt must be written AFTER all AVAssetWriter finalizations');
  assert.match(receipt, /try JSONEncoder\(\)\.encode\(record\)\.write\(to: fileURL, options: \.atomic\)/);
});

test('receipt rejects missing, partial, invalid or tampered segment sequences', () => {
  assert.match(receipt, /schemaVersion: Int/);
  assert.match(receipt, /expectedParts: Int/);
  assert.match(receipt, /savedFiles: \[String\]/);
  assert.match(receipt, /fullyFinalized: Bool/);
  assert.match(receipt, /"Wivra_Meta_" \+ receipt\.sessionID/);
  assert.match(receipt, /receipt\.fullyFinalized/);
  assert.match(receipt, /receipt\.savedFiles\.count == receipt\.expectedParts/);
  assert.match(receipt, /name == prefix \+ "_part" \+ String\(format: "%04d", index \+ 1\) \+ "\.mov"/);
  assert.match(receipt, /info\.isRegularFile == true, info\.isSymbolicLink != true/);
  assert.match(receipt, /\(info\.fileSize \?\? 0\) > 0/);
  assert.match(receipt, /size > 0, size <= 128 \* 1024/);
  assert.match(receipt, /fileURL\(for video: URL\) -> URL\?/);
  assert.match(pending, /static func completionReceiptURL\(for video: URL\) -> URL\?/);
  assert.match(pending, /lastPathComponent == "WivraRecordings"/);
  assert.match(receipt, /WivraPendingRecordingStore\.completionReceiptURL\(for: video\)/);
  assert.doesNotMatch(receipt, /URLSession|PHPhotoLibrary|delete|removeItem/);
});

test('pending consent owns the receipt and recovery cannot silently release a subset', () => {
  assert.match(model, /segmentedRecorder\.lastTakeReceiptURL/);
  assert.match(model, /related: urls \+ manifests \+ \[receipt\]\.compactMap/);
  assert.match(model, /WivraSegmentedTakeReceipt\.verifiedComplete\(for: first\)/);
  const keep = model.split('func keepPendingRecording() async {')[1]
    ?.split('func requestPendingDiscard()')[0];
  assert.ok(keep, 'explicit Keep entrypoint must exist');
  const kept = keep.indexOf('try await WivraPendingRecordingStore.keep(entry)');
  const verify = keep.indexOf('WivraSegmentedTakeReceipt.verifiedComplete');
  const join = keep.indexOf('WivraSegmentedCaptureJoiner.joinConfirmed(partURLs)');
  assert.ok(kept >= 0 && verify > kept && join > verify);
  assert.match(keep, /&& canPublishEntireTake/);
  assert.match(pending, /completionReceiptURL\(for: first\)/);
  assert.match(pending, /related\.append\(receipt\)/);
  assert.match(pending, /try\? stage\(videoURL: first, related: related\)/);
});

test('auto-joining, retry and Photos require a fully finalized take receipt', () => {
  assert.match(joiner, /WivraSegmentedTakeReceipt\.verifiedComplete\(for: ordered\[0\]\)/);
  const save = catalog.split('private func maySaveToPhotos(')[1]
    ?.split('private func retryJoin(')[0];
  assert.ok(save);
  assert.match(save, /WivraSegmentedTakeReceipt\.verifiedComplete\(for: video\)/);
  assert.match(save, /parts\.count == 1/);
  assert.match(catalog, /WivraSegmentedTakeReceipt\.verifiedComplete\(for: video\) \{/);
  assert.match(catalog, /wivra_library_incomplete_take/);
  assert.match(catalog, /ios\.capture\.take_not_finalized/);
  assert.match(catalog, /wivra_capture_library_save_photos/);
});

test('incomplete take warning is translated to every native language', () => {
  for (const lang of ['es','en','fr','pt','de','it','ja','zh']) {
    const strings = read('../ios/B0/Resources/' + lang + '.lproj/Localizable.strings');
    assert.ok(strings.includes('"ios.capture.take_not_finalized" = "'),lang);
  }
});
