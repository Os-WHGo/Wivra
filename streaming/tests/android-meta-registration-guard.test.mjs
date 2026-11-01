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
    for (const key of keys) {
      const occurrences = xml.split('name="' + key + '"').length - 1;
      assert.equal(occurrences, 1, folder + ' must have exactly one ' + key);
      assert.match(xml, new RegExp('<string name="' + key + '">[^<]+</string>'));
    }
  }
});
