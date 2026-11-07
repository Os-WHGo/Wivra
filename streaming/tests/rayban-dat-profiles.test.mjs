// Ray-Ban Meta macroblock (Claude): shared stream profiles, «Automático» and private diagnostics.
// The Kotlin JVM test and the Swift macOS smoke run the same vectors (streaming/contracts/dat-profiles.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const v = JSON.parse(read('streaming/contracts/dat-profiles.json'));
const kt = read('streaming/android/app/src/main/java/com/oswhgo/wivra/WivraDatProfiles.kt');
const sw = read('streaming/ios/B0/Sources/WivraDatProfiles.swift');
const preview = read('streaming/android/app/src/main/java/com/oswhgo/wivra/WivraMetaPreviewActivity.kt');
const service = read('streaming/android/app/src/main/java/com/oswhgo/wivra/WivraCaptureForegroundService.kt');
const model = read('streaming/ios/B0/Sources/MetaB0Model.swift');
const app = read('streaming/ios/B0/Sources/WivraMetaB0App.swift');

test('profiles use only the SDK-documented sizes and frame rates (DAT 1.0.1)', () => {
  const sizes = new Set(['720x1280', '504x896', '360x640']), fps = new Set([2, 7, 15, 24, 30]);
  for (const p of v.profiles) {
    assert.ok(sizes.has(p.width + 'x' + p.height), p.id);
    assert.ok(fps.has(p.fps), p.id);
  }
  assert.equal(v.default, 'balanced');
  for (const p of v.profiles) assert.match(kt, new RegExp(`${p.id.toUpperCase()}\\("${p.id}", ${p.width}, ${p.height}, ${p.fps}\\)`));
  assert.match(sw, /case economy, balanced, motion, detail, max/);
});

test('both phones offer the same choices, «Automático» included', () => {
  for (const id of ['balanced', 'motion', 'detail', 'max', 'economy', 'auto']) {
    assert.ok(app.includes(`.tag("${id}")`), 'iPhone ' + id);
    assert.ok(preview.includes(`"${id}"`) || (id === 'auto' && preview.includes('WivraDatProfile.AUTO')), 'Android ' + id);
  }
  assert.match(preview, /videoQuality = datQuality\(profile\), frameRate = profile\.fps,/);
  assert.match(service, /videoQuality = datQuality\(profile\),\s*frameRate = profile\.fps,/);
  assert.match(model, /resolution: profile == \.economy \? \.low : \(profile == \.detail \|\| profile == \.max\) \? \.high : \.medium/);
});

test('a profile change restarts the camera, so it is only offered — never applied while recording or live', () => {
  assert.match(preview, /if \(recordingMode \|\| WivraCaptureForegroundService\.isCaptureActive\(\)\) return/);
  assert.match(preview, /if \(offer != null && !recording\)/);
  assert.match(model, /guard let next = datSuggestion, !recordingArmed, !recordingFinishing, camera != nil else \{ return \}/);
  assert.match(app, /if let tip = model\.datSuggestion, !model\.recordingArmed/);
  for (const src of [kt, sw]) assert.match(src, /never goes to 720p by itself|never goes to 720p by itself/);
});

test('diagnostics keep only times, sizes and byte counts: no pictures, nothing stored or sent', () => {
  for (const src of [kt, sw]) {
    assert.doesNotMatch(src, /URLSession|HttpURLConnection|upload|Bitmap|UIImage|SharedPreferences|UserDefaults|Log\.|print\(/);
    assert.match(src, /600/);      // bounded history
  }
  assert.match(preview, /@Volatile var lastDatObserved: WivraDatAuto\.Observed\? = null/);
  assert.match(model, /nonisolated\(unsafe\) static var lastDatObserved: WivraDatAuto\.Observed\?/);
});
