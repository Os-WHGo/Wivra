import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const activity = read('../android/app/src/main/java/com/oswhgo/wivra/WivraMetaPreviewActivity.kt');

test('Meta AI registration is confirmed by DAT state, never by starting its external activity', () => {
  assert.match(activity, /Wearables\.registrationState\.collect \{ state ->/);
  assert.match(activity, /RegistrationState\.REGISTERED -> \{/);
  assert.match(activity, /RegistrationState\.REGISTERING -> show\(getString\(R\.string\.meta_registration_in_progress\)\)/);
  assert.match(activity, /metaRegistrationWarningJob\?\.cancel\(\)/);
  assert.match(activity, /Wearables\.startRegistration\(this\)/);
  assert.match(activity, /Wearables\.registrationState\.value == RegistrationState\.REGISTERED/);
});

test('a stuck Meta AI registration warns rather than reporting success and leaves retries available', () => {
  assert.match(activity, /delay\(20_000L\)/);
  assert.match(activity, /Wearables\.registrationState\.value != RegistrationState\.REGISTERED/);
  assert.match(activity, /getString\(R\.string\.meta_registration_stalled\)/);
  assert.match(activity, /registerButton\.isEnabled = sdkReady && !serviceRecording/);
  assert.match(activity, /WivraCaptureForegroundService\.isCaptureActive\(\)/);
  assert.match(activity, /scope\.cancel\(\)/);
});

test('registration diagnostics have native strings in all eight Android languages', () => {
  const keys = ['meta_registration_in_progress', 'meta_registration_complete', 'meta_registration_stalled'];
  for (const dir of ['values','values-en','values-fr','values-pt','values-de','values-it','values-ja','values-zh']) {
    const xml = read('../android/app/src/main/res/' + dir + '/strings.xml');
    for (const key of keys) assert.match(xml, new RegExp('<string name="' + key + '">[^<]+</string>'), dir + ' missing ' + key);
  }
});
