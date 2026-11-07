// W86 (Claude): iPhone editor shows real JS dialogs (consent); the subtitle e2e hooks are CI/Debug only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('iOS editor answers confirm/alert/prompt with native dialogs, only for the bundled editor', () => {
  const s = read('streaming/ios/B0/Sources/WivraEmbeddedEditorScreen.swift');
  for (const m of ['runJavaScriptAlertPanelWithMessage', 'runJavaScriptConfirmPanelWithMessage', 'runJavaScriptTextInputPanelWithPrompt']) assert.match(s, new RegExp(m));
  assert.match(s, /guard let presenter = editorDialogPresenter\(webView, frame\) else \{ completionHandler\(false\); return \}/);
  assert.match(s, /approvedEditor\?\.standardizedFileURL == url\.standardizedFileURL/);
  for (const l of ['es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'zh']) {
    const t = read(`streaming/ios/B0/Resources/${l}.lproj/Localizable.strings`);
    assert.match(t, /"ios\.editor\.dialog_ok" = "[^"]+";/); assert.match(t, /"ios\.editor\.dialog_cancel" = "[^"]+";/);
  }
});

test('the iOS e2e hook exists only in Debug builds and only with WIVRA_E2E=1', () => {
  const h = read('streaming/ios/B0/Sources/WivraEditorE2EHook.swift');
  assert.match(h, /^#if DEBUG$/m); assert.match(h.trimEnd(), /#endif$/);
  assert.match(h, /environment\["WIVRA_E2E"\] == "1"/);
  assert.doesNotMatch(h, /localStorage|URLSession/);
  assert.match(read('streaming/ios/B0/Sources/WivraEmbeddedEditorScreen.swift'), /#if DEBUG\n\s+WivraEditorE2EHook\.startIfRequested\(view\)/);
});

test('the Android whisper check is an instrumentation test that skips itself without CI input', () => {
  const j = read('streaming/android/app/src/androidTest/java/com/oswhgo/wivra/WivraWhisperWebViewTest.java');
  assert.match(j, /Assume\.assumeTrue\("CI did not provide the whisper e2e input"/);
  assert.doesNotMatch(read('streaming/android/app/src/main/java/com/oswhgo/wivra/MainActivity.java'), /e2e-driver|__wvE2E/);
  assert.match(read('streaming/android/app/build.gradle'), /sourceSets\.androidTest\.assets\.srcDir\(layout\.buildDirectory\.dir\('generated\/wivra-e2e'\)\)/);
});
