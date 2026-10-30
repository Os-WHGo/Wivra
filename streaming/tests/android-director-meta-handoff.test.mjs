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

test('Android acknowledges a Director take only after the owner saves its own recording', () => {
  assert.match(main, /const val EXTRA_SHOT_ID|EXTRA_SHOT_ID/);
  assert.match(main, /launch\.putExtra\(WivraPhoneCameraActivity\.EXTRA_SHOT_ID, id\)/);
  assert.match(main, /startActivityForResult\(launch, DIRECTOR_CAPTURE_REQUEST\)/);
  assert.match(main, /expected\.equals\(data\.getStringExtra\(WivraPhoneCameraActivity\.EXTRA_SHOT_ID\)\)/);
  assert.match(main, /updateShot\(shootPlan/);
  assert.match(main, /saveShootPlan\(\);renderShootPlan\(\);/);
  assert.match(phone, /directorVideoCreatedHere = privateVideo\.name/);
  assert.match(phone, /if \(file\.name != directorVideoCreatedHere\) return/);
  assert.match(phone, /setResult\(Activity\.RESULT_OK, Intent\(\)\.putExtra\(EXTRA_SHOT_ID, shotId\)\)/);
  const confirm = 'acknowledgeSavedDirectorTake(file)';
  assert.equal(phone.split(confirm).length, 3, 'only video-only salvage and normal successful keep may acknowledge');
  assert.ok(phone.indexOf('WivraPhoneMediaStore.publish(this, file)') < phone.indexOf(confirm),
    'the ordinary save path must publish before acknowledging');
  assert.doesNotMatch(phone, /setResult\(Activity\.RESULT_OK, Intent\(\)\.putExtra\(EXTRA_SHOT_SCRIPT/);
});

test('Director native receipt preserves project context without inventing a media asset', () => {
  assert.match(main, /updateShot\(shootPlan,.*\{state:'done'\},\{project:session\.project\}\)/);
  assert.match(main, /if\(!shot\|\|\(shot\.state!=='todo'&&shot\.state!=='retry'\)\)return/);
  assert.doesNotMatch(main, /\{state:'done',assetId:/);
  assert.doesNotMatch(phone, /putExtra\(EXTRA_SHOT_ID, shotId\).*putExtra\(.*(file|uri|path)/);
});

test('A new Android Director camera selection clears any stale shot receipt', () => {
  assert.match(main, /Intent launch = new Intent\(this, targetActivity\);\s*pendingDirectorShotId = null;\s*if \(index > 0\)/);
  assert.match(main, /if \(shots\.length\(\) == 0\) \{\s*pendingDirectorShotId = null;/);
});

test('Director rejects invalid shot IDs before native camera launch', () => {
  assert.match(main, /id\.chars\(\)\.allMatch\(ch -> ch >= 32 && ch != 127\)/);
  assert.match(phone, /ch >= ' ' && ch\.code != 127/);
});

test('Director checklist excludes malformed shot IDs before showing native capture choices', () => {
  assert.match(main, /Array\.from\(s\.id\)\.every\(ch=>ch\.charCodeAt\(0\)>=32&&ch\.charCodeAt\(0\)!==127\)/);
  assert.match(main, /id\.chars\(\)\.allMatch\(ch -> ch >= 32 && ch != 127\)/);
});

test('Starting another native recording invalidates a previous Director save receipt', () => {
  assert.match(phone, /createPrivateVideo\(this\)\s*\/\/ A previous saved take must not acknowledge a later abandoned recording\.\s*setResult\(Activity\.RESULT_CANCELED\)/);
  assert.match(phone, /setResult\(Activity\.RESULT_OK, Intent\(\)\.putExtra\(EXTRA_SHOT_ID, shotId\)\)/);
});
