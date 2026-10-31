// Cross-agent integration guard: verify shipped HTML and native platform export
// configuration belong to the same source snapshot. Not hardware certification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const strip = s => s.replace(/^import .*$/gm, '')
  .replace(/^export (?=async function|class|function|const|default)/gm, '');

test('shipping editor contains both Claude progressive export and latest capture recovery', () => {
  const html = read('../dist/agentcut.html');
  for (const source of [
    '../export-sink.mjs',
    '../media-container.mjs',
    '../export.mjs',
    '../capture-locked-session.mjs',
    '../capture-journal-store.mjs',
    '../capture-native-verifier.mjs',
    '../capture-native-session.mjs'
  ]) {
    assert.ok(html.includes(strip(read(source))),
      'bundled HTML must contain current source: ' + source);
  }
  assert.doesNotMatch(html, /\/\*__CORE__\*\//);
});

test('native shells retain permission-safe export playback configuration', () => {
  const android = read('../../streaming/android/app/src/main/java/com/oswhgo/wivra/MainActivity.java');
  assert.match(android, /setMediaPlaybackRequiresUserGesture\(false\)/);
  const ios = read('../../streaming/ios/B0/Sources/WivraEmbeddedEditorScreen.swift');
  assert.match(ios, /allowsInlineMediaPlayback = true/);
  assert.match(ios, /mediaTypesRequiringUserActionForPlayback = \[\]/);
  const share = read('../../streaming/ios/B0/Sources/WivraExportNativeBridge.swift');
  assert.match(share, /excludedActivityTypes = \[\.saveToCameraRoll\]/);
});

test('container repair is shared by bundled editor and current JS module', () => {
  const js = read('../media-container.mjs');
  assert.match(js, /mehd/);
  assert.match(read('../dist/agentcut.html'), /mehd/);
  // iOS fragment repair must not change fragmented movie headers in place.
  const swift = read('../../streaming/ios/B0/Sources/WivraMp4Repair.swift');
  assert.match(swift, /mvhd\/tkhd\/mdhd stay as the spec requires/);
});

test('iOS capture picker verifies real media before releasing an existing capture to Director', () => {
  const ios = read('../../streaming/ios/B0/Sources/WivraEmbeddedEditorScreen.swift');
  assert.match(ios, /private func verifiedCaptureURLs\(_ urls: \[URL\]\) async -> \[URL\]\?/);
  assert.match(ios, /Task\.detached\(priority: \.userInitiated\)/);
  assert.match(ios, /await WivraCaptureMediaVerifier\.verifyFile\(file, in: root\)/);
  assert.match(ios, /WivraCaptureMediaVerifier\.verifyAudioFile\(file, in: root\)/);
  assert.match(ios, /let original = declared\["originalVideoFile"\] as\? String/);
  assert.match(ios, /names\.count == urls\.count - 1, names\.contains\(original\)/);
  assert.match(ios, /let checked = await self\?\.verifiedCaptureURLs\(urls\)/);
  assert.match(ios, /self\?\.finishSelection\(checked\)/);
});
