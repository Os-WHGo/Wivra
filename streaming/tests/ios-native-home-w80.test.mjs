// W80 (Claude): native iPhone home + Wivra look. Source contracts only; the
// screens themselves are photographed in the iOS Simulator by CI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = f => readFileSync(new URL(`../ios/B0/Sources/${f}`, import.meta.url), 'utf8');
const app = src('WivraMetaB0App.swift');
const home = src('WivraHomeScreen.swift');
const theme = src('WivraTheme.swift');
const editor = src('WivraEmbeddedEditorScreen.swift');
const bridge = src('WivraEditorNativeBridge.swift');
const shots = readFileSync(new URL('../../.github/workflows/wivra-ios-ui-screenshots.yml', import.meta.url), 'utf8');

test('the app opens on the native home and can always go back to it', () => {
  assert.match(app, /@State private var showingHome = true/);
  assert.match(app, /WivraHomeScreen\(camerasFree: camerasFree, onAction: handleHome\)/);
  assert.match(app, /showingHome = true[\s\S]{0,120}ios\.home\.tab_home/);
});

test('home actions only open existing screens and respect the camera handoff', () => {
  assert.match(app, /private func handleHome\(_ action: WivraHomeAction\) \{\s+guard camerasFree else \{ return \}/);
  assert.match(app, /case \.capturePhone: showingHome = false; requestCaptureTab\(\.iPhone\)/);
  assert.match(app, /case \.live: showingPhoneLive = true/);
  assert.match(app, /model\.isReleasedForCameraHandoff && iPhoneCamera\.isReleasedForCameraHandoff && pendingCaptureTab == nil/);
  assert.match(home, /\.disabled\(!camerasFree\)/);
  assert.doesNotMatch(home, /startConfirmed|startRecording|publish\(/, 'home never starts LIVE or recording');
});

test('editor routes are fixed values and never navigate away from the bundled editor', () => {
  assert.match(editor, /enum WivraEditorRoute: String \{\s+case home = ""\s+case newProject = "#new"\s+case director = "#new-director"\s+case aiChat = "#new-ai"/);
  assert.match(editor, /history\.replaceState\(null, '', '\\\(route\.rawValue\)'\)/);
  assert.match(editor, /sessionStorage\.getItem\('wivra\.nativeRoute'\)/);
});

test('editor can ask to OPEN capture or LIVE, never to start them', () => {
  assert.match(editor, /openNative: \(what\) => window\.webkit\.messageHandlers\.wivraNative\.postMessage\(\{version: 1, method: 'host\.openNative', what\}\)/);
  assert.match(bridge, /case "host\.openNative":[\s\S]*?what == "live" \|\| what == "capture"/);
  assert.doesNotMatch(bridge, /case "live\.start"/);
  assert.match(app, /onDismiss: \{\s+editorRoute = \.home\s+openPendingNativeScreen\(\)/);
});

test('one dark + magenta theme for the root and every presentation; original logo only', () => {
  assert.match(theme, /func wivraStyled\(\) -> some View \{\s+self\.preferredColorScheme\(\.dark\)\.tint\(WivraTheme\.accent\)/);
  for (const screen of ['WivraEmbeddedEditorScreen(route: editorRoute)', 'WivraIPhoneLiveScreen()', 'WivraNativeCaptureLibraryScreen()', 'WivraNativeExportLibraryScreen()'])
    assert.ok(new RegExp(screen.replace(/[()]/g, '\\$&') + '\\s+\\.wivraStyled\\(\\)').test(app), screen + ' is styled');
  assert.doesNotMatch(theme + home, /Image\("(?:meta|rayban|tiktok|youtube|twitch|kick)/i, 'no third-party logo assets');
});

test('simulator screenshots: debug-only hook, PNG-only upload, no installer', () => {
  assert.match(app, /#if DEBUG[\s\S]*?WIVRA_SCREENSHOT[\s\S]*?#endif/);
  assert.match(shots, /-sdk iphonesimulator/);
  assert.match(shots, /CODE_SIGNING_ALLOWED=NO/);
  assert.match(shots, /path: \$\{\{ runner\.temp \}\}\/wivra-screens\/\*\.png/);
  assert.match(shots, /test -z "\$\(find "\$RUNNER_TEMP\/wivra-screens" -type f ! -name '\*\.png'\)"/);
  assert.doesNotMatch(shots, /\.ipa|-sdk iphoneos|devicectl|ios-deploy/);
});

test('bundled-editor checks ignore only the "#…" screen route, never the file or query', () => {
  const url = src('WivraEditorURL.swift');
  assert.match(url, /parts\.fragment = nil/);
  assert.doesNotMatch(url, /query = nil|path =|host =/);
  for (const f of ['WivraEditorNativeBridge.swift', 'WivraExportNativeBridge.swift', 'WivraAcceleratedExportNativeBridge.swift'])
    assert.match(src(f), /message\.frameInfo\.isMainFrame[\s\S]{0,200}request\.url\?\.wivraWithoutFragment\.standardizedFileURL/, f);
  assert.match(editor, /guard let url = navigationAction\.request\.url\?\.wivraWithoutFragment else/);
  assert.match(editor, /let requestURL = frame\.request\.url\?\.wivraWithoutFragment,/);
});
