import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const base='../android/app/src/main/java/com/oswhgo/wivra/';
const recorder=read(base+'WivraPhoneWavRecorder.kt');
const store=read(base+'WivraPhoneMediaStore.kt');
const camera=read(base+'WivraPhoneCameraActivity.kt');
const instrument=read('../android/app/src/androidTest/java/com/oswhgo/wivra/WivraPhoneMediaStoreTest.kt');

test('selected microphone route remains checked after the first WAV buffer',()=>{
  assert.match(recorder,/while \(running\.get\(\)\)/);
  assert.match(recorder,/if \(preferredDevice != null\) \{[\s\S]*?record\.routedDevice/);
  assert.match(recorder,/routed == null \|\| routed\.id != preferredDevice\.id/);
  assert.doesNotMatch(recorder,/if \(!routeChecked && preferredDevice != null\)/);
  assert.match(recorder,/failure = "Selected microphone was not the active input"/);
});

test('RIFF content, PCM specification and finalized matching manifest are all required',()=>{
  assert.match(store,/fun hasUsableWav\(context: Context, video: File\): Boolean/);
  assert.match(store,/!timing\.isFile/);
  assert.match(store,/metadata\.optInt\("schemaVersion"\) < 2/);
  assert.match(store,/metadata\.optString\("originalVideoFile"\) != video\.name/);
  assert.match(store,/metadata\.optString\("originalAudioFile"\) != wav\.name/);
  assert.match(store,/metadata\.optLong\("audioBytes", -1L\) != dataBytes/);
  assert.match(store,/metadata\.optString\("audioStatus", "ready"\)/);
  for(const marker of ['tag(0, "RIFF")','tag(8, "WAVE")','tag(12, "fmt ")',
     'tag(36, "data")','u32(40) == dataBytes','u16(34) == 16']) {
    assert.ok(store.includes(marker),marker);
  }
  assert.match(store,/put\("audioStatus", "ready"\)/);
  assert.match(store,/put\("audioDurationSeconds", audioBytes\.toDouble\(\) \/ 96_000\.0\)/);
  assert.match(instrument,/fun wavRequiresValidManifestAndCompleteRiff\(\)/);
});

test('failed sidecar never forces deletion of a valid video',()=>{
  assert.match(camera,/if \(wav\.exists\(\) && !WivraPhoneMediaStore\.hasUsableWav\(this, file\)\)/);
  assert.match(camera,/setPositiveButton\(R\.string\.phone_camera_save_video_only\)/);
  assert.match(camera,/WivraPhoneMediaStore\.publish\(this, file\)/);
  assert.match(camera,/setNegativeButton\(R\.string\.phone_camera_later, null\)/);
  for(const folder of ['values','values-en','values-fr','values-de','values-it','values-ja']){
    const xml=read('../android/app/src/main/res/'+folder+'/strings.xml');
    for(const key of ['phone_camera_wav_salvage_explanation','phone_camera_save_video_only',
       'phone_camera_video_only_saved']){
      assert.match(xml,new RegExp('<string name="'+key+'">[^<]+<\\/string>'),folder+': '+key);
    }
  }
});
