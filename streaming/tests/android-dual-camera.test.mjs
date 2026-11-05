// Android two-camera capture: source contract against the shared JS plan.
// Static checks only; they do not prove that any phone records two cameras. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pipLayout, toCameraXComposition } from '../../core/multicam-plan.mjs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const dir = '../android/app/src/main/java/com/oswhgo/wivra/';
const activity = read(dir + 'WivraDualCameraActivity.kt');
const policy = read(dir + 'WivraMulticamPolicy.kt');
const policyTest = read('../android/app/src/test/java/com/oswhgo/wivra/WivraMulticamPolicyTest.kt');
const main = read(dir + 'MainActivity.java');
const manifest = read('../android/app/src/main/AndroidManifest.xml');

test('two cameras only from a pair reported by this phone, otherwise one camera', () => {
  assert.match(activity, /availableConcurrentCameraInfos/);
  assert.match(activity, /CameraSelector\.DEFAULT_BACK_CAMERA\.filter\(infos\)/);
  assert.match(activity, /CameraSelector\.DEFAULT_FRONT_CAMERA\.filter\(infos\)/);
  assert.match(activity, /SingleCameraConfig\(pair\.first\.cameraSelector/);
  assert.match(activity, /CompositionSettings\.Builder\(\)/);
  // Bind failure falls back instead of crashing the screen.
  assert.match(activity, /catch \(_: Exception\) \{\s*\/\/ IllegalArgumentException \/ UnsupportedOperationException/);
  assert.match(activity, /R\.string\.dual_camera_single_fallback/);
  assert.match(activity, /R\.string\.dual_camera_bind_failed/);
  assert.doesNotMatch(activity, /isMultiCamSupported\s*=\s*true|dual\s*=\s*true\s*\/\/\s*assume/);
});

test('PiP numbers come from the policy that mirrors core/multicam-plan.mjs', () => {
  const js = toCameraXComposition(pipLayout({ corner: 'bottom-right', scale: 0.3, margin: 0.04, frameWidth: 1080, frameHeight: 1920 }));
  assert.match(policyTest, new RegExp(`assertEquals\\(${js.offsetX}f, c\\.offsetX`));
  assert.match(policyTest, new RegExp(`assertEquals\\(${js.offsetY}f, c\\.offsetY`));
  assert.match(activity, /WivraMulticamPolicy\.composition\(WivraMulticamPolicy\.pipRect\(corner\)\)/);
  assert.match(activity, /\.setScale\(c\.scale, c\.scale\)/, 'same scale on both axes: no stretched inset');
  assert.match(policy, /fun next\(\): Corner/);
});

test('camera loss closes the take, keeps bytes and continues with the remaining camera', () => {
  assert.match(activity, /cameraInfo\.cameraState\.observe\(this\)/);
  assert.match(activity, /CameraState\.ErrorType\.CRITICAL/);
  assert.match(activity, /recording\.stop\(\) \/\/ Finalize continues with the remaining camera\./);
  assert.match(activity, /startRecording\(continuation = true\)/);
  assert.match(activity, /WivraCaptureMediaVerifier\.verifyFile\(take\.file, root\)/);
  // Only a zero-byte placeholder may be deleted.
  const deletes = [...activity.matchAll(/\.delete\(\)/g)].length;
  assert.equal(deletes, 2);
  assert.match(activity, /if \(file\.isFile && file\.length\(\) == 0L\) file\.delete\(\)/);
  assert.match(activity, /TakeStatus\.EMPTY && bytes == 0L\) take\.file\.delete\(\)/);
  assert.match(policy, /bytes <= 0L -> TakeStatus\.EMPTY/);
  // Leaving the screen stops cleanly and never auto-restarts.
  assert.match(activity, /override fun onStop\(\) \{[\s\S]*?continueWith = null[\s\S]*?it\.stop\(\)/);
});

test('one audio source, microphone only with permission; takes stay private until saved', () => {
  assert.match(activity, /if \(wantSound && hasPermission\(Manifest\.permission\.RECORD_AUDIO\)\)\s*pending\.withAudioEnabled\(\) else pending/);
  assert.equal([...activity.matchAll(/withAudioEnabled/g)].length, 1);
  assert.doesNotMatch(activity, /AudioRecord|WivraPhoneWavRecorder/);
  assert.match(activity, /WivraPhoneMediaStore\.createPrivateVideo\(this\)/);
  assert.match(activity, /WivraPhoneMediaStore\.publish\(this, take\.file\)/);
  assert.doesNotMatch(activity, /http:|https:|putExtra\(|SharedPreferences/);
});

test('reached only from the native camera chooser, not exported', () => {
  assert.match(main, /getString\(R\.string\.source_dual_option\)/);
  assert.match(main, /selected == 2 && hasPhoneCameraHardware\(\)/);
  assert.match(main, /new Intent\(this, WivraDualCameraActivity\.class\)/);
  assert.match(manifest, /android:name="\.WivraDualCameraActivity" android:exported="false"/);
});
