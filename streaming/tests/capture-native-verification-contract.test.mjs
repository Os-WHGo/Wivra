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
  assert.match(keep, /AVAudioFile\(forReading: url\)/);
  assert.ok(keep.indexOf('await WivraCaptureMediaVerifier') < keep.indexOf('removeItem(at: marker)'));
  const verifier = read('ios/B0/Sources/WivraCaptureMediaVerifier.swift');
  assert.match(verifier, /copyNextSampleBuffer/);
  assert.match(verifier, /generator\.image\(at:/);
  assert.doesNotMatch(verifier, /removeItem|moveItem|write\(to:/);
});
