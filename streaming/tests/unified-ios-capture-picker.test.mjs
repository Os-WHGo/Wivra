import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(
  new URL('../ios/B0/Sources/WivraEmbeddedEditorScreen.swift', import.meta.url),
  'utf8'
);
const html = readFileSync(new URL('../../app/dist/agentcut.html', import.meta.url),'utf8');

test('Wivra native capture picker uses existing manifest import, no new editor', () => {
  assert.match(source, /runOpenPanelWith parameters: WKOpenPanelParameters/);
  assert.match(source, /WivraLocalCaptureScanner\.read\(\)/);
  assert.match(source, /parameters\.allowsMultipleSelection/);
  assert.match(source, /item\.manifestURL, video/);
  assert.match(source, /item\.audioURLs/);
  assert.match(source, /item\.alternateVideoURL/);
  const index = readFileSync(new URL('../ios/B0/Sources/WivraNativeCaptureLibrary.swift', import.meta.url),'utf8');
  assert.match(index, /alternateVideoURL/);
  assert.match(source, /view\.uiDelegate = context\.coordinator/);
  assert.match(html, /id="capFile"/);
  assert.match(html, /async function importCapture\(files\)/);
});

test('Only completed app-local recordings are offered, system file picker still works', () => {
  assert.match(source, /filter \{ \$0\.videoURL != nil \}/);
  assert.match(source, /UIDocumentPickerViewController/);
  assert.match(source, /asCopy: false/);
  assert.match(source, /finishSelection\(nil\)/);
  assert.match(source, /frame\.isMainFrame/);
  assert.match(source, /requestURL\.isFileURL/);
  assert.match(source, /approvedEditor\?\.standardizedFileURL == requestURL\.standardizedFileURL/);
  assert.match(source, /let approvedEditor = Bundle\.main\.url\(forResource: "agentcut", withExtension: "html"\)/);
  assert.doesNotMatch(source, /evaluateJavaScript\(/);
  assert.doesNotMatch(source, /live\.start/);
});

test('Native capture scanner refuses symlink escapes and nonregular media', () => {
  const library = readFileSync(new URL('../ios/B0/Sources/WivraNativeCaptureLibrary.swift', import.meta.url), 'utf8');
  assert.match(library, /private static func regularCaptureFile\(/);
  assert.match(library, /resolvingSymlinksInPath\(\)/);
  assert.match(library, /resolvedFile\.deletingLastPathComponent\(\) == resolvedFolder/);
  assert.match(library, /\.isRegularFileKey/);
  assert.match(library, /regularCaptureFile\(manifestURL, in: folder\)/);
  assert.match(library, /regularCaptureFile\(original, in: folder\)/);
  assert.match(library, /regularCaptureFile\(url, in: folder\)/);
});

test('Embedded editor subframes stay inside bundled resources', () => {
  assert.match(source, /let bundledDirectory = Bundle\.main\.url/);
  assert.match(source, /let localResource = url\.isFileURL/);
  assert.match(source, /file\.path\.hasPrefix\(root\.path \+ "\/"\)/);
  assert.match(source, /url\.resolvingSymlinksInPath\(\)/);
  assert.match(source, /url\.absoluteString == "about:blank"/);
  assert.match(source, /decisionHandler\(localResource \|\| safeBlankDocument \? \.allow : \.cancel\)/);
});

test('Native capture readiness is validated without exposing private media paths', () => {
  const bridge = readFileSync(new URL('../ios/B0/Sources/WivraEditorNativeBridge.swift', import.meta.url), 'utf8');
  assert.match(bridge, /case "library\.importSelection":/);
  assert.match(bridge, /captureId\.count <= 200/);
  assert.match(bridge, /\$0\.id == captureId && \$0\.videoURL != nil/);
  assert.match(bridge, /"readyForPicker": true/);
  assert.match(bridge, /"nativeMediaImport": "file_picker"/);
  assert.doesNotMatch(bridge, /"videoPath"\s*:/);
  assert.match(source, /checkCapture: \(captureId\)/);
  assert.match(html, /WivraEditorImport/);
});
