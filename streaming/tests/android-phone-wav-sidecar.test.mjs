import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const base='../android/app/src/main/java/com/oswhgo/wivra/';
const wav=read(base+'WivraPhoneWavRecorder.kt');
const store=read(base+'WivraPhoneMediaStore.kt');
const camera=read(base+'WivraPhoneCameraActivity.kt');
const picker=read(base+'MainActivity.java');

test('native offline PCM16 WAV contains a correct bounded RIFF writer',()=>{
  assert.match(wav,/class WivraPhoneWavRecorder/);
  assert.match(wav,/const val SAMPLE_RATE = 48000/);
  assert.match(wav,/CHANNEL_IN_MONO/);
  assert.match(wav,/ENCODING_PCM_16BIT/);
  assert.match(wav,/AudioRecord/);
  assert.match(wav,/RandomAccessFile/);
  assert.match(wav,/WAVEfmt /);
  assert.match(wav,/wav\.writeBytes\("RIFF"\)/);
  assert.match(wav,/wav\.writeBytes\("data"\)/);
  assert.match(wav,/MAX_DATA_BYTES = 2_000_000_000L/);
  assert.match(wav,/SystemClock\.elapsedRealtimeNanos\(\)/);
  assert.match(wav,/AtomicBoolean/);
  assert.doesNotMatch(wav,/https?:\/\/|socket|Retrofit|OkHttp|BillingClient/);
});

test('WAV and MP4 modes are exclusive, never double-claim the phone mic',()=>{
  assert.match(camera,/private var micMode = 0/);
  assert.match(camera,/micMode = \(micMode \+ 1\) % 3/);
  assert.match(camera,/if \(micMode == 1\) pending\.withAudioEnabled\(\) else pending/);
  assert.match(camera,/wavWasRequested = micMode == 2/);
  assert.match(camera,/if \(wavWasRequested && !recordingFinishing\)/);
  assert.match(camera,/startSidecarWav\(privateVideo\)/);
  assert.match(camera,/wavRecorder\?\.stop\(\)/);
  assert.match(camera,/R\.string\.phone_camera_mic_wav/);
  assert.match(camera,/if \(!videoFinalized \|\| !wavFinalized\) return/);
});

test('WAV stays private until user explicitly saves the pair',()=>{
  assert.match(store,/fun privateWav\(context: Context, video: File\): File/);
  assert.match(store,/privateWav\(context, privateVideo\)/);
  assert.match(store,/fun publishPair\(context: Context, video: File\): SavedPair/);
  assert.match(store,/put\(MediaStore\.MediaColumns\.IS_PENDING, 1\)/);
  assert.match(store,/put\(MediaStore\.MediaColumns\.IS_PENDING, 0\)/);
  assert.match(store,/MediaStore\.Audio\.Media\.EXTERNAL_CONTENT_URI/);
  assert.match(store,/MediaStore\.Video\.Media\.EXTERNAL_CONTENT_URI/);
  assert.match(store,/audioUri\?\.let \{ resolver\.delete\(it, null, null\) \}/);
  assert.match(store,/videoUri\?\.let \{ resolver\.delete\(it, null, null\) \}/);
  assert.match(store,/val wavGone = !wav\.exists\(\) \|\| wav\.delete\(\)/);
  assert.match(camera,/WivraPhoneMediaStore\.hasUsableWav\(this, file\)/);
  assert.match(camera,/WivraPhoneMediaStore\.publishPair\(this, file\)/);
  assert.match(camera,/WivraPhoneMediaStore\.publish\(this, file\)/);
  assert.match(camera,/R\.string\.recording_discard_confirm_title/);
});

