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
  assert.match(source, /selected\.manifestURL, video/);
  assert.match(source, /selected\.audioURLs/);
  assert.match(source, /selected\.alternateVideoURL/);
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
  assert.match(source, /webView\.evaluateJavaScript\("window\.__wivraCaptureInputIntent === true"\)/);
  assert.match(source, /offerCaptureBundles: multiple && result as\? Bool == true/);
  assert.match(source, /if offerCaptureBundles \{/);
  assert.match(source, /picker\.allowsMultipleSelection = allowsMultiple/);
  assert.match(source, /el\?\.id === 'capFile'/);
  assert.doesNotMatch(source, /evaluateJavaScript\(".*file:|evaluateJavaScript\(".*videoPath/);
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

test('iOS capture bundles cannot appear in the ordinary multi-video chooser',()=>{
 const sourceFile=source.indexOf('window.__wivraCaptureInputIntent === true');
 const choice=source.indexOf('if offerCaptureBundles {');
 assert.ok(sourceFile>0 && choice>sourceFile);
 assert.match(source,/window\.__wivraCaptureInputIntent = false/);
 assert.match(source,/document\.addEventListener\('click'/);
 assert.match(source,/input\[type="file"\]/);
 assert.match(source,/let multiple = parameters\.allowsMultipleSelection/);
 assert.doesNotMatch(source,/if parameters\.allowsMultipleSelection \{\s*for item in ready/);
 assert.match(source,/UIDocumentPickerViewController\(forOpeningContentTypes: \[\.item\], asCopy: false\)/);
});

test('iOS editor presents chooser from visible SwiftUI sheet and refuses zero-byte capture files',()=>{
 assert.match(source,/private func visiblePresenter\(for webView: WKWebView\) -> UIViewController\?/);
 assert.match(source,/while let presented = current\?\.presentedViewController/);
 assert.match(source,/let presenter = visiblePresenter\(for: webView\)/);
 assert.doesNotMatch(source,/let presenter = webView\.window\?\.rootViewController/);
 const scanner=readFileSync(new URL('../ios/B0/Sources/WivraNativeCaptureLibrary.swift',import.meta.url),'utf8');
 assert.match(scanner,/\.fileSizeKey/);
 assert.match(scanner,/\(values\?\.fileSize \?\? 0\) > 0/);
});

test('iOS scanner rejects huge or logically inconsistent sidecars before WebKit chooser',()=>{
 const s=readFileSync(new URL('../ios/B0/Sources/WivraNativeCaptureLibrary.swift',import.meta.url),'utf8');
 assert.match(s,/isSymbolicLinkKey/);
 assert.match(s,/rawProperties\?\.isSymbolicLink != true/);
 assert.match(s,/manifestBytes <= 128 \* 1024/);
 assert.match(s,/m\.captureID\.count <= 200/);
 assert.match(s,/m\.tracks\.count <= 32/);
 assert.match(s,/trackIds\.count == m\.tracks\.count/);
 assert.match(s,/muxIds\.isSubset\(of: trackIds\)/);
 assert.match(s,/m\.muxedVideoFile != nil \|\| muxIds\.isEmpty/);
 assert.match(s,/\$0\.sampleRateHz\.map \{ \$0\.isFinite && \$0 > 0 \}/);
 assert.match(s,/\$0\.startOffsetSeconds\.map \{ \$0\.isFinite \}/);
});

test('iOS native editor chooser does not truncate older saved captures', () => {
  assert.match(source, /WivraCaptureSearchView\(captures: ready\)/);
  assert.match(source, /\.searchable\(text: \$query/);
  assert.match(source, /onSelect\(capture\)/);
  assert.match(source, /Grabaciones de Wivra/);
  assert.match(source, /Grabaciones de Wivra/);
  assert.doesNotMatch(source, /ready\.prefix\(12\)/);
});
