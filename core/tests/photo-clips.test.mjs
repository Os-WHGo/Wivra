// Fotos como clips de la línea principal (add_photo_clip). Contrato nuevo y aditivo: add_clip sigue siendo solo para videos. — Claude
import test from 'node:test'; import assert from 'node:assert/strict';
import { applyBatch, PHOTO_SECONDS, MIN_PHOTO_SECONDS } from '../operations.mjs';
import { createProject, totalDuration, timelineEnd } from '../project.mjs';

const base = () => createProject({ assets: [{ id: 'a1', duration: 10, name: 'v.mp4' }, { id: 'a2', duration: 3600, name: 'foto.jpg', kind: 'image' }, { id: 'a3', duration: 8, name: 'm.mp3', kind: 'audio' }] });
const run = (p, ops) => { const r = applyBatch(p, ops); assert.ok(r.ok, r.message); return r.project; };

test('una foto entra en la línea principal con 3 s por omisión y cuenta en la duración', () => {
  const p = run(base(), [{ op: 'add_clip', asset_id: 'a1' }, { op: 'add_photo_clip', asset_id: 'a2', start: 10 }]);
  assert.equal(p.clips.length, 2); const f = p.clips[1];
  assert.deepEqual([f.asset_id, f.in, f.out, f.start], ['a2', 0, PHOTO_SECONDS, 10]); assert.equal(PHOTO_SECONDS, 3);
  assert.equal(totalDuration(p), 13); assert.equal(timelineEnd(p), 13);
});
test('la duración se elige, y no puede ser menor al mínimo ni mayor al medio', () => {
  assert.equal(run(base(), [{ op: 'add_photo_clip', asset_id: 'a2', duration: 7.5 }]).clips[0].out, 7.5);
  for (const duration of [0, 0.2, -1, NaN, 4000, '3']) { const r = applyBatch(base(), [{ op: 'add_photo_clip', asset_id: 'a2', duration }]); assert.equal(r.ok, false, String(duration)); assert.equal(r.code, 'out_of_range'); }
  assert.equal(run(base(), [{ op: 'add_photo_clip', asset_id: 'a2', duration: MIN_PHOTO_SECONDS }]).clips[0].out, MIN_PHOTO_SECONDS);
});
test('solo acepta imágenes que existen, y add_clip / add_audio_clip siguen rechazándolas', () => {
  assert.equal(applyBatch(base(), [{ op: 'add_photo_clip', asset_id: 'a1' }]).code, 'not_a_photo');
  assert.equal(applyBatch(base(), [{ op: 'add_photo_clip', asset_id: 'a3' }]).code, 'not_a_photo');
  assert.equal(applyBatch(base(), [{ op: 'add_photo_clip', asset_id: 'zz' }]).code, 'unknown_asset');
  assert.equal(applyBatch(base(), [{ op: 'add_photo_clip', asset_id: 'a2', start: -1 }]).code, 'bad_time');
  const a = applyBatch(base(), [{ op: 'add_clip', asset_id: 'a2' }]); assert.equal(a.code, 'image_not_allowed'); assert.match(a.message, /add_photo_clip/);
  assert.equal(applyBatch(base(), [{ op: 'add_audio_clip', asset_id: 'a2' }]).code, 'image_not_allowed');
});
test('el lote es todo-o-nada y el proyecto original no cambia', () => {
  const p = base(), r = applyBatch(p, [{ op: 'add_photo_clip', asset_id: 'a2' }, { op: 'add_photo_clip', asset_id: 'a1' }]);
  assert.equal(r.ok, false); assert.equal(r.failed_index, 1); assert.equal(p.clips.length, 0); assert.equal(p.nextId, 1);
});
test('una foto se corta, recorta, mueve, borra y recibe efecto y filtro como cualquier clip principal', () => {
  let p = run(base(), [{ op: 'add_photo_clip', asset_id: 'a2', duration: 6 }]); const id = p.clips[0].id;
  p = run(p, [{ op: 'split_clip', clip_id: id, at: 2 }]); assert.equal(p.clips.length, 2);
  assert.deepEqual(p.clips.map((c) => [c.in, c.out, c.start]), [[0, 2, 0], [2, 6, 2]]);
  p = run(p, [{ op: 'trim_clip', clip_id: id, in: 0, out: 1 }, { op: 'move_clip', clip_id: p.clips[1].id, start: 5 }, { op: 'set_clip_fx', clip_id: id, intro: 'fade', outro: 'zoom', dur: 0.5 }, { op: 'set_clip_filter', clip_id: id, look: 'noir' }]);
  assert.equal(p.clips[0].fxIn, 'fade'); assert.equal(p.clips[0].filter.look, 'noir'); assert.equal(p.clips[1].start, 5);
  p = run(p, [{ op: 'delete_clip', clip_id: id }]); assert.equal(p.clips.length, 1);
});
test('una foto se puede alargar con trim_clip hasta lo que dura el medio, no más', () => {
  const p = run(base(), [{ op: 'add_photo_clip', asset_id: 'a2' }]), id = p.clips[0].id;
  assert.equal(run(p, [{ op: 'trim_clip', clip_id: id, in: 0, out: 20 }]).clips[0].out, 20);
  assert.equal(applyBatch(p, [{ op: 'trim_clip', clip_id: id, in: 0, out: 3601 }]).code, 'out_of_range');
});
test('un proyecto con fotos y videos mezclados mantiene el orden por start', () => {
  const p = run(base(), [{ op: 'add_photo_clip', asset_id: 'a2', start: 0, duration: 2 }, { op: 'add_clip', asset_id: 'a1', start: 2 }, { op: 'add_photo_clip', asset_id: 'a2', start: 12, duration: 4 }]);
  assert.equal(totalDuration(p), 16); assert.deepEqual(p.clips.map((c) => c.id), ['c1', 'c2', 'c3']);
});
