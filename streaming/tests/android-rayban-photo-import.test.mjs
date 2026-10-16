import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../android/app/src/main/java/com/oswhgo/wivra/', import.meta.url);
const store = readFileSync(new URL('WivraMetaPhotoStore.kt', root), 'utf8');
const camera = readFileSync(new URL('WivraMetaPreviewActivity.kt', root), 'utf8');
const editorHost = readFileSync(new URL('MainActivity.java', root), 'utf8');
const editorHTML = readFileSync(new URL('../../app/dist/agentcut.html', import.meta.url),'utf8');
const androidTest = readFileSync(new URL('../android/app/src/androidTest/java/com/oswhgo/wivra/WivraMetaPhotoStoreTest.kt',import.meta.url),'utf8');

test('Stable DAT stream capture is explicitly user-triggered, not experimental standalone Photo', () => {
 assert.match(camera,/photoButton = button\(root, getString\(R.string.capture_photo\)\) \{ captureGlassesPhoto\(\) \}/);
 assert.match(camera,/active\.capturePhoto\(\)\.getOrThrow\(\)/);
 assert.match(camera,/lastFrameReceivedMs/);
 assert.match(camera,/photoInProgress/);
 assert.match(camera,/Dispatchers\.IO/);
 assert.doesNotMatch(camera,/camera\.photo\.capture/);
 assert.doesNotMatch(camera,/audioStream\.collect/);
});
test('Photo data is written only to local MediaStore; original HEIC is preserved',()=>{
 assert.match(store,/is PhotoData.Bitmap -> saveBitmap\(context, photo.bitmap\)/);
 assert.match(store,/is PhotoData.HEIC -> saveHeic\(context, photo.data\)/);
 assert.match(store,/asReadOnlyBuffer\(\)/);
 assert.match(store,/buffer\.rewind\(\)/);
 assert.match(store,/Bitmap.CompressFormat.JPEG, 92/);
 assert.match(store,/MAX_BITMAP_PIXELS/);
 assert.match(store,/MAX_HEIC_BYTES/);
 assert.match(store,/MediaStore.Images.Media.RELATIVE_PATH/);
 assert.match(store,/MediaStore.Images.Media.IS_PENDING, 1/);
 assert.match(store,/MediaStore.Images.Media.IS_PENDING, 0/);
 assert.match(store,/resolver\.delete\(uri, null, null\)/);
 assert.doesNotMatch(store,/^\s*import\s+(?:java\.net\.|okhttp|retrofit|android\.webkit\.)/m);
 assert.doesNotMatch(store,/\b(?:fetch|evaluateJavascript|encodeToString)\s*\(/);
});
test('Claude shared editor image chooser offers only recent app-owned Ray-Ban photo',()=>{
 assert.match(editorHTML,/id="file" type="file" accept="video\/\*,image\/\*"/);
 assert.match(editorHost,/WivraMetaPhotoStore\.latestCapturedPhoto\(MainActivity\.this\)/);
 assert.match(editorHost,/accept\.contains\("image\/"\)/);
 assert.match(editorHost,/pendingFilePicker = null;/);
 assert.match(editorHost,/choices.add\(recent\)/);
 assert.match(editorHost,/new Uri\[\]\{choices.get\(item\)\}/);
 assert.match(editorHost,/launchSystemPicker\(params\)/);
 assert.match(store,/PHOTO_DIRECTORY, "\$FILE_PREFIX%"/);
 assert.match(store,/MediaStore.Images.Media.DATE_ADDED/);
 assert.match(editorHost,/editor\.evaluateJavascript\(readOnly, encoded ->/);
  assert.match(editorHost,/localStorage\.getItem\('agentcut-shoot-checklist-v1'\)/);
  assert.doesNotMatch(editorHost,/addJavascriptInterface\(/);
});
test('Android emulated MediaStore verification checks JPEG and removes test photo',()=>{
 assert.match(androidTest,/WivraMetaPhotoStore\.saveBitmap\(context, bitmap\)/);
 assert.match(androidTest,/assertEquals\("image\/jpeg"/);
 assert.match(androidTest,/latestCapturedPhoto\(context\)/);
 assert.match(androidTest,/context\.contentResolver\.delete\(uri, null, null\)/);
});
