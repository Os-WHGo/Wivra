// W88 (Claude): Android camera «Pro» parity with iPhone: exposure ± and an experimental night photo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const act = read('streaming/android/app/src/main/java/com/oswhgo/wivra/WivraPhoneCameraActivity.kt');

test('exposure uses CameraX compensation inside the phone range; night photo needs MANUAL_SENSOR', () => {
  assert.match(act, /cameraControl\.setExposureCompensationIndex\(next\)/);
  assert.match(act, /WivraCameraProPolicy\.stepIndex\(state\.exposureCompensationIndex, delta, range\.lower, range\.upper\)/);
  assert.match(act, /REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR/);
  assert.match(act, /nightButton\.visibility = if \(plan != null\) View\.VISIBLE else View\.GONE/);
});

test('night photo: only for one photo, never during video, automatic exposure restored afterwards', () => {
  assert.match(act, /if \(nightOn && plan != null && activeRecording == null && !recordingFinishing\)/);
  assert.match(act, /CONTROL_AE_MODE, CaptureRequest\.CONTROL_AE_MODE_OFF/);
  assert.equal((act.match(/if \(night\) clearNight\(\)/g) || []).length, 2);        // saved and error paths
  assert.match(act, /phone_camera_night_not_during_video/);
});

test('every new text exists in the 8 languages', () => {
  const keys = ['phone_camera_ev_minus', 'phone_camera_ev_plus', 'phone_camera_ev_unsupported', 'phone_camera_night_off', 'phone_camera_night_on', 'phone_camera_night_hint', 'phone_camera_night_unsupported', 'phone_camera_night_not_during_video'];
  for (const d of ['values', 'values-en', 'values-pt', 'values-fr', 'values-de', 'values-it', 'values-ja', 'values-zh']) {
    const x = read(`streaming/android/app/src/main/res/${d}/strings.xml`);
    for (const k of keys) {
      const m = new RegExp(`<string name="${k}">([^<]+)</string>`).exec(x); assert.ok(m, `${d} ${k}`);
      assert.doesNotMatch(m[1], /(^|[^\\])'/, `${d} ${k}: an apostrophe must be escaped for Android`);
    }
  }
});
