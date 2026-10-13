import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../../core/project.mjs';
import { Session } from '../../core/session.mjs';
import { clipAt, rippleOps, planEdit, splitAt, fmtTime, reorderOps } from '../timeline.mjs';

const mk = () => { const s = new Session(createProject({ assets: [{ id: 'a1', duration: 22 }] })); s.apply([{ op: 'add_clip', asset_id: 'a1' }]); return s; };

test('clipAt traduce tiempo de la línea al tiempo del video original', () => {
  const s = mk(); s.apply([{ op: 'trim_clip', clip_id: 'c1', in: 5, out: 10 }]);
  assert.deepEqual(clipAt(s.project, 2).assetTime, 7);
  assert.equal(clipAt(s.project, 5), null);
});

test('dividir y borrar la mitad cierra el hueco (un solo deshacer)', () => {
  const s = mk();
  const sp = splitAt(s.project, 10); assert.equal(sp.ok, true); s.apply(sp.ops);
  assert.equal(s.project.clips.length, 2);
  const del = planEdit(s.project, [{ op: 'delete_clip', clip_id: 'c1' }]);
  assert.equal(del.ok, true); s.apply(del.ops);
  assert.equal(s.project.clips.length, 1);
  assert.equal(s.project.clips[0].start, 0);          // el clip que quedaba se movió a 0
  s.undo(); assert.equal(s.project.clips.length, 2);   // un deshacer revierte borrar + mover
});

test('recortar un clip mueve a los siguientes', () => {
  const s = mk(); s.apply(splitAt(s.project, 10).ops);
  const r = planEdit(s.project, [{ op: 'trim_clip', clip_id: 'c1', in: 0, out: 6 }]);
  s.apply(r.ops);
  assert.equal(s.project.clips.find((c) => c.id === 'c2').start, 6);
});

test('el borde del clip no se puede dividir y los errores del validador pasan', () => {
  const s = mk();
  assert.equal(splitAt(s.project, 0.05).ok, false);
  assert.equal(planEdit(s.project, [{ op: 'trim_clip', clip_id: 'c1', in: 0, out: 99 }]).ok, false);
});

test('rippleOps no hace nada si no hay huecos; formato de tiempo', () => {
  assert.deepEqual(rippleOps(mk().project), []);
  assert.equal(fmtTime(65.25), '1:05.3');
});

test('reordenar clips: B, A queda B en 0 y A después, en un solo deshacer', () => {
  const s = mk(); s.addAsset({ id: 'a2', duration: 5 });
  s.apply([{ op: 'trim_clip', clip_id: 'c1', in: 0, out: 10 }, { op: 'add_clip', asset_id: 'a2', start: 10 }]);
  const ops = reorderOps(s.project, ['c2', 'c1']);
  assert.equal(s.apply(ops).ok, true);
  const get = (id) => s.project.clips.find((c) => c.id === id);
  assert.equal(get('c2').start, 0); assert.equal(get('c1').start, 5);
  s.undo(); assert.equal(get('c1').start, 0);
  assert.equal(reorderOps(s.project, ['c1']), null);          // lista incompleta: se rechaza
});
