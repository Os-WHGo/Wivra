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
  assert.match(live, /setPositiveButton\(R\.string\.plive_start\)/);
  assert.match(live, /setTitle\(R\.string\.plive_confirm_title\)/);
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

test('the optional MP4 is armed before LIVE when selected and kept private until verified', () => {
  assert.ok(live.indexOf('publisher.startRecord(') < live.indexOf('publisher.startStream(address)'));
  assert.match(live, /if \(saveCopy && pending != null\) \{/);
  assert.match(live, /if \(saveCopy\) WivraPhoneMediaStore\.createPrivateVideo\(applicationContext\)/);
  assert.match(live, /publisher\.stopRecord\(\)/);
  assert.match(live, /WivraCaptureMediaVerifier\.verifyFile\(file, file\.parentFile!!\)/);
  assert.match(live, /WivraPhoneMediaStore\.publish\(this@WivraPhoneLiveActivity, file\)/);
  assert.match(live, /withContext\(Dispatchers\.IO\) \{ verifiedMp4\(file\) \}/);
  assert.match(live, /if \(mediaBusy\) return/);
  assert.match(live, /mediaScope\.cancel\(\)/);
  assert.match(live, /WivraPhoneMediaStore\.discard\(this, file\)/);
  assert.match(live, /if \(pending\?\.length\(\) == 0L\) pending\.delete\(\)/);
  assert.match(live, /R\.string\.plive_auth_with_copy/);
  assert.match(live, /R\.string\.plive_failed_copy_continues/);
  assert.match(live, /R\.string\.plive_failed_no_copy/);
});

test('critically low storage closes the local MP4 without unnecessarily ending LIVE', () => {
  assert.match(live, /private val minFreeBytes = 128L \* 1024L \* 1024L/);
  assert.match(live, /if \(saveCopy && applicationContext\.filesDir\.usableSpace < minFreeBytes\)/);
  assert.match(live, /storageHandler\.postDelayed\(storageCheck, 10_000L\)/);
  assert.match(live, /storageHandler\.removeCallbacks\(storageCheck\)/);
  const watchdog = live.split('private val storageCheck = object : Runnable {')[1]
    ?.split('private val cameraPermission')[0];
  assert.ok(watchdog);
  assert.match(watchdog, /if \(saveLocalCopy && stream\?\.isRecording == true/);
  assert.match(watchdog, /finishLocalCopyForLowStorage\(\)/);
  assert.doesNotMatch(watchdog, /stopAndReview\(|stopStream\(/);
  const close = live.split('private fun finishLocalCopyForLowStorage() {')[1]
    ?.split('private fun preparePreview()')[0];
  assert.ok(close);
  assert.match(close, /publisher\.stopRecord\(\)/);
  assert.match(close, /if \(publisher\.isRecording\) \{[\s\S]*stopAndReview\(\)/);
  assert.doesNotMatch(close, /publisher\.stopStream\(\)/);
  assert.doesNotMatch(live, /deleteRecursively\(\)/);
});

test('microphone and public transmission are opt-in, background publishing cannot continue silently', () => {
  assert.match(live, /micOption = CheckBox\(this\)\.apply \{[\s\S]*?isChecked = false/);
  assert.match(live, /val source = Camera2Source\(applicationContext\)/);
  assert.match(live, /RtmpStream\(\s*applicationContext, this,\s*source, NoAudioSource\(\)/);
  assert.match(live, /val microphone = MicrophoneSource\(\)/);
  assert.match(live, /publisher\.changeAudioSource\(\s*if \(withAudio\) microphone else NoAudioSource\(\)/);
  assert.match(live, /if \(input != null && !microphone\.setPreferredDevice\(input\)\) \{/);
  assert.match(live, /micPermission\.launch\(Manifest\.permission\.RECORD_AUDIO\)/);
  assert.match(live, /publisher\.prepareAudio\(44_100, false, 64_000\)/);
  assert.match(live, /RecordController\.RecordTracks\.VIDEO/);
  assert.match(live, /RecordController\.RecordTracks\.ALL/);
  assert.match(live, /override fun onStop\(\) \{[\s\S]*?stopAndReview\(\)/);
  assert.match(live, /if \(stream\?\.isOnPreview == true\) stream\?\.stopPreview\(\)/);
  assert.doesNotMatch(live, /startForegroundService|onConnectionSuccess\(\)[\s\S]*?startStream\(/);
});

test('LIVE preview surface updates visible readiness without auto-starting a public stream', () => {
  const lifecycle = live.split('preview.holder.addCallback(object : SurfaceHolder.Callback {')[1]
    ?.split('if (checkSelfPermission(Manifest.permission.CAMERA)')[0];
  assert.ok(lifecycle, 'SurfaceView callback remains attached');
  assert.match(lifecycle, /override fun surfaceCreated[\s\S]*refreshPreviewReadiness\(\)/);
  assert.match(lifecycle, /preview\.postDelayed\(\{ refreshPreviewReadiness\(\) \}, 400L\)/);
  assert.match(lifecycle, /override fun surfaceDestroyed[\s\S]*plive_preview_waiting/);
  const refresh = live.split('private fun refreshPreviewReadiness() {')[1]
    ?.split('private fun preparePreview()')[0];
  assert.ok(refresh, 'lifecycle readiness helper is present');
  assert.match(refresh, /cameraReadyForLive\(\)/);
  assert.match(refresh, /startButton\.isEnabled = ready/);
  assert.match(refresh, /plive_preview_ready/);
  assert.match(refresh, /plive_preview_waiting/);
  assert.doesNotMatch(refresh, /startStream|startRecord|MicrophoneSource/);
  assert.match(live, /override fun onStart\(\) {[\s\S]*?refreshPreviewReadiness\(\)/);
});
