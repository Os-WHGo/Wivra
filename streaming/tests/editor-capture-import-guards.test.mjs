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

test('generic import does not report success after a rejected timeline edit', () => {
  assert.match(generic, /const result = first \? run\(ops\) : edit\(ops, \{ ripple: false \}\)/);
  assert.match(generic, /if \(!result\.ok\) \{/);
  assert.ok(generic.indexOf('if (!result.ok)') < generic.indexOf('thumbQueue = thumbQueue.then'));
});

test('failed generic import releases only unreferenced staged media', () => {
  assert.match(generic, /let committed = false/);
  assert.match(generic, /if \(staged\.length\)/);
  assert.match(generic, /session\.undoStack, \.\.\.session\.redoStack/);
  assert.match(generic, /staged\.filter\(id => !referenced\.has\(id\)/);
  assert.match(generic, /URL\.revokeObjectURL\(url\)/);
  assert.match(generic, /delete mediaFiles\[id\]/);
});

test('generic import cleans up on rejection and unexpected exceptions', () => {
  const rejected = generic.slice(generic.indexOf('if (!result.ok) {'), generic.indexOf('committed = true;'));
  assert.match(rejected, /return;/);
  assert.match(generic, /catch \(error\) \{/);
  assert.match(generic, /finally \{\s*cleanupUncommitted\(\);\s*loading = false;/);
  assert.match(generic, /if \(staged\.length\)/);
});

test('Director only binds an imported asset when the result is unambiguous', () => {
  assert.match(generic, /const newAssets=\(session\?\.project\.assets \|\| \[\]\)\.filter/);
  assert.match(generic, /newAssets\.length===1 \? newAssets\[0\] : null/);
  assert.match(generic, /newAssets\.length>1 && shootPlan && selectedShootId/);
  assert.match(generic, /assetId:added\.id/);
});

test('failed photo preparation is staged but not treated as successfully imported', () => {
  assert.match(generic, /const failed = \[\], added = \[\], staged = \[\]/);
  assert.ok(generic.indexOf('staged.push(id)') < generic.indexOf('await prepGif(id, f)'));
  assert.ok(generic.indexOf('await prepGif(id, f)') < generic.indexOf('added.push(id)'));
  assert.match(generic, /!committed \|\| !added\.includes\(id\)/);
});

test('cleanup tolerates a failed media preparation before a session exists', () => {
  assert.match(generic, /const states = session \? \[session\.project/);
  assert.match(generic, /if \(session && !previousSession && !session\.project\.assets\.length/);
});

test('export revalidates session and revision after async loudness analysis', () => {
  const exportUI = html.slice(html.indexOf("$('expGo').onclick = async () =>"), html.indexOf('/* ---------- IA directa:', html.indexOf("$('expGo').onclick = async ()")));
  assert.match(exportUI, /const exportSession = session/);
  assert.match(exportUI, /const exportRevision = session\.project\.revision/);
  assert.match(exportUI, /session !== exportSession \|\| session\.project\.revision !== exportRevision \|\| pzMissing\.length/);
  assert.ok(exportUI.indexOf('session !== exportSession') < exportUI.indexOf('await recordProject('));
  assert.match(exportUI, /project: exportSession\.project/);
});

test('capture importer reclaims partially prepared resources after failed audio split', () => {
  assert.match(capture, /stagedAssetIDs = \[\], importedAssetIDs = \[\]/);
  assert.ok(capture.indexOf('stagedAssetIDs.push(id)') < capture.indexOf('session.addAsset('));
  assert.match(capture, /const states = session \? \[session\.project/);
  assert.match(capture, /!captureCommitted \|\| !importedAssetIDs\.includes\(id\)/);
  assert.match(capture, /URL\.revokeObjectURL\(url\)/);
});

test('capture import rejects a replaced editor session before applying timeline operations', () => {
  assert.match(capture, /const captureSession = session/);
  assert.match(capture, /if \(captureSession && session !== captureSession\)/);
  assert.ok(capture.indexOf('session !== captureSession') < capture.indexOf('const out = planImportOps('));
});

test('generic importer stages media before persistence and rejects replaced sessions', () => {
  assert.match(generic, /const importSession = session/);
  assert.match(generic, /if \(importSession && session !== importSession\)/);
  assert.ok(generic.indexOf('staged.push(id)') < generic.indexOf("keepFile(id, f, photo ? 'image' : 'video')"));
  assert.ok(generic.indexOf('session !== importSession') < generic.indexOf('const result = first ? run(ops)'));
});

test('capture stages both source video and extracted audio before persistence', () => {
  assert.match(capture, /stagedAssetIDs\.push\(id\); keepFile\(id, f, kind\)/);
  assert.match(capture, /stagedAssetIDs\.push\(id\); keepFile\(id, nf, 'audio'\)/);
});
