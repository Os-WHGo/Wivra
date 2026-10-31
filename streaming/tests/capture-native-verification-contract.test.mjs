// Source wiring contracts; functional samples/decode/readback are tested natively. — ChatGPT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const android = 'android/app/src/main/java/com/oswhgo/wivra/';

test('Android verifies native samples and decoded boundaries before Ray-Ban publication', () => {
  const source = read(android + 'WivraCaptureMediaVerifier.kt');
  assert.match(source, /readSampleData/);
  assert.match(source, /getFrameAtTime/);
  assert.match(source, /Files\.isSymbolicLink/);
  assert.match(source, /file\.canonicalFile\.parentFile != allowedRoot\.canonicalFile/);
  assert.doesNotMatch(source, /\.delete\(|\.renameTo\(|openOutputStream/);
  const publish = read(android + 'WivraHevcMp4Recorder.kt').split('fun publishPending(')[1];
  assert.ok(publish.indexOf('WivraCaptureMediaVerifier.verifyFile(') < publish.indexOf('resolver.insert('));
});

test('private sources are synced and re-read before gallery visibility and deletion', () => {
  const copy = read(android + 'WivraMediaCopy.kt');
  assert.ok(copy.indexOf('output.fd.sync()') < copy.indexOf('resolver.openInputStream(destination)'));
  assert.match(copy, /WivraVerifiedCopy\.verify\(it, digest\)/);
  const measure = read(android + 'WivraVerifiedCopy.kt');
  assert.match(measure, /MessageDigest\.getInstance\("SHA-256"\)/);
  assert.match(measure, /measure\(input\) != expected/);
  assert.doesNotMatch(copy + measure, /\.delete\(/);
});

test('iOS grouped keep verifies every MOV and CAF, preserves ticket on rejection', () => {
  const store = read('ios/B0/Sources/WivraPendingRecordingStore.swift');
  const keep = store.slice(store.indexOf('static func keep('), store.indexOf('static func discardConfirmed('));
  assert.match(keep, /async throws/);
  assert.match(keep, /for name in stored\.files/);
  assert.match(keep, /await WivraCaptureMediaVerifier\.verifyFile/);
  assert.match(keep, /WivraCaptureMediaVerifier\.verifyAudioFile\(url, in: folder\)/);
  assert.ok(keep.indexOf('await WivraCaptureMediaVerifier') < keep.indexOf('removeItem(at: marker)'));
  const verifier = read('ios/B0/Sources/WivraCaptureMediaVerifier.swift');
  assert.match(verifier, /copyNextSampleBuffer/);
  assert.match(verifier, /generator\.image\(at:/);
  assert.doesNotMatch(verifier, /removeItem|moveItem|write\(to:/);
});

test('Director persists a multipart save attempt before the first gallery publication', () => {
  const activity = read(android + 'WivraMetaPreviewActivity.kt');
  const begin = activity.indexOf('freshPublication = WivraDirectorSaveJournal.begin(');
  const publish = activity.indexOf('WivraHevcMp4Recorder.publishPending(', begin);
  assert.ok(begin > 0 && publish > begin);
  assert.match(activity, /else if \(freshPublication && pending\.id !in directorPartialSaves\)/);
  const ledger = read(android + 'WivraDirectorSaveJournal.kt');
  assert.match(ledger, /if \(sessionId in pending\) return@synchronized false/);
  assert.match(ledger, /\.commit\(\)/);
});

test('Ray-Ban publication stages a durable reusable copy receipt before visibility and source cleanup', () => {
  const source = read(android + 'WivraHevcMp4Recorder.kt').split('fun publishPending(')[1];
  assert.ok(source.indexOf('WivraCapturePublicationReceipt.recover(') < source.indexOf('resolver.insert('));
  const stage = source.indexOf('WivraCapturePublicationReceipt.stage(');
  const visible = source.indexOf('put(MediaStore.Video.Media.IS_PENDING, 0)', stage);
  assert.ok(stage > 0 && visible > stage && source.indexOf('local.delete()', stage) > visible);
  const receipt = read(android + 'WivraCapturePublicationReceipt.kt');
  assert.match(receipt, /OWNER_PACKAGE_NAME/);
  assert.match(receipt, /StandardCopyOption\.ATOMIC_MOVE/);
  assert.match(receipt, /source\.inputStream\(\)\.use \{ WivraVerifiedCopy\.verify/);
  assert.match(receipt, /resolver\.openInputStream\(uri\)\?\.use \{ WivraVerifiedCopy\.verify/);
});

test('native verifyFile bridges are scoped to the bundled main frame and matching session', () => {
  const bridge = read(android + 'WivraCaptureVerificationBridge.kt');
  assert.match(bridge, /!isMainFrame/);
  assert.match(bridge, /view\.url != WivraExportBridge\.EDITOR_URL/);
  assert.match(bridge, /wivra_rayban_\$\{id\}_part/);
  assert.match(bridge, /WivraCaptureMediaVerifier\.verifyFile/);
  assert.match(bridge, /io\.shutdownNow\(\)/);
  const ios = read('ios/B0/Sources/WivraEditorNativeBridge.swift');
  assert.match(ios, /case "capture\.verifyFile":/);
  assert.match(ios, /message\.frameInfo\.isMainFrame/);
  assert.match(ios, /Wivra_Meta_\\\(id\)_part/);
});
