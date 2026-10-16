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
test('resumen de «Mis proyectos»: nombre, clips, duración; ids y nombre por defecto', async () => {
  const { makeMeta, newProjectId, defaultName } = await import('../persist.mjs');
  const m = makeMeta({ id: 'p1', name: '  '.repeat(0) + 'x'.repeat(100), project: sample(), now: 5 });
  assert.equal(m.name.length, 60); assert.equal(m.clips, 2); assert.equal(m.duration, 10); assert.equal(m.updatedAt, 5);
  assert.equal(makeMeta({ id: 'p2', name: '', project: sample() }).name, 'Proyecto');
  assert.notEqual(newProjectId(1, 0.1), newProjectId(2, 0.1)); assert.match(newProjectId(), /^p[a-z0-9]+$/);
  assert.match(defaultName(Date.UTC(2026, 9, 14, 12, 5)), /^Proyecto \d+ oct \d\d:\d\d$/);
});

// ── Notas del Director dentro del proyecto ──
import { cleanDirector, DIRECTOR_DRAFT_MAX } from '../persist.mjs';
import { createShootPlan } from '../../core/shoot-checklist.mjs';
import { createDirectorBrief } from '../../core/creative-director.mjs';
import { createDirectorDraftRecord, restoreDirectorDraftRecord } from '../../core/director-intake.mjs';

const plan = () => createShootPlan({ subject: 'el parque', platform: 'reels', durationSeconds: 30, shotCount: 4 });
const draft = () => createDirectorDraftRecord(createDirectorBrief({ mode: 'automatic', goal: 'reel del parque', platforms: ['reels'], notes: 'tono alegre' }));

test('el Director viaja con el proyecto: idea y lista de tomas sobreviven guardar → reabrir', () => {
  const sp = plan(), dr = draft();
  const snap = makeSnapshot({ project: sample(), director: { draft: dr, shootPlan: sp }, now: 5 });
  const r = readSnapshot(JSON.parse(JSON.stringify(snap)));
  assert.ok(r.ok, JSON.stringify(r)); assert.deepEqual(r.snapshot.director.shootPlan, sp); assert.equal(r.snapshot.director.draft, dr);
  assert.equal(restoreDirectorDraftRecord(r.snapshot.director.draft).notes, 'tono alegre');
});
test('sin notas del Director no se agrega el campo; los proyectos viejos siguen abriendo', () => {
  assert.equal('director' in makeSnapshot({ project: sample() }), false);
  assert.equal('director' in makeSnapshot({ project: sample(), director: { draft: null, shootPlan: null } }), false);
  const old = makeSnapshot({ project: sample() }); const r = readSnapshot(old); assert.ok(r.ok); assert.equal(r.snapshot.director, undefined); assert.deepEqual(r.warnings, []);
});
test('notas del Director dañadas se descartan con aviso y el proyecto abre igual', () => {
  const snap = makeSnapshot({ project: sample() });
  for (const bad of [{ draft: 42 }, { draft: 'x'.repeat(DIRECTOR_DRAFT_MAX + 1) }, { shootPlan: { schema: 'otro', shots: [] } }, { shootPlan: { schema: 'agentcut-shoot-plan-v0.1', shots: 'no' } }, { shootPlan: { schema: 'agentcut-shoot-plan-v0.1', shots: new Array(51).fill({}) } }]) {
    const r = readSnapshot({ ...snap, director: bad });
    assert.ok(r.ok, JSON.stringify(bad).slice(0, 40)); assert.equal(r.snapshot.director, undefined); assert.equal(r.warnings.length, 1);
  }
  const mixed = readSnapshot({ ...snap, director: { draft: draft(), shootPlan: { schema: 'x', shots: [] } } });
  assert.ok(mixed.snapshot.director.draft && !mixed.snapshot.director.shootPlan);       // lo bueno se conserva
  assert.deepEqual(cleanDirector('basura'), { director: null, warnings: [] });
});
test('el Director guardado es una copia: cambiarlo después no altera la instantánea', () => {
  const sp = plan(), snap = makeSnapshot({ project: sample(), director: { shootPlan: sp } }); sp.shots[0].title = 'CAMBIADO';
  assert.notEqual(snap.director.shootPlan.shots[0].title, 'CAMBIADO');
});

test('el estilo de los textos se guarda y se reabre; un estilo dañado se quita con aviso', () => {
  const s = new Session(createProject({ assets: [] })); s.addAsset({ id: 'a1', duration: 10, name: 'a.mov' });
  assert.ok(s.apply([{ op: 'add_clip', asset_id: 'a1', start: 0 }, { op: 'add_text', text: 'Hola', start: 0, duration: 2, pos: 'top', size: 'l', color: '#ffd24a', box: '#000000' }, { op: 'add_text', text: 'Chao', start: 2, duration: 2 }]).ok);
  const raw = JSON.stringify(makeSnapshot({ project: s.project, media: {}, assetSeq: 1, tlTime: 0, stored: [] })), ok = readSnapshot(raw);
  assert.deepEqual([ok.snapshot.project.texts[0].pos, ok.snapshot.project.texts[0].size, ok.snapshot.project.texts[0].color, ok.snapshot.project.texts[0].box], ['top', 'l', '#ffd24a', '#000000']);
  const bad = JSON.parse(raw); bad.project.texts[1].pos = 'izquierda'; bad.project.texts[1].color = 'rojo'; bad.project.texts[0].box = 5;
  const r = readSnapshot(JSON.stringify(bad)); assert.ok(r.ok !== false && r.snapshot, 'abre igual'); const t = r.snapshot.project.texts;
  assert.equal(t[1].pos, undefined); assert.equal(t[1].color, undefined); assert.equal(t[0].box, undefined); assert.equal(t[0].pos, 'top');
  assert.ok(r.warnings.some((w) => /estilo de texto/.test(w)));
});
