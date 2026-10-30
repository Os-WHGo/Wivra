import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const main = readFileSync(new URL('../android/app/src/main/java/com/oswhgo/wivra/MainActivity.java', import.meta.url), 'utf8');

test('third-party file picker never hands private file schemes or app-private provider to WebView', () => {
  assert.match(main, /safeSystemPickerResult\(Uri\[\] selected\)/);
  assert.match(main, /ContentResolver\.SCHEME_CONTENT\.equals\(uri\.getScheme\(\)\)/);
  assert.match(main, /uri\.getAuthority\(\)\.equals\(getPackageName\(\) \+ "\.captureimports"\)/);
  assert.match(main, /uri\.getAuthority\(\)\.equals\(getPackageName\(\)\)/);
  assert.match(main, /selected\.length > 32/);
  assert.match(main, /openFileDescriptor\(uri, "r"\)/);
  assert.match(main, /catch \(Exception invalidOrRevoked\)/);
  assert.match(main, /completion\.onReceiveValue\(safeSystemPickerResult\(/);
  assert.doesNotMatch(main, /completion\.onReceiveValue\(WebChromeClient\.FileChooserParams\.parseResult/);
});

test('existing native user-chosen saved media shortcuts stay separate from untrusted picker validation', () => {
  assert.match(main, /new Uri\[\]\{choices\.get\(item\)\}/);
  assert.match(main, /WivraSavedRayBanVideos\.latestSaved\(MainActivity\.this\)/);
  assert.match(main, /WivraPhoneMediaStore\.latestSavedVideos\(MainActivity\.this\)/);
  assert.match(main, /WivraPhoneMediaStore\.latestSavedWav\(MainActivity\.this\)/);
  assert.doesNotMatch(main, /addJavascriptInterface\(/);
});
