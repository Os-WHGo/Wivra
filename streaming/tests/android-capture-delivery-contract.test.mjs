import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

test('both Android flavors compile and publish their own APK', () => {
  const workflow = read('.github/workflows/unified-android-build.yml');
  assert.match(workflow, /:app:assembleFullDebug :app:assembleCaptureDebug/);
  assert.match(workflow, /name: WivraCapture-RayBan-DEBUG[\s\S]*?path: streaming\/android\/app\/build\/outputs\/apk\/capture\/debug\/app-capture-debug\.apk/);
  assert.match(workflow, /name: WivraUnifiedAndroid-DEBUG[\s\S]*?path: streaming\/android\/app\/build\/outputs\/apk\/full\/debug\/app-full-debug\.apk/);
  assert.doesNotMatch(workflow, /outputs\/apk\/debug\/app-debug\.apk/);
});

test('standalone Capture opens Meta camera rather than the editor', () => {
  const manifest = read('streaming/android/app/src/capture/AndroidManifest.xml');
  assert.match(manifest, /android:name="\.MainActivity" tools:node="remove"/);
  assert.match(manifest, /android:name="\.WivraMetaPreviewActivity"/);
  assert.match(manifest, /android.intent.category.LAUNCHER/);
});

test('locking screen does not explicitly stop DAT recording', () => {
  const activity = read('streaming/android/app/src/main/java/com/oswhgo/wivra/WivraMetaPreviewActivity.kt');
  const onStop = activity.split('override fun onStop()')[1]?.split('private fun button(')[0];
  assert.ok(onStop);
  assert.doesNotMatch(onStop, /stopAll\(|finishRecording\(|session\?\.stop\(/);
});

test('Activity destruction transfers HEVC recorder ownership before cleanup', () => {
  const activity = read('streaming/android/app/src/main/java/com/oswhgo/wivra/WivraMetaPreviewActivity.kt');
  const destroy = activity.split('override fun onDestroy()')[1];
  assert.ok(destroy);
  const transfer = destroy.indexOf('recorder = null');
  const finalize = destroy.indexOf('unfinished.finishToPending()');
  const cleanup = destroy.indexOf('stopAll()');
  assert.ok(transfer >= 0 && transfer < cleanup);
  assert.ok(finalize >= 0 && finalize < cleanup);
  assert.match(destroy, /collector\?\.cancelAndJoin\(\)/);
});

test('foreground connected-device notification is declared and tied to recording', () => {
  const manifest = read('streaming/android/app/src/main/AndroidManifest.xml');
  const service = read('streaming/android/app/src/main/java/com/oswhgo/wivra/WivraCaptureForegroundService.kt');
  const activity = read('streaming/android/app/src/main/java/com/oswhgo/wivra/WivraMetaPreviewActivity.kt');
  assert.match(manifest, /FOREGROUND_SERVICE_CONNECTED_DEVICE/);
  assert.match(manifest, /foregroundServiceType="connectedDevice"/);
  assert.match(service, /startForeground\(NOTIFICATION_ID, notification\)/);
  assert.match(service, /START_NOT_STICKY/);
  assert.match(activity, /startForegroundService\(Intent\(this,/);
  assert.match(activity, /stopService\(Intent\(this, WivraCaptureForegroundService::class.java\)\)/);
});
