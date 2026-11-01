import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../ios/B0/Sources/WivraMetaB0App.swift');

test('iPhone never represents experimental lock-screen DAT capture as guaranteed or enabled by default', () => {
  assert.match(app, /experimentalBackgroundMetaCapture = false/);
  assert.match(app, /if !\(experimentalBackgroundMetaCapture && model\.recordingArmed\)/);
  assert.match(app, /model\.endSession\(\)/);
  assert.match(app, /if model\.recordingArmed && !experimentalBackgroundMetaCapture/);
  assert.match(app, /meta_background_capture_off_warning/);
  assert.match(app, /if experimentalBackgroundMetaCapture \{/);
  assert.match(app, /meta_background_capture_limit_warning/);
});

test('all eight iOS languages disclose that locking can interrupt Meta camera streams', () => {
  const keys = ['ios.app.background_capture_toggle',
    'ios.app.background_capture_off_warning',
    'ios.app.background_capture_experimental_warning'];
  for (const key of keys) assert.ok(app.includes('"' + key + '"'));
  for (const lang of ['es', 'en', 'fr', 'pt', 'de', 'it', 'ja', 'zh']) {
    const strings = read('../ios/B0/Resources/' + lang + '.lproj/Localizable.strings');
    for (const key of keys) assert.ok(strings.includes('"' + key + '" = "'), lang + ' missing ' + key);
  }
});


test('selected microphone capture declares audio background mode alongside Meta camera transports', () => {
  const plist = read('../ios/B0/Info.plist');
  const route = read('../ios/B0/Sources/WivraAudioRoute.swift');
  const model = read('../ios/B0/Sources/MetaB0Model.swift');
  const bg = plist.split('<key>UIBackgroundModes</key>')[1]?.split('</array>')[0];
  assert.ok(bg, 'iOS background mode list not declared');
  for (const mode of ['audio', 'processing', 'bluetooth-central', 'bluetooth-peripheral', 'external-accessory'])
    assert.ok(bg.includes('<string>' + mode + '</string>'), 'iOS background mode missing: ' + mode);
  assert.match(route, /setCategory\(\.playAndRecord, mode: \.videoRecording/);
  assert.match(route, /setActive\(true\)/);
  assert.match(model, /var captureSelectedAudio = false/, 'microphone capture must remain opt-in');
});
