// W95 (Claude), issue #95: remembered local-copy choice for LIVE (always / ask / never); the store keeps only the mode name.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('Android: the store writes only the mode name; the LIVE screen itself persists nothing', () => {
  const pref = read('streaming/android/app/src/main/java/com/oswhgo/wivra/WivraLiveArchivePreference.kt');
  const puts = [...pref.matchAll(/putString\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(puts, ['MODE, mode.stored']);
  assert.match(pref, /ALWAYS\("always"\), ASK\("ask"\), NEVER\("never"\)/);
  const live = read('streaming/android/app/src/full/java/com/oswhgo/wivra/WivraPhoneLiveActivity.kt');
  assert.doesNotMatch(live, /SharedPreferences|getSharedPreferences/);
  assert.match(live, /localCopyOption\.isEnabled = archiveMode\.checkboxEditable && !initiatedByUser/);
  assert.match(live, /localCopyOption\.isEnabled = archiveMode\.checkboxEditable      \/\/ W95/);
});

test('iPhone: the store writes only the mode name; the toggle follows always/never', () => {
  const pref = read('streaming/ios/B0/Sources/WivraLiveArchivePreference.swift');
  assert.match(pref, /UserDefaults\.standard\.set\(value\.rawValue, forKey: mode\)/);
  assert.equal((pref.match(/UserDefaults\.standard\.set\(/g) || []).length, 1);
  const sw = read('streaming/ios/B0/Sources/WivraIPhoneLiveScreen.swift');
  assert.doesNotMatch(sw, /UserDefaults/);
  assert.match(sw, /\.disabled\(!archiveMode\.toggleEditable \|\|/);
  assert.match(sw, /archiveVideo = mode\.initiallyOn/);
});

test('texts in 8 languages', () => {
  for (const d of ['values', 'values-en', 'values-pt', 'values-fr', 'values-de', 'values-it', 'values-ja', 'values-zh']) {
    const x = read(`streaming/android/app/src/main/res/${d}/strings.xml`);
    for (const k of ['plive_archive_button', 'plive_archive_title', 'plive_archive_always', 'plive_archive_ask', 'plive_archive_never']) {
      const m = new RegExp(`<string name="${k}">([^<]+)</string>`).exec(x); assert.ok(m, `${d} ${k}`); assert.doesNotMatch(m[1], /(^|[^\\])'/, `${d} ${k}`);
    }
  }
});
