// Progressive export: the JS sink, the Android bridge and the iOS bridge must speak the
// same protocol and keep the same safety gates. Static source contract (no device). — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXPORT_FRAME_MAGIC, EXPORT_FRAME_HEADER, EXPORT_SINK_MAX_CHUNK_BYTES, EXPORT_SINK_PROTOCOL } from '../../app/export-sink.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const android = 'android/app/src/main/java/com/oswhgo/wivra/';
const session = read(android + 'WivraProgressiveExportSession.kt');
const store = read(android + 'WivraExportStore.kt');
const bridge = read(android + 'WivraExportBridge.kt');
const main = read(android + 'MainActivity.java');
const gradle = read('android/app/build.gradle');
const iosStore = read('ios/B0/Sources/WivraExportStore.swift');
const iosBridge = read('ios/B0/Sources/WivraExportNativeBridge.swift');
const iosScreen = read('ios/B0/Sources/WivraEmbeddedEditorScreen.swift');

test('binary frame, protocol and chunk limit are identical in JS and Kotlin', () => {
  assert.equal(EXPORT_FRAME_MAGIC, 0x31585657);
  assert.match(session, /const val FRAME_MAGIC = 0x31585657/);
  assert.match(session, new RegExp(`const val FRAME_HEADER_BYTES = ${EXPORT_FRAME_HEADER}\\b`));
  assert.equal(EXPORT_SINK_MAX_CHUNK_BYTES, 32 * 1024 * 1024);
  assert.match(session, /const val MAX_CHUNK_BYTES = 32 \* 1024 \* 1024/);
  assert.match(iosStore, /static let maximumChunkBytes = 32 \* 1024 \* 1024/);
  assert.match(bridge, new RegExp(`const val PROTOCOL = ${EXPORT_SINK_PROTOCOL}\\b`));
  assert.match(iosBridge, /body\["version"\] as\? Int == 1/);
  assert.match(iosStore, /0xEDB8_8320/);
});

test('Android channel is AndroidX WebMessageListener, main frame of the bundled editor only', () => {
  assert.match(gradle, /implementation 'androidx\.webkit:webkit:1\.12\.1'/);
  assert.doesNotMatch(main + bridge, /\.addJavascriptInterface\(/);
  assert.match(bridge, /WebViewCompat\.addWebMessageListener\(webView, JS_OBJECT/);
  assert.match(bridge, /if \(!isMainFrame \|\| view\.url != EDITOR_URL \|\| disposed\) return@addWebMessageListener/);
  assert.match(bridge, /const val EDITOR_URL = "file:\/\/\/android_asset\/agentcut\.html"/);
  // Installed before the page loads, disposed (partial deleted) with the Activity.
  assert.ok(main.indexOf('exportBridge.install()') > 0 && main.indexOf('exportBridge.install()') < main.indexOf('editor.loadUrl('));
  assert.match(main, /exportBridge\.dispose\(\);/);
  assert.ok(main.indexOf('exportBridge.dispose()') < main.indexOf('editor.destroy()'));
});

test('Android gallery item stays pending until totals, sync and disk re-read all match', () => {
  assert.match(store, /put\(MediaStore\.Video\.Media\.IS_PENDING, 1\)/);
  const finish = store.slice(store.indexOf('fun finish('), store.indexOf('fun abort('));
  const order = ['item.session.finish(', 'WivraProgressiveExportSession.measure(', 'IS_PENDING, 0'].map((s) => finish.indexOf(s));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], String(order));
  assert.match(finish, /resolver\.delete\(item\.uri, null, null\)/);
  assert.match(session, /sync\(\)\s*\n\s*output\.close\(\)/);
  assert.match(store, /sync = \{ stream\.fd\.sync\(\) \}/);
  assert.match(store, /MATCH_ONLY/);
  assert.match(store, /OWNER_PACKAGE_NAME/);
  assert.match(store, /if \(isActive\(uri\)\) continue/);
  assert.match(store, /InsufficientStorageException/);
});

test('iOS file is renamed from .partial only after sync and a full re-read', () => {
  const finish = iosStore.slice(iosStore.indexOf('func finish('), iosStore.indexOf('func abort('));
  const order = ['synchronize()', 'Self.measure(', 'moveItem('].map((s) => finish.indexOf(s));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], String(order));
  assert.match(finish, /removeItem\(at: session\.partialURL\)/);
  assert.match(iosStore, /isExcludedFromBackup = true/);
  assert.match(iosStore, /volumeAvailableCapacityForImportantUsage/);
  assert.match(iosBridge, /approved\?\.standardizedFileURL == message\.frameInfo\.request\.url\?\.standardizedFileURL/);
  assert.match(iosBridge, /message\.frameInfo\.isMainFrame/);
  assert.match(iosBridge, /deinit \{[\s\S]*abortAll\(\)/);
  assert.match(iosScreen, /name: "wivraExport"\)/);
  assert.match(iosScreen, /exportBridge\.webView = view/);
});

test('both platforms keep free-space margins and the same 200 MB reserve', () => {
  assert.match(store, /const val MIN_FREE_BYTES = 200L \* 1024 \* 1024/);
  assert.match(iosStore, /static let minimumFreeBytes: Int64 = 200 \* 1024 \* 1024/);
});