test('Sidecar sync is explicitly approximate, never sample-accurate',()=>{
  assert.match(store,/fun saveSidecarTiming\(/);
  assert.match(store,/schemaVersion", 2/);
  assert.match(store,/audioStartOffsetSeconds/);
  assert.match(store,/timebase", "elapsedRealtimeNanos"/);
  assert.match(store,/timestampPrecision", "approximate/);
  assert.match(store,/muxedFromTrackIDs", org\.json\.JSONArray\(\)/);
  assert.match(store,/tracks", org\.json\.JSONArray\(\)\.put/);
  assert.doesNotMatch(store,/frameAccurate=true|hardwareSynchronized=true/);
});

test('Claude editor gets only user-picked published WAV via content URI',()=>{
  assert.match(picker,/if \(accept\.contains\("audio\/"\)\) acceptsAudio = true/);
  assert.match(picker,/WivraPhoneMediaStore\.latestSavedWav\(MainActivity\.this\)/);
  assert.match(picker,/choices\.add\(audio\.getUri\(\)\)/);
  assert.match(picker,/new Uri\[\]\{choices\.get\(item\)\}/);
  assert.match(store,/MediaStore\.Audio\.Media\.IS_PENDING\} = 0/);
  assert.match(store,/MediaStore\.MediaColumns\.OWNER_PACKAGE_NAME/);
  assert.match(store,/if \(title\.startsWith\(PUBLISHED_PREFIX\)/);
  assert.match(picker,/editor\.evaluateJavascript\(readOnly, encoded ->/);
  assert.match(picker,/const plan=typeof shootPlan==='object'\?shootPlan:null/);
  assert.doesNotMatch(picker,/localStorage\.getItem\(/);
  assert.doesNotMatch(picker,/addJavascriptInterface\(/);
});
test('WAV UI text exists in eight Android resource dictionaries',()=>{
  for(const loc of ['values','values-en','values-fr','values-de','values-it','values-ja','values-pt','values-zh']){
    const strings=read('../android/app/src/main/res/'+loc+'/strings.xml');
    for(const key of ['phone_camera_mic_wav','phone_camera_recording_wav',
      'phone_camera_wav_unavailable','phone_camera_wav_failed',
      'phone_camera_wav_unusable','picker_phone_audio_named']){
      assert.match(strings,new RegExp('<string name="'+key+'">[^<]+<\\/string>'));
    }
  }
});

test('pair association survives crashes and never silently loses WAV identity before publication',()=>{
  const idxAssociation=store.indexOf('data.put("publishedVideoUri"');
  const idxWav=store.indexOf('data.put("publishedAudioUri"');
  const idxVisible=store.indexOf('if (resolver.update(videoUri, visible, null, null)');
  const idxDelete=store.indexOf('video.delete()',store.indexOf('fun publishPair('));
  assert.ok(idxAssociation>=0 && idxWav>idxAssociation && idxVisible>idxWav && idxDelete>idxVisible);
  assert.match(store,/Files\.createTempFile\(timingFile\.parentFile\.toPath\(\)/);
  assert.match(store,/StandardCopyOption\.ATOMIC_MOVE/);
  assert.match(store,/Files\.deleteIfExists\(tmp\)/);
  assert.match(store,/require\(timingFile\.isFile && !Files\.isSymbolicLink/);
  assert.match(store,/data\.optString\("audioStatus"\) == "ready"/);
  assert.doesNotMatch(store,/catch \(_:\s*Exception\) \{ \/\* media is already safely published \*\//);
});

test('The WAV manifest retains the explicitly selected route and microphone name',()=>{
 const inputs=read(base+'WivraPhoneAudioInputs.kt');
 const importBundle=read(base+'WivraCaptureImport.kt');
 for(const tag of ['android-phone-mic','android-wired-mic','android-usb-mic','android-bluetooth-mic','android-system-mic']){
   assert.match(inputs,new RegExp('"'+tag+'"'));
   assert.match(importBundle,new RegExp('"'+tag+'"'));
 }
 assert.match(camera,/WivraPhoneAudioInputs\.sourceTag\(chosen\)/);
 assert.match(camera,/chosen\?\.let \{ WivraPhoneAudioInputs\.label\(this, it\) \}/);
 assert.match(store,/put\("audioSource", audioSource\)/);
 assert.match(store,/put\("selectedInputName", selectedInputName \?: org\.json\.JSONObject\.NULL\)/);
 assert.match(store,/put\("source", audioSource\)/);
 assert.match(store,/put\("inputName", selectedInputName \?: org\.json\.JSONObject\.NULL\)/);
 assert.match(importBundle,/put\("source", source\)/);
 assert.match(importBundle,/put\("inputName", safeInput\)/);
 assert.match(importBundle,/put\("selectedInputName", safeInput\)/);
 assert.doesNotMatch(importBundle,/put\("audioSource", "android-phone-mic"\)/);
});

test('Android WAV discovery tolerates system-normalized WAV MIME while retaining app ownership',()=>{
 const fn=store.slice(store.indexOf('fun latestSavedWav('),store.indexOf('fun saveSidecarTiming('));
 assert.match(fn,/Music\/Wivra\//);
 assert.match(fn,/OWNER_PACKAGE_NAME/);
 assert.match(fn,/IS_PENDING/);
 assert.match(fn,/SIZE/);
 assert.match(fn,/PUBLISHED_PREFIX/);
 assert.doesNotMatch(fn,/MediaStore\.Audio\.Media\.MIME_TYPE} = \?/);
 assert.doesNotMatch(fn,/arrayOf\("Music\/Wivra\/", "\$PUBLISHED_PREFIX%", "audio\/wav"/);
});
