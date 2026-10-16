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
  assert.match(source, /frame\.request\.url\?\.isFileURL == true/);
  assert.doesNotMatch(source, /evaluateJavaScript\(/);
  assert.doesNotMatch(source, /live\.start/);
});
