// W75 LIVE reconnection: Android (phone + screen) and iPhone follow the shared
// policy; the local MP4 copy is never stopped by a retry; the key is never
// shown or logged. Static checks; no real server involved. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RECONNECT_DELAYS_S } from '../../core/live-reconnect.mjs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const a = '../android/app/src/full/java/com/oswhgo/wivra/';
const phone = read(a + 'WivraPhoneLiveActivity.kt');
const screen = read(a + 'WivraScreenLiveService.kt');
const kt = read(a + 'WivraLiveReconnect.kt');
const ios = read('../ios/B0/Sources/WivraIPhoneLiveScreen.swift');
const swiftPolicy = read('../ios/B0/Sources/WivraLiveReconnectPolicy.swift');
const workflow = read('../../.github/workflows/meta-b0-native-build.yml');

test('same pauses on every platform', () => {
  const list = `${RECONNECT_DELAYS_S.join(', ')}`;
  assert.match(kt, new RegExp(`listOf\\(${list}\\)`));
  assert.match(swiftPolicy, new RegExp(`\\[${list}\\]`));
  assert.match(workflow, /WivraLiveReconnectPolicySmoke\.swift/);
});

test('Android retries with the URL RootEncoder holds, keeping the local copy', () => {
  for (const src of [phone, screen]) {
    assert.match(src, /getStreamClient\(\)\.setReTries\(WivraLiveReconnect\.DELAYS_S\.size\)/);
    assert.match(src, /getStreamClient\(\)\?\.reTry\(delay, reason\)/);
    assert.match(src, /reconnect\.connected\(\)/);
  }
  const retry = phone.slice(phone.indexOf('override fun onConnectionFailed'), phone.indexOf('override fun onDisconnect'));
  const branch = retry.slice(0, retry.indexOf('liveRequested = false'));
  assert.doesNotMatch(branch, /stopRecord|stopAndReview|stopStream/, 'a retry never closes the MP4 copy');
  assert.match(branch, /La copia MP4 local sigue grabando/);
  // Rejected keys still end without retry.
  const auth = phone.slice(phone.indexOf('override fun onAuthError'), phone.indexOf('override fun onAuthSuccess'));
  assert.doesNotMatch(auth, /reTry/);
});

test('iPhone no longer shows "LIVE activo" after a drop: it watches, retries, reports', () => {
  assert.match(ios, /watchConnection\(endpoint, liveConnection, liveStream, current, saveLocalCopy\)/);
  assert.match(ios, /for await event in await connection\.status/);
  assert.match(ios, /if await connection\.connected \{ continue \}/);
  assert.match(ios, /No se pudo recuperar el LIVE tras varios intentos/);
  assert.match(ios, /connectionWatcher\?\.cancel\(\)\s*connectionWatcher = nil\s*onAir = false/);
  const watcher = ios.slice(ios.indexOf('private func watchConnection'), ios.indexOf('private func hasRecordingReserve'));
  assert.doesNotMatch(watcher, /print\(|NSLog|os_log|Logger|recorder|stopRecording/);
  assert.match(swiftPolicy, /"NetConnection\.Connect\.Rejected", "NetConnection\.Connect\.InvalidApp": return \.neverRetry/);
});
