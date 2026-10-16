import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const base='../android/app/src/main/';
const activity=read(base+'java/com/oswhgo/wivra/WivraPhoneCameraActivity.kt');
const store=read(base+'java/com/oswhgo/wivra/WivraPhoneMediaStore.kt');
const editor=read(base+'java/com/oswhgo/wivra/MainActivity.java');
const manifest=read(base+'AndroidManifest.xml');
const gradle=read('../android/app/build.gradle');
const instrument=read('../android/app/src/androidTest/java/com/oswhgo/wivra/WivraPhoneMediaStoreTest.kt');

test('Official CameraX phone camera independent from Meta DAT',()=>{
  for(const m of ['camera-camera2','camera-lifecycle','camera-video','camera-view']){
    assert.match(gradle,new RegExp('androidx\\.camera:'+m+':1\\.5\\.3'));
  }
  assert.match(activity,/ProcessCameraProvider.getInstance\(this\)/);
  assert.match(activity,/CameraSelector.DEFAULT_BACK_CAMERA/);
  assert.match(activity,/CameraSelector.DEFAULT_FRONT_CAMERA/);
  assert.match(activity,/PreviewView/);
  assert.match(activity,/ImageCapture/);
  assert.match(activity,/VideoCapture.withOutput/);
  assert.match(activity,/FileOutputOptions.Builder\(privateVideo\)/);
  assert.match(activity,/QualitySelector.from/);
  assert.doesNotMatch(activity,/Wearables\.|mwdat|AutoDeviceSelector|RTMP|RTMPS/);
  assert.doesNotMatch(gradle,/com\.android\.billingclient|play-services-ads/);
});
test('Camera and audio permissions separate and mic strictly opt-in',()=>{
  assert.match(manifest,/android\.permission\.CAMERA/);
  assert.match(manifest,/android\.permission\.RECORD_AUDIO/);
  assert.match(manifest,/\.WivraPhoneCameraActivity/);
  assert.match(manifest,/android:exported="false"/);
  assert.match(activity,/ActivityResultContracts.RequestPermission\(\)/);
  assert.match(activity,/cameraPermission.launch\(Manifest.permission.CAMERA\)/);
  assert.match(activity,/audioPermission.launch\(Manifest.permission.RECORD_AUDIO\)/);
  assert.match(activity,/private var micEnabled = false/);
  assert.match(activity,/if \(micEnabled\) pending\.withAudioEnabled\(\) else pending/);
  assert.match(activity,/if \(micEnabled && !hasPermission\(Manifest.permission.RECORD_AUDIO\)\)/);
  assert.match(activity,/R.string.phone_camera_recording_silent/);
  assert.match(activity,/R.string.phone_camera_recording_audio/);
});
test('Phone MP4 private until user chooses Keep, Later, Delete',()=>{
  assert.match(activity,/WivraPhoneMediaStore.createPrivateVideo\(this\)/);
  assert.match(activity,/WivraPhoneMediaStore.pendingVideos\(this\)/);
  assert.match(activity,/WivraPhoneMediaStore.publish\(this, file\)/);
  assert.match(activity,/WivraPhoneMediaStore.discard\(this, file\)/);
  assert.match(activity,/R.string.phone_camera_later/);
  assert.match(activity,/R.string.recording_discard_confirm/);
  assert.match(activity,/event.hasError\(\)/);
  assert.match(activity,/override fun onStop\(\)/);
  assert.match(store,/PENDING_DIR = "phone-pending"/);
  assert.match(store,/PRIVATE_PREFIX = "pending-phone-"/);
  assert.match(store,/file\.canonicalFile\.parentFile == folder/);
  assert.match(store,/put\(MediaStore.Video.Media.IS_PENDING, 1\)/);
  assert.match(store,/put\(MediaStore.Video.Media.IS_PENDING, 0\)/);
  assert.match(store,/privateVideo\.inputStream\(\)\.use/);
  assert.match(store,/resolver\.delete\(uri, null, null\)/);
  assert.match(store,/privateVideo\.delete\(\)/);
  assert.doesNotMatch(store,/^import (?:java\.net\.|okhttp|retrofit|android\.webkit\.)/m);
});
test('Saved phone media reaches SAME editor through selected content URI',()=>{
  assert.match(editor,/new Intent\(this, WivraPhoneCameraActivity.class\)/);
  assert.match(editor,/new Intent\(this, WivraMetaPreviewActivity.class\)/);
  assert.match(editor,/WivraPhoneMediaStore.latestSavedPhotos\(MainActivity.this\)/);
  assert.match(editor,/WivraPhoneMediaStore.latestSavedVideos\(MainActivity.this\)/);
  assert.match(editor,/WivraSavedRayBanVideos.latestSaved\(MainActivity.this\)/);
  assert.match(editor,/WivraMetaPhotoStore.latestCapturedPhoto\(MainActivity.this\)/);
  assert.match(editor,/new Uri\[\]\{choices.get\(item\)\}/);
  assert.match(editor,/pendingFilePicker = null/);
  assert.match(editor,/launchSystemPicker\(params\)/);
  assert.match(editor,/editor.loadUrl\("file:\/\/\/android_asset\/agentcut.html"\)/);
  assert.doesNotMatch(editor,/evaluateJavascript\(/);
  assert.doesNotMatch(manifest,/READ_MEDIA_VIDEO|READ_MEDIA_IMAGES|READ_EXTERNAL_STORAGE/);
  assert.match(store,/MediaStore.MediaColumns.OWNER_PACKAGE_NAME/);
  assert.match(store,/MediaStore.MediaColumns.IS_PENDING\} = 0/);
  assert.match(store,/MediaStore.MediaColumns.SIZE\} > 0/);
});
test('Photo during video is attempted only with device-supported binding',()=>{
  assert.match(activity,/current\.bindToLifecycle\(this, chosen, preview, photo, video\)/);
  assert.match(activity,/current\.bindToLifecycle\(this, chosen, preview, video\)/);
  assert.match(activity,/imageCapture = null/);
  assert.match(activity,/photoButton.isEnabled = imageCapture != null/);
  assert.match(activity,/capture\.takePicture\(output, mainExecutor/);
});
test('Six native languages include camera permission, audio and chooser strings',()=>{
  for(const loc of ['values','values-en','values-fr','values-de','values-it','values-ja']){
    const file=read('../android/app/src/main/res/'+loc+'/strings.xml');
    for(const key of ['phone_camera_open','phone_camera_title','phone_camera_preview',
      'phone_camera_mic_off','phone_camera_photo_saved','phone_camera_review_pending',
      'phone_camera_confirm_delete','picker_phone_photo_named','picker_phone_video_named']){
      assert.match(file,new RegExp('<string name="'+key+'">[^<]+<\\/string>'));
    }
    assert.match(file,/<string name="picker_phone_video_named">[^<]*%1\$s[^<]*<\/string>/);
  }
});
test('Instrumentation covers private files publish and deletion without Ray-Ban',()=>{
  assert.match(instrument,/WivraPhoneMediaStore\.createPrivateVideo\(context\)/);
  assert.match(instrument,/WivraPhoneMediaStore\.pendingVideos\(context\)/);
  assert.match(instrument,/WivraPhoneMediaStore\.publish\(context, privateVideo\)/);
  assert.match(instrument,/WivraPhoneMediaStore\.discard\(context, privateVideo\)/);
  assert.match(instrument,/published\?\.let \{ context\.contentResolver\.delete\(it, null, null\) \}/);
});
