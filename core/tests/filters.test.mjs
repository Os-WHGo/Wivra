import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../project.mjs';
import { Session } from '../session.mjs';
import { LOOK_PRESETS, LOOK_IDS, FILTER_KEYS, FILTER_RANGES, mergeFilter, filterRGB, filterProblem, hasFilter } from '../filters.mjs';

const mk = () => { const s = new Session(createProject({ assets: [{ id: 'a1', duration: 10 }, { id: 'a2', duration: 8 }] })); assert.ok(s.apply([{ op: 'add_clip', asset_id: 'a1', start: 0 }, { op: 'add_overlay_clip', asset_id: 'a2', start: 1 }], 0).ok); return s; };

test('todos los looks tienen parámetros dentro de rango', () => {
  for (const [id, l] of Object.entries(LOOK_PRESETS)) { assert.ok(l.name, id); assert.equal(filterProblem(l.p), null, id); for (const k of Object.keys(l.p)) assert.ok(FILTER_KEYS.includes(k), id + ' ' + k); }
  assert.deepEqual(LOOK_IDS[0], 'none');
});
test('set_clip_filter: look, retoque, quitar; sirve en principal y en capa', () => {
  const s = mk(), r = s.apply([{ op: 'set_clip_filter', clip_id: 'c1', look: 'vintage' }, { op: 'set_clip_filter', clip_id: 'o2', look: 'bw' }], s.project.revision); assert.ok(r.ok, JSON.stringify(r));
  assert.equal(s.project.clips[0].filter.look, 'vintage'); assert.equal(s.project.clips[0].filter.grain, 0.3); assert.equal(s.project.overlayClips[0].filter.saturation, -1);
  assert.ok(s.apply([{ op: 'set_clip_filter', clip_id: 'c1', grain: 0.8 }], s.project.revision).ok);
  assert.equal(s.project.clips[0].filter.look, undefined, 'retocar quita la etiqueta del look'); assert.equal(s.project.clips[0].filter.grain, 0.8); assert.equal(s.project.clips[0].filter.vignette, 0.4);
  assert.ok(s.apply([{ op: 'set_clip_filter', clip_id: 'c1', look: 'none' }], s.project.revision).ok); assert.equal(s.project.clips[0].filter, undefined);
  assert.ok(s.apply([{ op: 'set_clip_filter', clip_id: 'o2', reset: true }], s.project.revision).ok); assert.equal(s.project.overlayClips[0].filter, undefined);
});
test('set_clip_filter valida y es todo-o-nada; deshacer funciona', () => {
  const s = mk(), rev = s.project.revision;
  for (const bad of [{ clip_id: 'zz', look: 'bw' }, { clip_id: 'c1', look: 'nube' }, { clip_id: 'c1', contrast: 2 }, { clip_id: 'c1', grain: -0.1 }, { clip_id: 'c1', brightness: 'mucho' }, { clip_id: 'c1' }]) assert.equal(s.apply([{ op: 'set_clip_filter', ...bad }], rev).ok, false, JSON.stringify(bad));
  assert.equal(s.apply([{ op: 'set_clip_filter', clip_id: 'c1', look: 'bw' }, { op: 'set_clip_filter', clip_id: 'c1', grain: 5 }], rev).ok, false); assert.equal(s.project.clips[0].filter, undefined);
  assert.ok(s.apply([{ op: 'set_clip_filter', clip_id: 'c1', look: 'noir' }], rev).ok); assert.ok(s.undo().ok); assert.equal(s.project.clips[0].filter, undefined);
});
test('un clip de audio no admite filtro; cortar conserva el filtro en las dos partes', () => {
  const s = mk(); s.addAsset({ id: 'a3', duration: 5 }); assert.ok(s.apply([{ op: 'add_audio_clip', asset_id: 'a3', start: 0 }], s.project.revision).ok);
  assert.equal(s.apply([{ op: 'set_clip_filter', clip_id: 'u4', look: 'bw' }], s.project.revision).ok, false);
  assert.ok(s.apply([{ op: 'set_clip_filter', clip_id: 'c1', look: 'film' }, { op: 'split_clip', clip_id: 'c1', at: 4 }], s.project.revision).ok);
  const [a, b] = s.project.clips; assert.deepEqual(a.filter, b.filter); a.filter.grain = 0; assert.notEqual(b.filter.grain, 0, 'copia independiente');
});
test('referencia de color: sin filtro no cambia, blanco y negro iguala canales, viñeta oscurece bordes, calidez sube rojo', () => {
  const px = [0.8, 0.4, 0.2];
  assert.deepEqual(filterRGB(px, null), px); assert.deepEqual(filterRGB(px, {}), px);
  const bw = filterRGB(px, { saturation: -1 }); assert.ok(Math.abs(bw[0] - bw[1]) < 1e-9 && Math.abs(bw[1] - bw[2]) < 1e-9);
  assert.ok(filterRGB(px, { vignette: 1 }, [0, 0])[0] < filterRGB(px, { vignette: 1 }, [0.5, 0.5])[0]);
  const w = filterRGB(px, { warmth: 1 }); assert.ok(w[0] > px[0] && w[2] < px[2]);
  assert.ok(filterRGB([0, 0, 0], { fade: 1 })[0] > 0.1, 'desvanecido levanta los negros');
  assert.ok(hasFilter({ grain: 0.2 }) && !hasFilter({}) && !hasFilter(null));
});
