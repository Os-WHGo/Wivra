// W91 (Claude): ready-made LIVE standby screens on Android and iPhone, through the existing image scene.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { presetById } from '../../core/live-scenes.mjs';
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('the standby card uses the image scene, whose microphone is muted', () => {
  assert.equal(presetById('image').micMuted, true);
  const kt = read('streaming/android/app/src/full/java/com/oswhgo/wivra/WivraLiveSceneController.kt');
  assert.match(kt, /WivraStandbyCard\.render\(activity\.getString\(messages\[which\]\)/);
  assert.match(kt, /select\("image"\)/);
  const sw = read('streaming/ios/B0/Sources/WivraLiveScenes.swift');
  assert.match(sw, /await scenes\.load\(imageData: data\)\s*\n\s*await scenes\.select\("image"\)/);
  assert.doesNotMatch(read("streaming/android/app/src/full/java/com/oswhgo/wivra/WivraStandbyCard.kt"), /java\.net|HttpURLConnection|OkHttp|https?:\/\//);      // no network
});

test('standby texts in 8 languages on both platforms', () => {
  const keys = ['scene_standby', 'scene_standby_starting', 'scene_standby_brb', 'scene_standby_thanks', 'scene_standby_footer', 'scene_standby_ready'];
  for (const d of ['values', 'values-en', 'values-pt', 'values-fr', 'values-de', 'values-it', 'values-ja', 'values-zh']) {
    const x = read(`streaming/android/app/src/main/res/${d}/strings.xml`);
    for (const k of keys) { const m = new RegExp(`<string name="${k}">([^<]+)</string>`).exec(x); assert.ok(m, `${d} ${k}`); assert.doesNotMatch(m[1], /(^|[^\\])'/, `${d} ${k}`); }
  }
  for (const l of ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'zh']) {
    const x = read(`streaming/ios/B0/Resources/${l}.lproj/Localizable.strings`);
    for (const k of ['ios.live.standby', 'ios.live.standby_starting', 'ios.live.standby_brb', 'ios.live.standby_thanks', 'ios.live.standby_footer'])
      assert.match(x, new RegExp(`"${k.replace(/\./g, '\\.')}" = "[^"]+";`), `${l} ${k}`);
  }
});
