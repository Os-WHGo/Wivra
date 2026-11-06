// W99 (Claude, owner decision 2A): Android screen recording WITHOUT streaming.
// Source contracts only; real MediaProjection/encoder behaviour needs a phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL('../../'+p, import.meta.url), 'utf8');
const dir = 'streaming/android/app/src/';
const service = read(dir+'full/java/com/oswhgo/wivra/WivraScreenRecordService.kt');
const activity = read(dir+'full/java/com/oswhgo/wivra/WivraScreenRecordActivity.kt');
const store = read(dir+'main/java/com/oswhgo/wivra/WivraPhoneMediaStore.kt');
const fullManifest = read(dir+'full/AndroidManifest.xml');
const baseManifest = read(dir+'main/AndroidManifest.xml');
const shell = read(dir+'main/java/com/oswhgo/wivra/MainActivity.java');

test('full edition only, never exported, typed foreground service', () => {
  assert.match(fullManifest, /android:name="\.WivraScreenRecordActivity"\s+android:exported="false"/);
  assert.match(fullManifest, /android:name="\.WivraScreenRecordService"\s+android:exported="false"\s+android:foregroundServiceType="mediaProjection\|microphone"/);
  assert.doesNotMatch(baseManifest, /WivraScreenRecord/);
  assert.match(shell, /final boolean screenRecord = "com\.oswhgo\.wivra"\.equals\(getPackageName\(\)\)/);
  assert.match(shell, /selected == 3 && screenRecord/);
});

test('nothing is transmitted: no stream start, no network, no upload', () => {
  assert.doesNotMatch(service, /startStream\(|WivraLiveEndpoint|rtmps?:|upload\(|HttpURLConnection|Socket\(/);
  assert.doesNotMatch(activity, /startStream\(|EditText|rtmps?:/);
  assert.match(service, /stream\.startRecord\(/);
  assert.match(service, /stream\.stopRecord\(\)/);
});

test('one fresh consent per recording, kept in memory, started in the right order', () => {
  assert.match(activity, /manager\.createScreenCaptureIntent\(\)/);
  assert.match(activity, /result\.resultCode != Activity\.RESULT_OK/);
  assert.match(activity, /WivraScreenRecordService\.offer\(result\.resultCode, permission, withMic,/);
  assert.doesNotMatch(activity, /putExtra\(|SharedPreferences|onSaveInstanceState|Log\./);
  assert.doesNotMatch(service, /SharedPreferences|Log\.|println\(|START_STICKY\b|BOOT_COMPLETED/);
  assert.match(service, /val request = claim\(\)/);
  const start = service.split('ACTION_START -> {')[1]?.split('else -> stopRecording')[0];
  assert.ok(start && start.indexOf('startForeground(') < start.indexOf('beginRecording('));
  assert.match(service, /return START_NOT_STICKY/);
  assert.match(service, /FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION/);
  assert.match(service, /if \(withMic\) types = types or ServiceInfo\.FOREGROUND_SERVICE_TYPE_MICROPHONE/);
  assert.match(service, /request\.withMic && micGranted/);
});

test('microphone only when chosen; no other-app audio or camera', () => {
  assert.match(service, /if \(request\.withMic\) stream\.changeAudioSource\(MicrophoneSource\(\)\)/);
  assert.doesNotMatch(service, /InternalAudioSource|AudioPlaybackCapture|Camera2Source|MediaRecorder/);
  assert.match(service, /RecordController\.RecordTracks\.VIDEO/);
});

test('every stop closes the file and keeps it privately for Save / Later / Delete', () => {
  assert.match(service, /override fun onStop\(\)/);                          // Android revoked the capture
  assert.match(service, /R\.string\.srec_stopped_by_android/);
  assert.match(service, /R\.string\.srec_stopped_space/);
  assert.match(service, /mustStopForSpace\(/);
  assert.match(service, /override fun onDestroy\(\)/);
  assert.match(service, /WivraPhoneMediaStore\.createPrivateVideo\(this\)/);
  assert.match(service, /WivraPhoneMediaStore\.markWriting\(target\)/);
  assert.match(service, /WivraPhoneMediaStore\.doneWriting\(written\)/);
  assert.match(service, /stopForeground\(STOP_FOREGROUND_REMOVE\)/);
  assert.match(service, /\.setOngoing\(true\)/);
  // Saving needs the person's choice and a verified MP4; deleting needs a confirmation.
  assert.match(activity, /WivraCaptureMediaVerifier\.verifyFile\(file, file\.parentFile!!\)\.valid/);
  assert.match(activity, /check\(verified\(file\)\) \{ "MP4 changed before save" \}\s*WivraPhoneMediaStore\.publish\(this, file\)/);
  assert.match(activity, /R\.string\.plive_delete_confirm_title/);
  assert.match(activity, /WivraPhoneMediaStore\.pendingVideos\(this\)/);       // recovery after a crash
});

test('a file still being written is never offered, saved or deleted elsewhere', () => {
  assert.match(store, /it\.length\(\) > 0L && !isWriting\(it\)/);
  assert.equal((store.match(/require\(!isWriting\(privateVideo\)\) \{ "Still being recorded" \}/g) || []).length, 2);
});

test('every new text exists in the eight languages', () => {
  const keys = [...new Set([...service.matchAll(/R\.string\.(srec_\w+)/g), ...activity.matchAll(/R\.string\.(srec_\w+)/g)].map(m => m[1]))];
  keys.push('source_screen_record_option');
  assert.ok(keys.length > 30);
  for (const d of ['values','values-en','values-pt','values-fr','values-de','values-it','values-ja','values-zh']) {
    const xml = read(dir+'main/res/'+d+'/strings.xml');
    for (const k of keys) assert.match(xml, new RegExp('name="'+k+'"'), d+' '+k);
  }
});
