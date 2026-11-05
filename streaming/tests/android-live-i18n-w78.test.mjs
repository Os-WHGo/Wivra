// W78 (Claude): the phone LIVE screen is localized. The safety wording that
// ChatGPT's contracts asserted as Spanish literals is now checked here, on the
// resources, for every launch language. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const res = l => readFileSync(new URL(`../android/app/src/main/res/${l}/strings.xml`, import.meta.url), 'utf8');
const get = (xml, k) => (xml.match(new RegExp(`<string name="${k}">([\\s\\S]*?)</string>`)) || [])[1];
const live = readFileSync(new URL('../android/app/src/full/java/com/oswhgo/wivra/WivraPhoneLiveActivity.kt', import.meta.url), 'utf8');
const screenFiles = ['WivraScreenLiveActivity.kt', 'WivraScreenLiveService.kt']
  .map(f => readFileSync(new URL(`../android/app/src/full/java/com/oswhgo/wivra/${f}`, import.meta.url), 'utf8'));
const langs = ['values', 'values-en', 'values-fr', 'values-de', 'values-it', 'values-pt', 'values-ja', 'values-zh'];

test('no hard-coded Spanish user text remains in the phone LIVE screen', () => {
  assert.doesNotMatch(live, /setStatus\("|text = "|setTitle\("|setMessage\("|setPositiveButton\("|setNegativeButton\("|setNeutralButton\("/);
});

test('safety wording survives localization (Spanish source)', () => {
  const es = res('values');
  assert.equal(get(es, 'plive_confirm_title'), 'Confirmar emisión pública');
  assert.match(get(es, 'plive_confirm_without_copy'), /NO se guardará copia en Wivra/);
  assert.match(get(es, 'plive_confirm_with_copy'), /copia MP4 privada/);
  assert.match(get(es, 'plive_long_live_hint'), /VOD/);
  assert.match(get(es, 'plive_stopped_no_copy'), /VOD/);
  assert.match(get(es, 'plive_failed_copy_continues'), /copia MP4 local continúa/);
  assert.match(get(es, 'plive_reconnect_with_copy'), /sigue grabando/);
  assert.match(get(es, 'plive_delete_confirm_message'), /definitivamente/);
});

test('every language keeps VOD/copy warnings, placeholders and no stream key', () => {
  for (const l of langs) {
    const xml = res(l);
    for (const k of ['plive_confirm_with_copy', 'plive_confirm_without_copy', 'plive_long_live_hint', 'plive_stopped_no_copy']) {
      const v = get(xml, k);
      assert.ok(v && /VOD|回放/.test(v), `${l} ${k} mentions VOD`);
    }
    assert.match(get(xml, 'plive_reconnect_with_copy'), /%1\$d[\s\S]*%2\$d[\s\S]*%3\$d|%3\$d[\s\S]*%1\$d/);
    assert.match(get(xml, 'plive_storage_with_copy'), /%1\$d[\s\S]*%2\$d/);
    assert.doesNotMatch(xml, /rtmps?:\/\/[^<]*\/[^<]*\/[a-z0-9]{8,}/i, 'no example stream key');
  }
});

test('no hard-coded Spanish user text remains in the screen LIVE activity and service', () => {
  for (const src of screenFiles) {
    assert.doesNotMatch(src, /setStatus\("|text = "|setTitle\("|setMessage\("|setPositiveButton\("|setNegativeButton\("|setContentTitle\("|setContentText\("|statusMessage = "[^"]/);
  }
});

test('screen LIVE keeps its safety wording in every language', () => {
  const es = res('values');
  assert.equal(get(es, 'slive_confirm_title'), 'Confirmar LIVE público de pantalla');
  assert.match(get(es, 'slive_permission_cancelled'), /No se transmite la pantalla/);
  assert.match(get(es, 'slive_revoked'), /Android canceló la captura de pantalla/);
  assert.match(get(es, 'slive_notice_revoked_camera'), /permiso nuevo/);
  assert.match(get(es, 'slive_connect_failed'), /No existe copia local/);
  assert.equal(get(es, 'slive_action_stop'), 'Detener pantalla LIVE');
  assert.equal(get(es, 'slive_action_stop_screen'), 'Dejar de compartir pantalla');
  for (const l of langs) {
    const xml = res(l);
    for (const k of ['slive_intro', 'slive_confirm_outro', 'slive_connect_failed']) {
      assert.ok(/VOD|回放/.test(get(xml, k) || ''), `${l} ${k} mentions VOD`);
    }
    for (const k of ['slive_on_air_screen', 'slive_on_air_screen_mic', 'slive_on_air_both', 'slive_on_air_both_mic', 'slive_on_air_camera', 'slive_on_air_camera_mic']) {
      assert.ok(/MP4/.test(get(xml, k) || ''), `${l} ${k} says there is no local MP4`);
    }
  }
});

// iPhone camera LIVE (ChatGPT's WivraIPhoneLiveScreen), localized with ios.plive.* keys.
const iosRoot = new URL('../ios/B0/', import.meta.url);
const iosLive = readFileSync(new URL('Sources/WivraIPhoneLiveScreen.swift', iosRoot), 'utf8');
const strings = l => new Map([...readFileSync(new URL(`Resources/${l}.lproj/Localizable.strings`, iosRoot), 'utf8')
  .matchAll(/^"([^"]+)" = "((?:[^"\\]|\\.)*)";$/gm)].map(m => [m[1], m[2]]));

test('no hard-coded Spanish user text remains in the iPhone LIVE screen', () => {
  assert.doesNotMatch(iosLive, /(?<![A-Za-z])(Text|Button|Toggle|Section|ProgressView|SecureField|navigationTitle|alert)\("|(?<![A-Za-z])status = "|photoMessage = "|confirmationDialog\(\s*"/);
  assert.match(iosLive, /String\(format: wivraLiveText\(saveLocalCopy \? "ios\.plive\.reconnect_copy" : "ios\.plive\.reconnect"\)/);
});

test('iPhone LIVE keeps its safety wording in every language', () => {
  const es = strings('es');
  assert.match(es.get('ios.plive.reconnect_copy'), /La copia MP4 privada sigue grabando/);
  assert.match(es.get('ios.plive.gave_up'), /No se pudo recuperar el LIVE tras varios intentos/);
  assert.match(es.get('ios.plive.stopped_no_copy'), /VOD remoto/);
  assert.match(es.get('ios.plive.unverified_note'), /no se publicará automáticamente/i);
  assert.match(es.get('ios.plive.photos_retry_message'), /la copia local nunca se elimina/);
  for (const l of ['es', 'en', 'fr', 'de', 'it', 'pt', 'ja', 'zh']) {
    const d = strings(l);
    for (const k of ['ios.plive.on_air_no_copy', 'ios.plive.stopped_no_copy', 'ios.plive.key_note', 'ios.plive.confirm_with_copy', 'ios.plive.confirm_without_copy']) {
      assert.ok(/VOD|回放/.test(d.get(k) || ''), `${l} ${k} mentions VOD`);
    }
    assert.match(d.get('ios.plive.reconnect_copy'), /%1\$d[\s\S]*%2\$d|%3\$d[\s\S]*%1\$d/);
    assert.ok(/MP4/.test(d.get('ios.plive.reconnect_copy')), `${l} reconnect keeps the MP4 note`);
    assert.doesNotMatch(d.get('ios.plive.endpoint_placeholder'), /rtmps?:\/\/[^/]+\/[^/]+\/[a-z0-9]{8,}/i, 'placeholder is not a real key');
  }
});
