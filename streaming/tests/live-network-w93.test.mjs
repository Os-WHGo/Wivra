// W93 (Claude): LIVE says which network carries the stream and warns about mobile data / metered networks before starting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('Android: the start confirmation includes the network and the data use; no start without Internet', () => {
  const kt = read('streaming/android/app/src/full/java/com/oswhgo/wivra/WivraPhoneLiveActivity.kt');
  assert.match(kt, /if \(route == WivraLiveNetwork\.Route\.OFFLINE\) \{\s*setStatus\(getString\(R\.string\.plive_network_offline\)\)\s*return/);
  assert.match(kt, /WivraLiveNetwork\.warnsAboutData\(route, metered\)/);
  assert.match(kt, /\+ "\\n\\n" \+ networkLine/);
  assert.match(kt, /val liveBps = 1_200_000L \+/);                                     // same bitrate as prepareVideo
  assert.match(kt, /prepareVideo\(\s*640, 480, 1_200_000/);
  assert.doesNotMatch(kt.slice(kt.indexOf('val (route, metered)'), kt.indexOf('val confirmMessage')), /address|endpoint/i);   // the network line never uses the stream address
});

test('iPhone: network line on the LIVE screen and in the confirmation; start disabled offline', () => {
  const sw = read('streaming/ios/B0/Sources/WivraIPhoneLiveScreen.swift');
  assert.match(sw, /@State private var network = WivraPhoneNetworkStatus\(\)/);
  assert.match(sw, /network\.start\(\)/);
  assert.match(sw, /\|\| network\.route == \.offline\)/);
  assert.match(sw, /\+ "\\n\\n" \+ liveNetworkLine\)/);
});

test('texts in 8 languages on both platforms', () => {
  for (const d of ['values', 'values-en', 'values-pt', 'values-fr', 'values-de', 'values-it', 'values-ja', 'values-zh']) {
    const x = read(`streaming/android/app/src/main/res/${d}/strings.xml`);
    for (const k of ['plive_network_wifi', 'plive_network_cellular', 'plive_network_metered', 'plive_network_other', 'plive_network_offline']) {
      const m = new RegExp(`<string name="${k}">([^<]+)</string>`).exec(x); assert.ok(m, `${d} ${k}`); assert.doesNotMatch(m[1], /(^|[^\\])'/, `${d} ${k}`);
      assert.doesNotMatch(m[1], /%\d*\$?s/, `${d} ${k}: numbers only, never the address`);
    }
  }
  for (const l of ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'zh']) {
    const x = read(`streaming/ios/B0/Resources/${l}.lproj/Localizable.strings`);
    for (const k of ['net_wifi', 'net_cellular', 'net_metered', 'net_other', 'net_offline']) assert.match(x, new RegExp(`"ios\\.plive\\.${k}" = "[^"]+";`), `${l} ${k}`);
  }
});
