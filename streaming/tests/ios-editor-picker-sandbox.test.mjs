import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../ios/B0/Sources/WivraEmbeddedEditorScreen.swift', import.meta.url), 'utf8');

test('iOS Files picker copies document-provider files before handing them to WKWebView', () => {
  assert.match(source, /UIDocumentPickerViewController\(forOpeningContentTypes: \[\.item\], asCopy: true\)/);
  assert.doesNotMatch(source, /UIDocumentPickerViewController\(forOpeningContentTypes: \[\.item\], asCopy: false\)/);
  assert.match(source, /picker\.allowsMultipleSelection = parameters\.allowsMultipleSelection/);
  assert.match(source, /finishSelection\(urls\)/);
});

test('iOS native editor keeps file selection restricted to bundled main frame', () => {
  assert.match(source, /frame\.isMainFrame/);
  assert.match(source, /frame\.request\.url\?\.isFileURL == true/);
  assert.match(source, /approved\?\.standardizedFileURL == url\.standardizedFileURL/);
  assert.match(source, /configuration\.userContentController\.addScriptMessageHandler/);
});
