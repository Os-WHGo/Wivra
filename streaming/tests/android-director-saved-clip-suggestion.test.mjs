import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const host = read('streaming/android/app/src/main/java/com/oswhgo/wivra/MainActivity.java');
const editor = read('app/template.html');

test('native saved take suggestion is scoped to one new app-owned MP4', () => {
  assert.match(host, /priorDirectorVideoIds = new java\.util\.HashSet<>\(/);
  assert.match(host, /savedDirectorVideos\(pendingDirectorRayBan\)/);
  assert.match(host, /WivraPhoneMediaStore\.latestSavedVideos\(this\)/);
  assert.match(host, /WivraSavedRayBanVideos\.latestSaved\(this\)/);
  assert.match(host, /if \(candidate != null\) return null/);
  assert.match(host, /if \(before == null\) return null/);
});

test('editor gets actual media only upon explicit current-shot file-input selection', () => {
  assert.match(host, /params\.isCaptureEnabled\(\)/);
  assert.match(host, /params\.getMode\(\) != WebChromeClient\.FileChooserParams\.MODE_OPEN/);
  assert.match(host, /selectedShootId===/);
  assert.match(host, /pzPid===/);
  assert.match(host, /shot\.state==='done'&&!s\.assetId|s\.state==='done'&&!s\.assetId/);
  assert.match(host, /savedDirectorVideos\(fromRayBan\)\.contains\(candidate\.toString\(\)\)/);
  assert.match(host, /callback\.onReceiveValue\(new Uri\[\]\{candidate\}\)/);
  assert.match(host, /launchSystemPicker\(params\)/);
  assert.match(editor, /await importSelectedFiles\(files\)/);
  assert.match(editor, /state:'done',assetId:added\.id/);
  assert.doesNotMatch(host, /addJavascriptInterface\(/);
});

test('different project, interrupted activity and multipart capture do not auto-suggest', () => {
  assert.match(host, /clearDirectorVideoSuggestion\(\)/);
  assert.match(host, /pzPid===/);
  assert.match(host, /expectedProject/);
  assert.match(host, /if \(before == null\) return null/);
  assert.match(host, /if \(candidate != null\) return null/);
  assert.doesNotMatch(host, /putExtra\(.*SAVED_VIDEO_URI/);
});
