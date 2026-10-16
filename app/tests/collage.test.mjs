import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, clipLength, totalDuration } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';
import { planTemplate, planCollage, COLLAGE_LAYOUTS } from '../templates.mjs';

const assets = [{ id: 'a', kind: 'video', name: 'a', duration: 20 }, { id: 'b', kind: 'video', name: 'b', duration: 20 }, { id: 'c', kind: 'video', name: 'c', duration: 20 }, { id: 'd', kind: 'video', name: 'd', duration: 20 }, { id: 'e', kind: 'video', name: 'e', duration: 20 }, { id: 'f', kind: 'image', name: 'f', duration: 30 }, { id: 'm', kind: 'audio', name: 'm', duration: 60 }];
const lens = [10, 8, 12, 6, 9];
const mk = (n, extra = []) => {
  const ids = ['a', 'b', 'c', 'd', 'e'], ops = []; let t = 0;
  for (let i = 0; i < n; i++) { ops.push({ op: 'add_clip', asset_id: ids[i], start: t }, { op: 'trim_clip', clip_id: `c${i + 1}`, in: 0, out: lens[i] }); t += lens[i]; }
  const r = applyBatch(createProject({ assets }), [...ops, ...extra]); assert.ok(r.ok, JSON.stringify(r)); return r.project;
};
const apply = (p, plan) => { assert.ok(plan.ok, JSON.stringify(plan)); const r = applyBatch(p, plan.ops); assert.ok(r.ok, JSON.stringify(r)); return r.project; };

test('collage de 2: 9:16, dos cuadros uno sobre otro, duran lo del más corto, suena solo el 1.º', () => {
  const p = mk(2), plan = planTemplate(p, 'collage'); const q = apply(p, plan);
  assert.equal(q.format.aspect, '9:16'); assert.equal(q.clips.length, 1); assert.equal(q.overlayClips.length, 2);
  assert.equal(clipLength(q.clips[0]), 8); assert.deepEqual(q.overlayClips.map((o) => [o.asset_id, o.start, clipLength(o), o.track, o.x, o.y, o.shape, o.muted]), [['a', 0, 8, 1, 0.5, 0.25, 'square', true], ['b', 0, 8, 2, 0.5, 0.75, 'square', true]]);
  assert.equal(q.overlayClips[0].scale, COLLAGE_LAYOUTS[2].scale); assert.equal(totalDuration(q), 8);
});
test('collage de 3 y de 4: 3 en 9:16 llenan el alto; 4 en 1:1 en cuadrícula; los demás clips siguen después y se corren', () => {
  const q3 = apply(mk(3), planTemplate(mk(3), 'collage')); assert.equal(q3.format.aspect, '9:16'); assert.deepEqual(q3.overlayClips.map((o) => +o.y.toFixed(3)), [0.167, 0.5, 0.833]);
  const p5 = mk(5), q = apply(p5, planTemplate(p5, 'collage')); assert.equal(q.format.aspect, '1:1'); assert.equal(q.overlayClips.length, 4);
  assert.deepEqual(q.overlayClips.map((o) => [o.x, o.y]), [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]]);
  assert.equal(clipLength(q.clips[0]), 6, 'el video más corto de los 4 primeros (6 s)'); assert.equal(q.clips.length, 2); assert.equal(q.clips[1].start, 6, 'el 5.º clip sigue justo después'); assert.equal(totalDuration(q), 15);
  assert.ok(planTemplate(p5, 'collage').warnings.some((w) => /Solo entran los primeros 4/.test(w)));
});
test('collage con fotos: duran lo del video más corto; sin videos usa lo de las fotos; con 1 clip o sin espacio de capas da error claro', () => {
  const p = applyBatch(mk(2), [{ op: 'add_photo_clip', asset_id: 'f', start: 18, duration: 3 }]).project, q = apply(p, planTemplate(p, 'collage'));
  assert.equal(q.overlayClips.length, 3); assert.ok(q.overlayClips.every((o) => Math.abs(clipLength(o) - 8) < 0.01), 'la foto se alarga a 8 s');
  assert.match(planTemplate(mk(1), 'collage').error, /al menos dos clips/);
  const busy = applyBatch(mk(2), [{ op: 'add_overlay_clip', asset_id: 'c', start: 0, in: 0, out: 5, track: 3 }]).project; assert.match(planTemplate(busy, 'collage').error, /filas libres/);
});
test('audio aparte: el del 1.º se recorta, el de los cuadros 2..N se silencia y va junto a su cuadro, el de lo que sigue se corre', () => {
  const p = mk(5, [{ op: 'add_audio_clip', asset_id: 'm', start: 0, in: 0, out: 10, role: 'voice_primary' }, { op: 'add_audio_clip', asset_id: 'm', start: 10, in: 5, out: 13, role: 'voice_guest' }, { op: 'add_audio_clip', asset_id: 'm', start: 36, in: 0, out: 9, role: 'voice_primary' }]);
  const q = apply(p, planTemplate(p, 'collage')), [u1, u2, u3] = q.audioClips;      // L = 6 (el más corto de los 4 primeros)
  assert.equal(clipLength(u1), 6); assert.equal(u1.start, 0); assert.ok(!u1.muted, 'el audio del 1.º sigue sonando');
  assert.equal(u2.start, 0); assert.equal(u2.muted, true); assert.equal(clipLength(u2), 6);
  assert.equal(u3.start, 6, 'el audio del 5.º clip se corre con él'); assert.equal(q.clips[1].start, 6);
});
test('repetir la plantilla no rompe: con un proyecto ya hecho collage da error o no cambia nada peligroso', () => {
  const p = mk(2), q = apply(p, planTemplate(p, 'collage')), again = planTemplate(q, 'collage'); assert.equal(again.ok, false);
});
test('la lista de plantillas incluye el collage y el resto sigue igual', () => {
  assert.ok(planCollage(mk(2)).ok); assert.equal(planTemplate(mk(2), 'collage').template.id, 'collage');
});
