import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Source contracts for Android/iPhone. These detect a regression in the native
// publication boundary, but do not replace Kotlin/Swift compilation or device QA.
const native = relative => readFileSync(new URL(relative, import.meta.url), 'utf8');

test('Android v2 refuses unexpected or missing audio before atomic sealing', () => {
  const session = native('../android/app/src/main/java/com/oswhgo/wivra/WivraRandomAccessExportSession.kt');
  assert.match(session, /media\.audio\s*!=\s*expectAudio/);
  const audioGuard = session.indexOf('media.audio != expectAudio');
  const seal = session.indexOf('partial.renameTo(completed)');
  assert.ok(audioGuard >= 0 && seal > audioGuard,
    'track parity must be verified before sealing the private MP4');
});

test('Android MediaStore publication checks actual audio track parity', () => {
  const store = native('../android/app/src/main/java/com/oswhgo/wivra/WivraRandomExportStore.kt');
  assert.match(store, /verified\.media\.audio\s*!=\s*gallery\.audio/);
  const actual = store.indexOf('verified.media.audio != gallery.audio');
  const publish = store.indexOf('MediaStore.Video.Media.IS_PENDING, 0');
  assert.ok(actual >= 0 && publish > actual,
    'audio inspection must precede visible MediaStore publication');
});

test('iPhone rejects extra AAC tracks during codec verification and sealing', () => {
  const store = native('../ios/B0/Sources/WivraAcceleratedExportStore.swift');
  const session = native('../ios/B0/Sources/WivraRandomAccessExportSession.swift');
  assert.match(store, /audios\.isEmpty\s*==\s*!expectAudio/);
  assert.match(session, /media\.audio\s*==\s*expectAudio/);
  assert.ok(session.indexOf('media.audio == expectAudio') <
    session.indexOf('FileManager.default.moveItem(at: partial, to: final)'),
    'audio parity must be verified before final private-file move');
});

test('JS v2 receipt requires the exact audio flag and matching native session', () => {
  const sink = native('../../app/accelerated-native-sink.mjs');
  assert.match(sink, /saved\.media\?\.audio\s*!==\s*expectAudio/);
  assert.match(sink, /saved\?\.token\s*!==\s*token/);
});
