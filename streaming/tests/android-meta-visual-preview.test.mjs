import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../android/app/src/main/java/com/oswhgo/wivra/WivraMetaPreviewActivity.kt', import.meta.url), 'utf8');
const decoder = readFileSync(new URL('../android/app/src/main/java/com/oswhgo/wivra/WivraI420PreviewConverter.kt', import.meta.url), 'utf8');
const androidTests = readFileSync(new URL('../android/app/src/androidTest/java/com/oswhgo/wivra/PreviewConverterTest.kt', import.meta.url), 'utf8');

test('The actual Ray-Ban DAT preview is local, throttled and memory bounded', () => {
  assert.match(source,/ImageView\(this\)/);
  assert.match(source,/active\.videoStream\.collect/);
  assert.match(source,/Channel<LocalPreviewFrame>\(Channel\.CONFLATED\)/);
  assert.match(source,/SystemClock\.elapsedRealtime\(\)/);
  assert.match(source,/expectedPixels <= 1280L \* 1920L/);
  assert.match(source,/copied\.remaining\(\)\.toLong\(\) == expectedBytes/);
  assert.match(source,/withContext\(Dispatchers\.Main\.immediate\)/);
  assert.match(source,/imagePreview\.setImageBitmap\(bitmap\)/);
  assert.match(source,/frameChannel\?\.close\(\)/);
  assert.doesNotMatch(source, /Base64\.encodeToString\(/);
  assert.doesNotMatch(source, /evaluateJavascript\(/);
});
test('The preview rejects irregular YUV layout and does not use experimental DAT APIs', () => {
  assert.match(decoder,/YuvImage\(nv21, ImageFormat\.NV21/);
  assert.match(decoder,/width % 2 != 0/);
  assert.match(decoder,/expectedLong != bytes\.size\.toLong\(\)/);
  assert.match(androidTests,/planarGrayFrameRendersWithExpectedDimensions/);
  assert.match(androidTests,/rejectsUnexpectedLayoutWithoutDecoding/);
  assert.doesNotMatch(source,/camera\.photo/);
  assert.doesNotMatch(source,/audioStream\.collect/);
  assert.doesNotMatch(source,/addSpeech/);
});
