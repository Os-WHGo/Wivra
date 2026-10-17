import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseManifest, importPlan, planImportOps } from '../../app/capture-manifest.mjs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const dir = '../android/app/src/main/';
const bundle = read(dir+'java/com/oswhgo/wivra/WivraCaptureImport.kt');
const main = read(dir+'java/com/oswhgo/wivra/MainActivity.java');
const android = read(dir+'AndroidManifest.xml');
const paths = read(dir+'res/xml/wivra_import_paths.xml');
const store = read(dir+'java/com/oswhgo/wivra/WivraPhoneMediaStore.kt');
const build = read('../android/app/build.gradle');

test('Saved owner-owned MP4 and WAV are paired, pending recordings never exposed', () => {
  assert.match(bundle,/latestSavedVideos\(context\)/);
  assert.match(bundle,/latestSavedWav\(context\)/);
  assert.match(bundle,/publishedVideoUri/);
  assert.match(bundle,/publishedAudioUri/);
  assert.match(bundle,/optString\("audioStatus"\) != "ready"/);
  assert.match(bundle,/isSymbolicLink/);
  assert.match(bundle,/canonicalFile\.parentFile == privateDir\.canonicalFile/);
  assert.match(store,/OWNER_PACKAGE_NAME/);
  assert.match(store,/IS_PENDING\} = 0/);
});
test('Only a non-exported cache JSON is generated, not media copies or remote URLs', () => {
  assert.match(bundle,/put\("schemaVersion", 2\)/);
  assert.match(bundle,/put\("captureID"/);
  assert.match(bundle,/put\("originalVideoFile", video\.title\)/);
  assert.match(bundle,/put\("originalAudioFile", wav\.title\)/);
  assert.match(bundle,/put\("startOffsetSeconds", offset\)/);
  assert.match(bundle,/arrayOf\(manifestUri, video\.uri, wav\.uri\)/);
  assert.match(bundle,/FileProvider\.getUriForFile/);
  assert.match(bundle,/Files\.createTempFile/);
  assert.match(bundle,/Files\.move/);
  assert.match(bundle,/safeMediaName/);
  assert.doesNotMatch(bundle,/tmp\.copyTo/);
  assert.match(android,/android:exported="false" android:grantUriPermissions="true"/);
  assert.match(paths,/cache-path[^>]+path="wivra-capture-import\/"/);
  assert.match(build,/androidx\.core:core:/);
  assert.doesNotMatch(main,/addJavascriptInterface\(/);
});
test('Multi-selection of capture JSON uses the existing editor, simple choices still work', () => {
  assert.match(main,/accept\.contains\("application\/json"\)/);
  assert.match(main,/FileChooserParams\.MODE_OPEN_MULTIPLE/);
  assert.match(main,/WivraCaptureImport\.bundles\(MainActivity\.this\)/);
  assert.match(main,/R\.string\.picker_phone_capture_bundle/);
  assert.match(main,/completion\.onReceiveValue\(multiChoices\.get\(item\)\)/);
  assert.match(main,/new Uri\[\]\{choices\.get\(item\)\}/);
  assert.match(main,/launchSystemPicker\(params\)/);
});
test('v2 capture manifest preserves native approximate WAV offset in editor timeline', () => {
  const r = parseManifest({schemaVersion:2,captureID:'android-phone:c',
    cameraSource:'android-phone-camerax',audioSource:'android-phone-mic',
    createdAtISO8601:'2026-10-16T23:00:00Z',
    originalVideoFile:'Wivra_Phone_10.mp4',originalAudioFile:'Wivra_Phone_10.wav',
    muxedVideoFile:null,tracks:[{id:'audio-1',kind:'audio',role:'voice_primary',
      source:'android-phone-mic',file:'Wivra_Phone_10.wav',channelCount:1,
      sampleRateHz:48000,channelIndex:null,startOffsetSeconds:0.22}],
    muxedFromTrackIDs:[]});
  assert.equal(r.ok,true,r.errors.join('; '));
  const p=importPlan(r.manifest);
  const ops=planImportOps(p,{videoStart:3,assets:{
    'Wivra_Phone_10.mp4':{id:'v',duration:10},
    'Wivra_Phone_10.wav':{id:'a',duration:9}}});
  assert.deepEqual(ops.ops.map(x=>x.op),['add_clip','add_audio_clip']);
  assert.equal(ops.ops[1].start,3.22);
  assert.equal(ops.skipped.length,0);
});

test('Android API source uses supported Files.write byte arrays, not unavailable writeString',()=>{
 const mediaStore=read(dir+'java/com/oswhgo/wivra/WivraPhoneMediaStore.kt');
 assert.match(bundle,/Files\.write\(tmp, manifest\.toString\(\)\.toByteArray\(Charsets\.UTF_8\)\)/);
 assert.match(mediaStore,/Files\.write\(tmp, data\.toString\(2\)\.toByteArray\(Charsets\.UTF_8\)\)/);
 assert.doesNotMatch(bundle,/Files\.writeString/);
 assert.doesNotMatch(mediaStore,/Files\.writeString/);
});

test('Editor contract retains selected USB mic identity and negative WAV offset',()=>{
 const manifest=parseManifest({schemaVersion:2,captureID:'usb-audio-recording',
  cameraSource:'android-phone-camerax',audioSource:'android-usb-mic',
  selectedInputName:'USB microphone',createdAtISO8601:'2026-10-16T23:00:00Z',
  originalVideoFile:'Wivra_Phone_20.mp4',originalAudioFile:'Wivra_Phone_20.wav',
  muxedVideoFile:null,tracks:[{id:'audio-1',kind:'audio',role:'voice_primary',
    source:'android-usb-mic',inputName:'USB microphone',file:'Wivra_Phone_20.wav',
    channelCount:1,sampleRateHz:48000,channelIndex:null,startOffsetSeconds:-0.13}],
  muxedFromTrackIDs:[]});
 assert.equal(manifest.ok,true,manifest.errors.join('; '));
 assert.equal(manifest.manifest.tracks[0].source,'android-usb-mic');
 assert.equal(manifest.manifest.tracks[0].inputName,'USB microphone');
 const plan=importPlan(manifest.manifest);
 const r=planImportOps(plan,{videoStart:0,assets:{
   'Wivra_Phone_20.mp4':{id:'v',duration:9},
   'Wivra_Phone_20.wav':{id:'a',duration:9}}});
 assert.deepEqual([r.ops[1].start,r.ops[1].in],[0,0.13]);
});

test('Missing or JSON-null input name does not become a fake string "null" on Android',()=>{
 assert.match(bundle,/if \(raw\.isNull\("selectedInputName"\)\) null else/);
 assert.match(bundle,/val safeInput: Any = inputName \?: JSONObject\.NULL/);
 assert.match(bundle,/put\("inputName", safeInput\)/);
 assert.match(bundle,/put\("selectedInputName", safeInput\)/);
});

test('Unified Android assembly actually executes MediaStore capture instrumentation on an emulator',()=>{
 const workflow=read('../../.github/workflows/wivra-complete-beta-assembly.yml');
 assert.match(workflow,/android-media-emulator:/);
 assert.match(workflow,/needs: android-beta/);
 assert.match(workflow,/api-level: 35/);
 assert.match(workflow,/ReactiveCircus\/android-emulator-runner@[0-9a-f]{40}/);
 assert.match(workflow,/adb install -r \.ci\/media-app\/app-debug\.apk/);
 assert.match(workflow,/adb install -r \.ci\/media-tests\/app-debug-androidTest\.apk/);
 assert.match(workflow,/com\.oswhgo\.wivra\.WivraPhoneMediaStoreTest/);
 assert.match(workflow,/Wivra-Android-MediaStore-Emulator-Results/);
 assert.doesNotMatch(workflow,/continue-on-error: true/);
});
