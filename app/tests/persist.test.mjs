// Guardar/reabrir: partes puras (instantánea, migración, reparación, reconexión de archivos). IndexedDB real se prueba en navegador. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSnapshot, readSnapshot, missingAssets, matchFiles, PERSIST_VERSION } from '../persist.mjs';
import { createProject } from '../../core/project.mjs';
import { Session } from '../../core/session.mjs';

function sample() {
  const s = new Session(createProject({ assets: [] }));
  for (const a of [{ id: 'a1', duration: 10, name: 'a.mov' }, { id: 'a2', duration: 5, name: 'b.mov' }, { id: 'a3', duration: 8, name: 'm.wav' }]) s.addAsset(a);
  const r = s.apply([
    { op: 'add_clip', asset_id: 'a1', start: 0 },
    { op: 'add_overlay_clip', asset_id: 'a2', start: 1, track: 1 },
    { op: 'add_audio_clip', asset_id: 'a3', start: 0, role: 'music' },
    { op: 'set_overlay', clip_id: 'o2', shape: 'heart', zoom: 2, frame: 0.05, frameColor: '#ffcc00', opacity: 0.7 },
    { op: 'set_format', aspect: '9:16', fit: 'cover' },
    { op: 'add_text', text: 'hola', start: 0, duration: 2 },
  ], 0);
  assert.ok(r.ok, JSON.stringify(r));
  return s.project;
}
const media = { a1: { name: 'a.mov', w: 1920, h: 1080, size: 100, type: 'video/quicktime', kind: 'video' }, a2: { name: 'b.mov', w: 720, h: 1280, size: 50, kind: 'video' }, a3: { name: 'm.wav', size: 9, kind: 'audio' } };

test('guardar -> JSON -> leer conserva todo el proyecto', () => {
  const p = sample();
  const snap = makeSnapshot({ project: p, media, assetSeq: 3, tlTime: 4.5, stored: ['a1', 'a3'] });
  const r = readSnapshot(JSON.stringify(snap));
  assert.ok(r.ok); assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.snapshot.project, p);
  assert.equal(r.snapshot.tlTime, 4.5); assert.equal(r.snapshot.assetSeq, 3);
  assert.deepEqual(r.snapshot.assets.map((a) => [a.id, a.stored, a.kind]), [['a1', true, 'video'], ['a2', false, 'video'], ['a3', true, 'audio']]);
  assert.equal(r.snapshot.project.overlayClips[0].shape, 'heart');
  assert.equal(r.snapshot.project.format.aspect, '9:16');
});
test('la instantánea no comparte memoria con el proyecto vivo', () => {
  const p = sample(), snap = makeSnapshot({ project: p, media });
  p.clips[0].start = 99; assert.notEqual(snap.project.clips[0].start, 99);
});
test('seguir editando después de reabrir: ids nuevos no chocan y el deshacer empieza vacío', () => {
  const r = readSnapshot(makeSnapshot({ project: sample(), media }));
  const s = new Session(r.snapshot.project);
  const x = s.apply([{ op: 'add_clip', asset_id: 'a2', start: 10 }], s.project.revision);
  assert.ok(x.ok, JSON.stringify(x));
  assert.equal(new Set([...s.project.clips, ...s.project.overlayClips, ...s.project.audioClips].map((c) => c.id)).size, 4);
  assert.equal(s.undoStack.length, 1); assert.ok(s.undo().ok); assert.equal(s.project.clips.length, 1);
});
test('proyecto viejo sin format/overlayClips/audioClips/nextId se migra', () => {
  const old = { revision: 3, assets: [{ id: 'a1', duration: 10 }], clips: [{ id: 'c1', asset_id: 'a1', start: 0, in: 0, out: 4 }], texts: [] };
  const r = readSnapshot(old);
  assert.ok(r.ok); const p = r.snapshot.project;
  assert.deepEqual(p.format, { aspect: 'original', fit: 'cover' }); assert.deepEqual(p.overlayClips, []); assert.deepEqual(p.audioClips, []);
  assert.equal(p.nextId, 2); assert.equal(r.snapshot.version, PERSIST_VERSION);
});
test('datos dañados: no lanza y avisa', () => {
  for (const bad of ['{no es json', 'null', '42', JSON.stringify({ schema: 'otra-cosa', version: 1 }), JSON.stringify({ schema: 'wivra-project', version: 1 })]) {
    const r = readSnapshot(bad); assert.equal(r.ok, false, bad); assert.ok(r.errors.length);
  }
});
test('versión más nueva se rechaza con mensaje claro', () => {
  const r = readSnapshot({ ...makeSnapshot({ project: sample(), media }), version: PERSIST_VERSION + 1 });
  assert.equal(r.ok, false); assert.match(r.errors[0], /más nueva/);
});
test('clips rotos se descartan con aviso y el resto sobrevive', () => {
  const snap = makeSnapshot({ project: sample(), media });
  snap.project.clips.push({ id: 'c99', asset_id: 'zzz', start: 0, in: 0, out: 1 }, { id: 'c98', asset_id: 'a1', start: NaN, in: 0, out: 1 }, { id: 'c97', asset_id: 'a1', start: 0, in: 2, out: 20 });
  snap.project.nextId = 1;
  const r = readSnapshot(JSON.stringify(snap));
  assert.ok(r.ok); assert.equal(r.warnings.length, 3); assert.equal(r.snapshot.project.clips.length, 1);
  assert.ok(r.snapshot.project.nextId >= 5);
});
test('archivos faltantes y reconexión por nombre/tamaño', () => {
  const r = readSnapshot(makeSnapshot({ project: sample(), media, stored: ['a1'] }));
  const miss = missingAssets(r.snapshot, ['a1']); assert.deepEqual(miss.map((a) => a.id), ['a2', 'a3']);
  const { matches, left } = matchFiles(miss, [{ name: 'b.mov', size: 50 }, { name: 'otro.mov', size: 1 }]);
  assert.deepEqual(matches.map((m) => m.asset.id), ['a2']); assert.deepEqual(left.map((a) => a.id), ['a3']);
  const solo = matchFiles([{ id: 'x', name: 'b.mov', size: 50 }], [{ name: 'b.mov', size: 77 }]);
  assert.equal(solo.matches.length, 1);   // mismo nombre, tamaño distinto: se acepta (la duración se verifica después)
});
