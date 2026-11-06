// W97 (Claude): importing the same file again reuses its asset instead of keeping the bytes twice.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const tpl = readFileSync(new URL('../template.html', import.meta.url), 'utf8');

test('same name, size and modification date of an asset still in the project → reused', () => {
  const fn = tpl.slice(tpl.indexOf('function sameFileAsset('), tpl.indexOf('async function importSelectedFiles('));
  assert.match(fn, /k\.name !== f\.name \|\| k\.size !== f\.size \|\| \(k\.lastModified \|\| 0\) !== \(f\.lastModified \|\| 0\)/);
  assert.match(fn, /session\.project\.assets\.some\(\(a\) => a\.id === id\)/);
});

test('a reused asset is not staged (the failed-import cleanup never removes it) and Ray-Ban part batches are untouched', () => {
  const imp = tpl.slice(tpl.indexOf('async function importSelectedFiles('), tpl.indexOf("$('file').addEventListener('change'"));
  assert.match(imp, /const again = requireAll \? null : sameFileAsset\(f\);/);
  assert.match(imp, /if \(again\) \{ added\.push\(again\); reused\+\+; continue; \}/);
  assert.ok(imp.indexOf('if (again)') < imp.indexOf('staged.push(id)'));
  assert.match(imp, /const unused = new Set\(staged\.filter/);
});
