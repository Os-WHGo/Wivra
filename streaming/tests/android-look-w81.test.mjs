// W81 (Claude): Wivra look on Android, editor-home bridge and the "#…" route fix.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const j = f => readFileSync(new URL(`../android/app/src/main/java/com/oswhgo/wivra/${f}`, import.meta.url), 'utf8');
const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../android/app/src/main/res/values/themes.xml', import.meta.url), 'utf8');
const main = j('MainActivity.java'), exportBridge = j('WivraExportBridge.kt'), home = j('WivraHomeBridge.kt');
const html = readFileSync(new URL('../../app/template.html', import.meta.url), 'utf8');

test('one dark Wivra theme with magenta accent for the whole app', () => {
  assert.match(manifest, /android:theme="@style\/Theme\.Wivra"/);
  assert.match(theme, /parent="@android:style\/Theme\.Material\.NoActionBar"/);
  assert.match(theme, /android:colorAccent">@color\/wivra_accent/);
  assert.match(main, /shell\.setBackgroundColor\(getColor\(R\.color\.wivra_background\)\)/);
});

test('bundled-editor checks ignore only the "#…" route, never another file', () => {
  assert.match(exportBridge, /fun isEditor\(url: String\?\): Boolean = url != null && url\.substringBefore\('#'\) == EDITOR_URL/);
  for (const f of ['WivraExportBridge.kt', 'WivraAcceleratedExportBridge.kt', 'WivraCaptureVerificationBridge.kt', 'MainActivity.java', 'WivraHomeBridge.kt'])
    assert.doesNotMatch(j(f), /\.url != (?:WivraExportBridge\.)?EDITOR_URL|"file:\/\/\/android_asset\/agentcut\.html"\.equals/, f);
});

test('editor home can only OPEN the native choosers, with fixed words', () => {
  assert.match(home, /if \(!isMainFrame \|\| !WivraExportBridge\.isEditor\(view\.url\)\) return@addWebMessageListener/);
  assert.match(home, /if \(what == "capture" \|\| what == "live"\) opener\.open\(what\)/);
  assert.match(home, /window\.WivraNativeHome = Object\.freeze/);
  assert.doesNotMatch(home, /window\.WivraHost\s*=/, 'never impersonate the iOS host object');
  assert.match(main, /"live"\.equals\(what\) && "com\.oswhgo\.wivra"\.equals\(getPackageName\(\)\)\) \{\s+showLiveSourceChooser\(\);/);
  assert.match(main, /"capture"\.equals\(what\)\) \{\s+showCameraSourceChooser\(\);/);
  assert.match(html, /window\.WivraHost\.openNative === 'function'\) \? window\.WivraHost : window\.WivraNativeHome/);
});

test('emulator screenshots: debuggable builds only, PNG-only upload, no APK artifact', () => {
  const wf = readFileSync(new URL('../../.github/workflows/wivra-android-ui-screenshots.yml', import.meta.url), 'utf8');
  assert.match(main, /private void applyScreenshotScene\(\) \{\s+if \(\(getApplicationInfo\(\)\.flags & android\.content\.pm\.ApplicationInfo\.FLAG_DEBUGGABLE\) == 0\) return;/);
  assert.match(wf, /path: \$\{\{ runner\.temp \}\}\/wivra-screens\/\*\.png/);
  assert.match(wf, /test -z "\$\(find "\$RUNNER_TEMP\/wivra-screens" -type f ! -name '\*\.png'\)"/);
  assert.doesNotMatch(wf, /path:[^\n]*\.apk|assembleRelease|bundleRelease|play-publisher/);
});
