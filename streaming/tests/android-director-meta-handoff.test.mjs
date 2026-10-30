import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const get = p => readFileSync(new URL('../../' + p, import.meta.url),'utf8');
const main = get('streaming/android/app/src/main/java/com/oswhgo/wivra/MainActivity.java');
const meta = get('streaming/android/app/src/main/java/com/oswhgo/wivra/WivraMetaPreviewActivity.kt');
const phone = get('streaming/android/app/src/main/java/com/oswhgo/wivra/WivraPhoneCameraActivity.kt');

test('Director-selected script reaches both native capture sources without duplication', () => {
  assert.match(main, /glasses\.setOnClickListener\(v -> launchRayBanCameraFromDirector\(\)\)/);
  assert.match(main, /launchCameraFromDirector\(WivraMetaPreviewActivity\.class\)/);
  assert.match(main, /launchCameraFromDirector\(WivraPhoneCameraActivity\.class\)/);
  assert.match(main, /localStorage\.getItem\('agentcut-shoot-checklist-v1'\)/);
  assert.match(main, /if \(script\.length\(\) <= 2200/);
  assert.match(main, /launch\.putExtra\(WivraPhoneCameraActivity\.EXTRA_SHOT_SCRIPT, script\)/);
  assert.match(phone, /const val EXTRA_SHOT_SCRIPT/);
  assert.match(meta, /intent\.getStringExtra\(\s*WivraPhoneCameraActivity\.EXTRA_SHOT_SCRIPT/);
  assert.match(meta, /it\.length in 1\.\.2200 && it\.isNotBlank\(\)/);
});

test('Ray-Ban teleprompter lives in UI, never in compressed video or broadcast', () => {
  assert.match(meta, /val previewFrame = FrameLayout\(this\)/);
  assert.match(meta, /previewFrame\.addView\(imagePreview/);
  assert.match(meta, /previewFrame\.addView\(prompt/);
  assert.match(meta, /prompt\.visibility = if \(prompt\.visibility == View\.VISIBLE\)/);
  assert.match(meta, /fun startServiceCapture\(\)/);
  assert.doesNotMatch(meta, /drawText\(shotScript|muxer\.consume\(shotScript/);
  assert.doesNotMatch(main, /addJavascriptInterface\(/);
});
