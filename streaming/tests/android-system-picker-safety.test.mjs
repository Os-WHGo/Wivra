import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main = readFileSync(new URL('../android/app/src/main/java/com/oswhgo/wivra/MainActivity.java', import.meta.url), 'utf8');

test('third-party file picker never hands private file schemes or app-private provider to WebView', () => {
  assert.match(main, /safeSystemPickerResult\(Uri\[\] selected\)/);
  assert.match(main, /ContentResolver\.SCHEME_CONTENT\.equals\(uri\.getScheme\(\)\)/);
  assert.match(main, /uri\.getAuthority\(\)\.equals\(getPackageName\(\) \+ "\.captureimports"\)/);
  assert.match(main, /uri\.getAuthority\(\)\.equals\(getPackageName\(\)\)/);
  assert.match(main, /selected\.length > MAX_PICKER_FILES/);
  assert.match(main, /MAX_PICKER_FILES = 40/);
  assert.match(main, /openFileDescriptor\(uri, "r"\)/);
  assert.match(main, /catch \(Exception invalidOrRevoked\)/);
  assert.match(main, /pickerValidator\.execute\(\(\) -> \{/);
  assert.match(main, /Uri\[\] checked = safeSystemPickerResult\(selected\)/);
  assert.match(main, /completion\.onReceiveValue\(checked\)/);
  assert.doesNotMatch(main, /completion\.onReceiveValue\(WebChromeClient\.FileChooserParams\.parseResult/);
});

test('existing native user-chosen saved media shortcuts stay separate from untrusted picker validation', () => {
  assert.match(main, /new Uri\[\]\{choices\.get\(item\)\}/);
  assert.match(main, /WivraSavedRayBanVideos\.latestSaved\(MainActivity\.this\)/);
  assert.match(main, /WivraPhoneMediaStore\.latestSavedVideos\(MainActivity\.this\)/);
  assert.match(main, /WivraPhoneMediaStore\.latestSavedWav\(MainActivity\.this\)/);
  assert.doesNotMatch(main, /addJavascriptInterface\(/);
});

test('cloud and multi-part file providers cannot stall the Android UI thread', () => {
  assert.match(main, /Executors\.newSingleThreadExecutor\(\)/);
  assert.match(main, /pickerValidator\.execute\(\(\) -> \{/);
  assert.match(main, /runOnUiThread\(\(\) => \{/);
  assert.match(main, /pendingFilePicker != completion \|\| isFinishing\(\) \|\| isDestroyed\(\)/);
  assert.match(main, /pickerValidator\.shutdownNow\(\)/);
  assert.match(main, /if \(pendingFilePicker == completion\) clearPendingPicker\(\)/);
});

test('native system picker supports the same 40-part Ray-Ban group as the editor', () => {
  const html = readFileSync(new URL('../../app/template.html', import.meta.url),'utf8');
  const parts = readFileSync(new URL('../../app/director-parts.mjs', import.meta.url),'utf8');
  assert.match(main, /MAX_PICKER_FILES = 40/);
  assert.match(parts, /MAX_DIRECTOR_PARTS=40/);
  assert.match(html, /const MAX_IMPORT = 40/);
});
