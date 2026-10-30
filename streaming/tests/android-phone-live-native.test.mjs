import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const load = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const live = load('streaming/android/app/src/full/java/com/oswhgo/wivra/WivraPhoneLiveActivity.kt');
const endpoint = load('streaming/android/app/src/full/java/com/oswhgo/wivra/WivraLiveEndpoint.kt');
const manifest = load('streaming/android/app/src/full/AndroidManifest.xml');
const shell = load('streaming/android/app/src/main/java/com/oswhgo/wivra/MainActivity.java');
const gradle = load('streaming/android/app/build.gradle');
const settings = load('streaming/android/settings.gradle');
const contract = load('streaming/live-preflight.mjs');

test('the full Wivra edition now has a native, Android RTMP publisher behind explicit consent', () => {
  assert.match(live, /RtmpStream\(\s*applicationContext, this,/);
  assert.match(live, /publisher\.prepareVideo\(/);
  assert.match(live, /publisher\.startStream\(address\)/);
  assert.match(live, /setPositiveButton\("Iniciar LIVE"\)/);
  assert.match(live, /"Confirmar emisión pública"/);
  assert.match(manifest, /WivraPhoneLiveActivity/);
  assert.match(shell, /"com\.oswhgo\.wivra"\.equals\(getPackageName\(\)\)/);
  assert.match(shell, /setClassName\(this, "com\.oswhgo\.wivra\.WivraPhoneLiveActivity"\)/);
  assert.match(gradle, /fullImplementation 'com\.github\.pedroSG94\.RootEncoder:library:2\.8\.1'/);
  assert.doesNotMatch(gradle, /captureImplementation 'com\.github\.pedroSG94/);
  assert.match(settings, /https:\/\/jitpack\.io/);
  assert.match(contract, /User must press a native start control/);
});

test('broadcast has no covert or paid backend, and live keys are not stored or logged', () => {
  assert.match(live, /WindowManager\.LayoutParams\.FLAG_SECURE/);
  assert.match(live, /importantForAutofill = android\.view\.View\.IMPORTANT_FOR_AUTOFILL_NO/);
  assert.match(live, /isSaveEnabled = false/);
  assert.match(live, /endpointInput\.text\?\.clear\(\)/);
  assert.doesNotMatch(live, /SharedPreferences|Log\.|println\(|Crashlytics|upload\(/);
  assert.match(endpoint, /uri\.rawUserInfo == null/);
  assert.match(endpoint, /uri\.rawFragment == null/);
  assert.match(endpoint, /in setOf\("rtmp", "rtmps"\)/);
  assert.match(endpoint, /URI\(input\)\.host\?\.take\(120\)/);
});

test('the local MP4 is armed before public transmission and remains private on failure', () => {
  assert.ok(live.indexOf('publisher.startRecord(') < live.indexOf('publisher.startStream(address)'));
  assert.match(live, /WivraPhoneMediaStore\.createPrivateVideo\(applicationContext\)/);
  assert.match(live, /publisher\.stopRecord\(\)/);
  assert.match(live, /MediaMetadataRetriever\.METADATA_KEY_HAS_VIDEO/);
  assert.match(live, /MediaMetadataRetriever\.METADATA_KEY_DURATION/);
  assert.match(live, /WivraPhoneMediaStore\.publish\(this, file\)/);
  assert.match(live, /WivraPhoneMediaStore\.discard\(this, file\)/);
  assert.match(live, /if \(pending\.length\(\) == 0L\) pending\.delete\(\)/);
  assert.match(live, /El servidor rechazó la clave LIVE\. MP4 local continúa/);
  assert.match(live, /La conexión LIVE falló\. La grabación local continúa/);
});

test('public LIVE aborts safely if local storage falls below muxer reserve', () => {
  assert.match(live, /private val minFreeBytes = 128L \* 1024L \* 1024L/);
  assert.match(live, /if \(applicationContext\.filesDir\.usableSpace < minFreeBytes\)/);
  assert.match(live, /storageHandler\.postDelayed\(storageCheck, 10_000L\)/);
  assert.match(live, /storageHandler\.removeCallbacks\(storageCheck\)/);
  assert.match(live, /Espacio bajo\. Deteniendo LIVE para conservar el MP4 local/);
  assert.doesNotMatch(live, /deleteRecursively\(\)/);
});

test('microphone and public transmission are opt-in, background publishing cannot continue silently', () => {
  assert.match(live, /micOption = CheckBox\(this\)\.apply \{[\s\S]*?isChecked = false/);
  assert.match(live, /Camera2Source\(applicationContext\), NoAudioSource\(\)/);
  assert.match(live, /publisher\.changeAudioSource\(\s*if \(withAudio\) MicrophoneSource\(\) else NoAudioSource\(\)/);
  assert.match(live, /micPermission\.launch\(Manifest\.permission\.RECORD_AUDIO\)/);
  assert.match(live, /publisher\.prepareAudio\(44_100, false, 64_000\)/);
  assert.match(live, /RecordController\.RecordTracks\.VIDEO/);
  assert.match(live, /RecordController\.RecordTracks\.ALL/);
  assert.match(live, /override fun onStop\(\) \{[\s\S]*?stopAndReview\(\)/);
  assert.match(live, /if \(stream\?\.isOnPreview == true\) stream\?\.stopPreview\(\)/);
  assert.doesNotMatch(live, /startForegroundService|onConnectionSuccess\(\)[\s\S]*?startStream\(/);
});
