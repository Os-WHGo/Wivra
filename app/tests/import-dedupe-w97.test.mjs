// W97 (Claude): importing the same file again reuses its asset instead of keeping the bytes twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const tpl = readFileSync(new URL('../template.html', import.meta.url), 'utf8');

// Integrity fix (MU V4): name, size and date only pick candidates; reuse needs identical bytes (file-identity.test.mjs).
test('only a file with identical bytes, still in the project, is reused', () => {
  const fn = tpl.slice(tpl.indexOf('async function sameFileAsset('), tpl.indexOf('async function importSelectedFiles('));
  assert.match(fn, /k\.name !== f\.name \|\| k\.size !== f\.size/);
  assert.match(fn, /session\.project\.assets\.some\(\(a\) => a\.id === id\)/);
  assert.match(fn, /if \(await sameBytes\(k, f/);
});

test('a reused asset is not staged (the failed-import cleanup never removes it) and Ray-Ban part batches are untouched', () => {
  const imp = tpl.slice(tpl.indexOf('async function importSelectedFiles('), tpl.indexOf("$('file').addEventListener('change'"));
  assert.match(imp, /const again = requireAll \? null : await sameFileAsset\(f\);/);
  assert.match(imp, /if \(again\) \{ added\.push\(again\); reused\+\+; continue; \}/);
  assert.ok(imp.indexOf('if (again)') < imp.indexOf('staged.push(id)'));
  assert.match(imp, /const unused = new Set\(staged\.filter/);
});
