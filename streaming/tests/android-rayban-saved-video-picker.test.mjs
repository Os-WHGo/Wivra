import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(path,import.meta.url),'utf8');
const picker=read('../android/app/src/main/java/com/oswhgo/wivra/WivraSavedRayBanVideos.kt');
const host=read('../android/app/src/main/java/com/oswhgo/wivra/MainActivity.java');
const encoder=read('../android/app/src/main/java/com/oswhgo/wivra/WivraHevcMp4Recorder.kt');
const manifest=read('../android/app/src/main/AndroidManifest.xml');
const gradle=read('../android/app/build.gradle');

test('gallery shortcut exposes only Wivra-published MP4s in original Movies/Wivra folder',()=>{
  assert.match(picker,/CAPTURE_FOLDER = "Movies\/Wivra\/"/);
  assert.match(encoder,/MediaStore.Video.Media.RELATIVE_PATH, "Movies\/Wivra\/"/);
  assert.match(picker,/NAME_PREFIX = "Wivra_RayBan_"/);
  assert.match(encoder,/"Wivra_RayBan_" \+ System.currentTimeMillis\(\)/);
  assert.match(picker,/MediaStore.Video.Media.IS_PENDING\} = 0/);
  assert.match(picker,/MediaStore.Video.Media.SIZE\} > 0/);
  assert.match(picker,/OWNER_PACKAGE_NAME\} = \?/);
  assert.match(picker,/context.packageName/);
  assert.match(picker,/MIME_TYPE\} = \?/);
  assert.match(picker,/"video\/mp4"/);
  assert.match(picker,/MediaStore.Video.Media.EXTERNAL_CONTENT_URI/);
  assert.match(picker,/ContentUris.withAppendedId/);
  assert.match(picker,/MAX_RESULTS = 12/);
});

test('chooser is explicitly user-triggered and remains one Claude editor',()=>{
  assert.match(host,/onShowFileChooser/);
  assert.match(host,/accept\.contains\("video\/"\)/);
  assert.match(host,/WivraSavedRayBanVideos.latestSaved\(MainActivity.this\)/);
  assert.match(host,/WivraMetaPhotoStore.latestCapturedPhoto\(MainActivity.this\)/);
  assert.match(host,/setItems\(labels.toArray\(new String\[0\]\)/);
  assert.match(host,/choices.add\(video.getUri\(\)\)/);
  assert.match(host,/choices.add\(recent\)/);
  assert.match(host,/new Uri\[\]\{choices.get\(item\)\}/);
  assert.match(host,/getString\(R.string.picker_browse_files\)/);
  assert.match(host,/clearPendingPicker\(\)/);
  assert.match(host,/editor.loadUrl\("file:\/\/\/android_asset\/agentcut.html"\)/);
  assert.match(host,/editor\.evaluateJavascript\(readOnly, encoded ->/);
  assert.match(host,/localStorage\.getItem\('agentcut-shoot-checklist-v1'\)/);
  assert.doesNotMatch(host,/addJavascriptInterface\(/);
});

test('no READ_MEDIA_VIDEO, file paths, app payments or automatic media ingestion',()=>{
  assert.doesNotMatch(manifest,/READ_MEDIA_VIDEO|READ_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE/);
  assert.doesNotMatch(picker,/\bFile\b|\.getPath\(|\.openInputStream\(|\.openOutputStream\(/);
  assert.doesNotMatch(picker,/https?:\/\/|retrofit|okhttp|HttpURLConnection/);
  assert.doesNotMatch(host,/BillingClient|InAppPurchase|creditBalance|paywall/);
  assert.doesNotMatch(gradle,/com\.android\.billingclient|play-services-ads/);
});

test('saved-only chooser is localized in six Android native locales',()=>{
 for(const lang of ['es','en','fr','de','it','ja']){
   const dir=lang==='es'?'values':`values-${lang}`;
   const text=read(`../android/app/src/main/res/${dir}/strings.xml`);
   assert.match(text,/<string name="picker_wivra_media_title">[^<]+<\/string>/);
   assert.match(text,/<string name="picker_wivra_video_named">[^<]*%1\$s[^<]*<\/string>/);
 }
});
