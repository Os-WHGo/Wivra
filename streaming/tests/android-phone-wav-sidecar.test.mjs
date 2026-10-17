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
  assert.match(picker,/localStorage\.getItem\('agentcut-shoot-checklist-v1'\)/);
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
