// Cross-agent integration guard: verify shipped HTML and native platform export
// configuration belong to the same source snapshot. Not hardware certification.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const strip = s => s.replace(/^import .*$/gm, '')
  .replace(/^export (?=async function|class|function|const|default)/gm, '');

test('shipping editor contains both Claude progressive export and latest capture recovery', () => {
  const html = read('../dist/agentcut.html');
  for (const source of [
    '../export-sink.mjs',
    '../media-container.mjs',
    '../export-engine-policy.mjs',
    '../export.mjs',
    '../capture-locked-session.mjs',
    '../capture-journal-store.mjs',
    '../capture-native-verifier.mjs',
    '../capture-native-session.mjs'
  ]) {
    assert.ok(html.includes(strip(read(source))),
      'bundled HTML must contain current source: ' + source);
  }
  assert.doesNotMatch(html, /\/\*__CORE__\*\//);
});

test('native shells retain permission-safe export playback configuration', () => {
  const android = read('../../streaming/android/app/src/main/java/com/oswhgo/wivra/MainActivity.java');
  assert.match(android, /setMediaPlaybackRequiresUserGesture\(false\)/);
  const ios = read('../../streaming/ios/B0/Sources/WivraEmbeddedEditorScreen.swift');
  assert.match(ios, /allowsInlineMediaPlayback = true/);
  assert.match(ios, /mediaTypesRequiringUserActionForPlayback = \[\]/);
  const share = read('../../streaming/ios/B0/Sources/WivraExportNativeBridge.swift');
  assert.doesNotMatch(share, /excludedActivityTypes = \[\.saveToCameraRoll\]/);
  const plist = read('../../streaming/ios/B0/Info.plist');
  assert.match(plist, /NSPhotoLibraryAddUsageDescription/);
  assert.match(share, /UIActivityViewController\(activityItems: \[url\]/);
});

test('container repair is shared by bundled editor and current JS module', () => {
  const js = read('../media-container.mjs');
  assert.match(js, /mehd/);
  assert.match(read('../dist/agentcut.html'), /mehd/);
  // iOS fragment repair must not change fragmented movie headers in place.
  const swift = read('../../streaming/ios/B0/Sources/WivraMp4Repair.swift');
  assert.match(swift, /mvhd\/tkhd\/mdhd stay as the spec requires/);
});

test('iOS capture picker verifies real media before releasing an existing capture to Director', () => {
  const ios = read('../../streaming/ios/B0/Sources/WivraEmbeddedEditorScreen.swift');
  assert.match(ios, /private func verifiedCaptureURLs\(_ urls: \[URL\]\) async -> \[URL\]\?/);
  assert.match(ios, /Task\.detached\(priority: \.userInitiated\)/);
  assert.match(ios, /await WivraCaptureMediaVerifier\.verifyFile\(file, in: root\)/);
  assert.match(ios, /WivraCaptureMediaVerifier\.verifyAudioFile\(file, in: root\)/);
  assert.match(ios, /"WivraRecordings", "WivraIPhoneMedia"/);
  assert.match(ios, /allowedFolders\.contains\(captureRoot\)/);
  assert.match(ios, /trackNames\.allSatisfy\(\{ names\.contains\(\$0\) \}\)/);
  assert.match(ios, /tracks\.count <= 32/);
  assert.match(ios, /guard names == declaredNames else \{ return nil \}/);
  assert.match(ios, /declaredNames\.insert\(original\)/);
  assert.match(ios, /guard let tracks = declared\["tracks"\] as\? \[\[String: Any\]\]/);
  assert.match(ios, /declared\["muxedVideoFile"\]/);
  assert.match(ios, /manifestSize > 0, manifestSize <= 128 \* 1024/);
  assert.match(ios, /\["mov", "mp4"\]\.contains\(\$0\.pathExtension\.lowercased\(\)\)/);
  assert.match(ios, /let original = declared\["originalVideoFile"\] as\? String/);
  assert.match(ios, /names\.count == urls\.count - 1, names\.contains\(original\)/);
  assert.match(ios, /let checked = await self\?\.verifiedCaptureURLs\(urls\)/);
  assert.match(ios, /self\?\.finishSelection\(checked\)/);
});


test('iPhone direct Photos save is add-only and offered only for verified MP4 exports', () => {
  const bridge = read('../../streaming/ios/B0/Sources/WivraExportNativeBridge.swift');
  const sink = read('../export-sink.mjs');
  const template = read('../template.html');
  assert.match(bridge, /import Photos/);
  assert.match(bridge, /if op == "savePhotos"/);
  assert.match(bridge, /savedURL\(token: request\.token, owner: owner\)/);
  const store = read('../../streaming/ios/B0/Sources/WivraExportStore.swift');
  assert.match(store, /func savedURL\(token: Int, owner: String\? = nil\)/);
  assert.match(store, /func append\(token: Int, seq: Int, data: Data, owner: String\? = nil\)/);
  assert.match(store, /func finish\(token: Int, bytes: Int64, crc32: UInt32, chunks: Int, repair: Bool = true, owner: String\? = nil\)/);
  assert.match(store, /func abort\(token: Int, owner: String\? = nil\)/);
  assert.match(bridge, /store\.append\(token: request\.token, seq: request\.seq, data: request\.data \?\? Data\(\), owner: owner\)/);
  assert.match(bridge, /store\.abort\(token: request\.token, owner: owner\)/);
  assert.match(bridge, /requestAuthorization\(for: \.addOnly\)/);
  assert.match(bridge, /await WivraMp4Repair\.inspect\(url\)/);
  assert.match(bridge, /media\.video, media\.durationMs > 0/);
  assert.ok(bridge.indexOf('await WivraMp4Repair.inspect(url)') < bridge.indexOf('requestAuthorization(for: .addOnly)'));
  assert.match(bridge, /creationRequestForAssetFromVideo\(atFileURL: url\)/);
  assert.match(sink, /export function saveExportToPhotos\(host, token\)/);
  assert.match(template, /host\?\.platform === 'ios' && r\.ext === 'mp4'/);
  assert.match(template, /await saveExportToPhotos\(host, token\)/);
});


test('native iOS export library restores shareable files after app relaunch', () => {
  const store = read('../../streaming/ios/B0/Sources/WivraExportStore.swift');
  const app = read('../../streaming/ios/B0/Sources/WivraMetaB0App.swift');
  const smoke = read('../../streaming/tests/WivraExportStoreSmoke.swift');
  assert.match(store, /func listSavedExports\(\) -> \[WivraSavedExport\]/);
  assert.match(store, /values\.isRegularFile == true, values\.isSymbolicLink != true/);
  assert.match(store, /Self\.looksLikeContainer\(/);
  assert.match(app, /showingExportLibrary = true/);
  assert.match(app, /WivraNativeExportLibraryScreen\(\)/);
  assert.match(app, /ShareLink\(item: video\.url\)/);
  assert.match(smoke, /completed video must be discoverable after reopening Wivra/);
});


test('recovered native exports can save MP4 directly to add-only Photos while preserving local files', () => {
  const app = read('../../streaming/ios/B0/Sources/WivraMetaB0App.swift');
  const bridge = read('../../streaming/ios/B0/Sources/WivraExportNativeBridge.swift');
  const store = read('../../streaming/ios/B0/Sources/WivraExportStore.swift');
  assert.match(bridge, /enum WivraPhotosLibrary/);
  assert.match(bridge, /requestAuthorization\(for: \.addOnly\)/);
  assert.match(bridge, /creationRequestForAssetFromVideo\(atFileURL: url\)/);
  assert.match(bridge, /try await WivraPhotosLibrary\.saveVideo\(url\)/);
  assert.match(app, /video\.url\.pathExtension\.lowercased\(\) == "mp4"/);
  assert.match(app, /try await WivraPhotosLibrary\.saveVideo\(video\.url\)/);
  assert.match(app, /wivra_export_library_save_photos/);
  assert.match(store, /func listSavedExports\(\) -> \[WivraSavedExport\]/);
  assert.doesNotMatch(app, /FileManager\.default\.removeItem\(at: video\.url\)/);
});

test('saved exports native controls are translated in every supported iOS language', () => {
  const app = read('../../streaming/ios/B0/Sources/WivraMetaB0App.swift');
  const keys = ['ios.app.exports', 'ios.exports.title', 'ios.exports.empty',
    'ios.exports.empty_description', 'ios.exports.share', 'ios.exports.close',
    'ios.exports.save_photos', 'ios.exports.saved_photos', 'ios.exports.photos_error'];
  for (const key of keys) assert.ok(app.includes('"' + key + '"'), 'UI must reference '+key);
  for (const language of ['es', 'en', 'pt', 'fr', 'de', 'ja', 'zh', 'it']) {
    const strings = read('../../streaming/ios/B0/Resources/' + language + '.lproj/Localizable.strings');
    for (const key of keys) {
      assert.ok(strings.includes('"' + key + '" = "'), language + ' missing '+key);
    }
  }
});


test('overlay loss cannot silently enter final export and requires one-export consent', () => {
  const template = read('../template.html');
  const exporter = read('../export.mjs');
  assert.match(template, /id="expAllowOverlayGaps"/);
  assert.match(template, /\$\('expAllowOverlayGaps'\)\.checked = false/);
  assert.match(template, /allowIncompleteOverlay: \$\('expAllowOverlayGaps'\)\.checked/);
  assert.match(template, /if \(r\.overlayBlocked\)/);
  assert.match(exporter, /overlayPreflight\.overlayBlocked && !allowIncompleteOverlay/);
  assert.match(exporter, /await sink\.abort\('missing-overlay'\)/);
  assert.ok(exporter.indexOf("const overlayPreflight = exportOverlayPreflight(") <
    exporter.indexOf("rec = new MediaRecorder(stream"), 'overlay preflight must happen before starting recording');
  assert.match(exporter, /cancelled-before-recorder/);
  assert.match(exporter, /if \(isCancelled\(\) \|\| \(overlayPreflight\.overlayBlocked && !allowIncompleteOverlay\)\)/);
});
