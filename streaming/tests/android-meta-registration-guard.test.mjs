import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const activity = read('../android/app/src/main/java/com/oswhgo/wivra/WivraMetaPreviewActivity.kt');

test('DAT registration result is driven by Meta SDK state, not the return from startRegistration', () => {
  assert.match(activity, /Wearables\.registrationState\.collect \{ state ->/);
  assert.match(activity, /RegistrationState\.REGISTERED -> \{/);
  assert.match(activity, /RegistrationState\.REGISTERING ->/);
  assert.match(activity, /Wearables\.startRegistration\(this\)/);
  assert.match(activity, /delay\(45_000L\)/);
  assert.match(activity, /Wearables\.registrationState\.value != RegistrationState\.REGISTERED/);
  assert.doesNotMatch(activity, /Wearables\.reset\(\)/);
  assert.doesNotMatch(activity, /startUnregistration\(/);
});

test('already registered and in-progress registration never restart Meta AI companion consent', () => {
  const register = activity.split('private fun registerMeta() {')[1]?.split('private fun beginSession() {')[0];
  assert.ok(register, 'registration action must exist');
  assert.match(register, /RegistrationState\.REGISTERED\) \{[\s\S]*?return/);
  assert.match(register, /RegistrationState\.REGISTERING\) \{[\s\S]*?return/);
  assert.ok(register.indexOf('RegistrationState.REGISTERING') <
    register.indexOf('Wearables.startRegistration(this)'), 'skip duplicate registration before opening companion');
});

test('registered does not imply physical glasses are still paired or discoverable', () => {
  const connect = activity.split('private fun beginSession() {')[1]?.split('Wearables.createSession(AutoDeviceSelector())')[0];
  assert.ok(connect, 'session action must exist');
  assert.match(connect, /Wearables\.registrationState\.value != RegistrationState\.REGISTERED/);
  assert.match(connect, /Wearables\.devices\.value\.isEmpty\(\)/);
  assert.match(connect, /meta_registered_no_devices/);
  assert.doesNotMatch(connect, /stopAll\(|clearUserData\(|delete\(/);
});

test('eight Android translations describe registration and no-glasses diagnostics', () => {
  const keys = [
    'meta_registration_in_progress', 'meta_registration_complete', 'meta_registration_stalled',
    'meta_registration_required', 'meta_registered_no_devices'
  ];
  for (const folder of ['values','values-en','values-fr','values-pt','values-de','values-it','values-ja','values-zh']) {
    const xml = read('../android/app/src/main/res/' + folder + '/strings.xml');
    const warning = xml.match(/<string name="meta_registration_stalled">([^<]+)<\/string>/)?.[1];
    assert.ok(warning?.includes('45'), folder + ' must show the actual 45-second diagnostic period');
    for (const key of keys) {
      const occurrences = xml.split('name="' + key + '"').length - 1;
      assert.equal(occurrences, 1, folder + ' must have exactly one ' + key);
      const value = xml.match(new RegExp('<string name="' + key + '">([^<]+)</string>'))?.[1];
      assert.ok(value, folder + ' missing literal ' + key);
      // AAPT2 treats an unescaped straight apostrophe as invalid inside values XML.
      // Use U+2019 for localized apostrophes to avoid AAPT2 parser errors.
      assert.ok(!value.includes("'"), folder + ' requires typographic apostrophes in DAT diagnostics: ' + key);
    }
  }
});


test('Meta AI registration Activity survives orientation changes while awaiting companion callback', () => {
  const manifest = read('../android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android:name="\.WivraMetaPreviewActivity" android:exported="false"\s+android:configChanges="orientation\|screenSize\|keyboardHidden"/);
  assert.match(activity, /override fun onStop\(\)[\s\S]*?super\.onStop\(\)/);
});


test('Android DAT capability readiness follows current devices and real frames instead of guessed glasses generations', () => {
  assert.match(activity, /Wearables\.devices\.collect \{/);
  assert.match(activity, /availableDevicesJob = scope\.launch/);
  assert.match(activity, /connectButton\.isEnabled = sdkReady[\s\S]*?Wearables\.devices\.value\.isNotEmpty\(\)/);
  assert.match(activity, /private fun updateDatCapabilityStatus\(\)/);
  assert.match(activity, /val freshFrame = stream\?\.state\?\.value == StreamState\.STREAMING/);
  assert.match(activity, /photoButton\.isEnabled = stream\?\.state\?\.value == StreamState\.STREAMING/);
  assert.match(activity, /SystemClock\.elapsedRealtime\(\) - lastFrameReceivedMs <= 4_000L/);
  assert.match(activity, /Servicio DAT grabando; verificar fragmentos MP4 al finalizar/);
  assert.match(activity, /Display, gestos y generaciones nuevas: pendientes de validar/);
  assert.doesNotMatch(activity, /if \(device\.name.*Gen ?3/);
});
