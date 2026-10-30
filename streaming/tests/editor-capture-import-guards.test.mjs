import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../../app/template.html', import.meta.url), 'utf8');
const capture = html.slice(html.indexOf('async function importCapture(files) {'), html.indexOf('async function importSelectedFiles(files) {'));
const generic = html.slice(html.indexOf('async function importSelectedFiles(files) {'));

test('capture import rejects ambiguous manifests before staging assets', () => {
  assert.match(capture, /manifests\.length !== 1/);
  assert.match(capture, /names\.has\(file\.name\)/);
  assert.match(capture, /otherJson\.length/);
  assert.ok(capture.indexOf('names.has(file.name)') < capture.indexOf('const open = async'));
  assert.ok(capture.indexOf('otherJson.length') < capture.indexOf('const open = async'));
});

test('generic media import does not silently treat capture manifest as video', () => {
  assert.match(generic, /files\.some\(f => \/\\\.wivra\\\.json\$\/i\.test\(f\.name\)\)/);
  assert.ok(generic.indexOf('files.some(') < generic.indexOf('loading = true'));
});
