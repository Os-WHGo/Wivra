// Wivra FULL Android Screen/App LIVE: security and media-source contracts.
// These do not substitute real MediaProjection, app audio, RTMP or device tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL('../../'+p, import.meta.url), 'utf8');
const activity=read('streaming/android/app/src/full/java/com/oswhgo/wivra/WivraScreenLiveActivity.kt');
const service=read('streaming/android/app/src/full/java/com/oswhgo/wivra/WivraScreenLiveService.kt');
const fullManifest=read('streaming/android/app/src/full/AndroidManifest.xml');
const baseManifest=read('streaming/android/app/src/main/AndroidManifest.xml');
const shell=read('streaming/android/app/src/main/java/com/oswhgo/wivra/MainActivity.java');

test('screen/app capture is FULL only and foreground-service typed for Android 14+',()=>{
  assert.match(fullManifest,/android\.permission\.FOREGROUND_SERVICE_MEDIA_PROJECTION/);
  assert.match(fullManifest,/android:name="\.WivraScreenLiveService"/);
  assert.match(fullManifest,/android:foregroundServiceType="mediaProjection"/);
  assert.match(fullManifest,/android:name="\.WivraScreenLiveActivity"/);
  assert.match(fullManifest,/android:exported="false"/);
  assert.doesNotMatch(baseManifest,/WivraScreenLiveService|FOREGROUND_SERVICE_MEDIA_PROJECTION/);
  assert.match(shell,/"com\.oswhgo\.wivra"\.equals\(getPackageName\(\)\)/);
  assert.match(shell,/LIVE · pantalla o aplicación/);
  assert.match(shell,/setClassName\(this, "com\.oswhgo\.wivra\.WivraScreenLiveActivity"\)/);
});
test('one fresh Android MediaProjection consent controls each LIVE session',()=>{
  assert.match(activity,/ActivityResultContracts\.StartActivityForResult\(\)/);
  assert.match(activity,/manager\.createScreenCaptureIntent\(\)/);
  assert.match(activity,/result\.resultCode != Activity\.RESULT_OK/);
  assert.match(activity,/WivraScreenLiveService\.offer\(result\.resultCode, permission, address\)/);
  assert.match(activity,/setTitle\("Confirmar LIVE público de pantalla"\)/);
  assert.match(activity,/setPositiveButton\("Elegir pantalla"\)/);
  assert.match(activity,/No se transmite la pantalla/);
  assert.match(service,/val request = claim\(\)/);
  assert.match(service,/offered = null/);
  assert.match(service,/return START_NOT_STICKY/);
  assert.match(service,/startForeground\(/);
  assert.match(service,/ServiceInfo\.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION/);
  const s=service.split('ACTION_START -> {')[1]?.split('else -> {')[0];
  assert.ok(s && s.indexOf('startForeground(') < s.indexOf('beginProjection(request)'));
  assert.match(service,/manager\.getMediaProjection\(/);
});
test('RootEncoder sends real screen video without camera, other-app audio or microphone',()=>{
  assert.match(service,/ScreenSource\(applicationContext, oneUseProjection, revoked\)/);
  assert.match(service,/NoVideoSource\(\), NoAudioSource\(\)/);
  assert.match(service,/prepareVideo\(640, 480, 1_200_000, fps = 24, rotation = 90\)/);
  assert.match(service,/setForceRender\(true, 15\)/);
  assert.match(service,/stream\.changeVideoSource\(/);
  assert.match(service,/stream\.startStream\(request\.rtmpUrl\)/);
  assert.match(service,/override fun onConnectionSuccess\(\)/);
  assert.doesNotMatch(service,/MediaRecorder|Camera2Source|InternalAudioSource|MicrophoneSource|startRecord\(/);
});
test('projection revocation always ends screen sharing, no reuse or stealth background',()=>{
  assert.match(service,/override fun onStop\(\)/);
  assert.match(service,/Android canceló la captura de pantalla/);
  assert.match(service,/projection\?\.stop\(\)/);
  assert.match(service,/stream\.stopStream\(\)/);
  assert.match(service,/stopForeground\(STOP_FOREGROUND_REMOVE\)/);
  assert.match(service,/\.setOngoing\(true\)/);
  assert.match(service,/Detener pantalla LIVE/);
  assert.match(service,/ACTION_STOP/);
  assert.match(activity,/setAction\(WivraScreenLiveService\.ACTION_STOP\)/);
  assert.match(activity,/onStop\(\)[\s\S]*?handler\.removeCallbacks\(statusPoller\)/);
  assert.doesNotMatch(service,/START_STICKY|BOOT_COMPLETED/);
});
test('credentials are memory-only and LIVE confirms actual ingest',()=>{
  assert.match(activity,/WindowManager\.LayoutParams\.FLAG_SECURE/);
  assert.match(activity,/isSaveEnabled = false/);
  assert.match(activity,/importantForAutofill = android\.view\.View\.IMPORTANT_FOR_AUTOFILL_NO/);
  assert.match(service,/private var offered: Launch\? = null/);
  assert.match(service,/!WivraLiveEndpoint\.valid\(url\)/);
  assert.match(activity,/Intent\(this, WivraScreenLiveService::class\.java\)/);
  assert.match(service,/onConnectionStarted\(url: String\)/);
  assert.match(service,/onConnectionFailed\(reason: String\)/);
  assert.match(service,/if \(!active \|\| stopping\) return@post/);
  assert.match(service,/streaming = true/);
  assert.match(service,/No existe copia local/);
  assert.doesNotMatch(service,/SharedPreferences|println\(|Log\.|saveVideo\(|upload\(/);
  assert.doesNotMatch(activity,/putExtra\(|SharedPreferences|onSaveInstanceState|Log\./);
});
