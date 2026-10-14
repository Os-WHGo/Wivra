import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, totalDuration } from '../project.mjs';
import { Session } from '../session.mjs';
import { planEdit } from '../../app/timeline.mjs';

const assets = [{ id: 'v', duration: 10, name: 'v.mov' }];
const mk = () => { const s = new Session(createProject({ assets })); assert.ok(s.apply([{ op: 'add_clip', asset_id: 'v', start: 0 }]).ok); return s; };

test('set_format: valida y conserva lo que no se pide; deshacer vuelve al formato anterior', () => {
  const s = mk(); assert.deepEqual(s.project.format, { aspect: 'original', fit: 'cover' });
  assert.ok(s.apply([{ op: 'set_format', aspect: '9:16' }]).ok); assert.deepEqual(s.project.format, { aspect: '9:16', fit: 'cover' });
  assert.ok(s.apply([{ op: 'set_format', fit: 'contain' }]).ok); assert.deepEqual(s.project.format, { aspect: '9:16', fit: 'contain' });
  for (const op of [{}, { aspect: '3:2' }, { fit: 'stretch' }, { aspect: 9 }]) assert.equal(s.apply([{ op: 'set_format', ...op }]).ok, false, JSON.stringify(op));
  s.undo(); assert.equal(s.project.format.fit, 'cover'); s.undo(); assert.equal(s.project.format.aspect, 'original');
  const p = createProject({ assets }); delete p.format; const t = new Session(p); assert.ok(t.apply([{ op: 'set_format', aspect: '1:1' }]).ok); assert.deepEqual(t.project.format, { aspect: '1:1', fit: 'cover' });   // proyectos viejos
});
test('borrar solo el video y conservar el audio: un lote, un deshacer; el audio sigue en su sitio y queda un hueco', () => {
  const s = mk(); s.apply([{ op: 'split_clip', clip_id: 'c1', at: 4 }]); const mid = s.project.clips.find((c) => c.in === 4);   // trozo 4–10
  s.apply([{ op: 'split_clip', clip_id: mid.id, at: 7 }]); const piece = s.project.clips.find((c) => c.in === 4);                // trozo 4–7 en el timeline 4–7
  const ops = [{ op: 'add_audio_clip', asset_id: piece.asset_id, start: piece.start, in: piece.in, out: piece.out, role: 'other' }, { op: 'delete_clip', clip_id: piece.id }];
  const plan = planEdit(s.project, ops, { ripple: false }); assert.ok(plan.ok, JSON.stringify(plan)); assert.ok(s.apply(plan.ops).ok);
  assert.equal(s.project.clips.length, 2); assert.equal(s.project.audioClips.length, 1);
  const a = s.project.audioClips[0]; assert.deepEqual([a.start, a.in, a.out], [4, 4, 7]);
  assert.deepEqual(s.project.clips.map((c) => c.start).sort((x, y) => x - y), [0, 7]);     // no se cerró el hueco
  s.undo(); assert.equal(s.project.clips.length, 3); assert.equal(s.project.audioClips.length, 0);
});

import { timelineEnd } from '../project.mjs';
import { exportPlan } from '../../app/export.mjs';
test('sin video principal, el audio que queda alarga la línea de tiempo y la exportación', () => {
  const s = mk(); const c = s.project.clips[0];
  const plan = planEdit(s.project, [{ op: 'add_audio_clip', asset_id: c.asset_id, start: 0, in: 0, out: 10, role: 'other' }, { op: 'delete_clip', clip_id: c.id }], { ripple: false });
  assert.ok(s.apply(plan.ops).ok);
  assert.equal(totalDuration(s.project), 0); assert.equal(timelineEnd(s.project), 10);
  const ep = exportPlan(s.project); assert.equal(ep.total, 10); assert.deepEqual(ep.segments.map((x) => x.type), ['gap']);
});

import { fxAt } from '../../app/export.mjs';
test('set_clip_fx: valida, deshace, y el corte reparte entrada/salida; fxAt da alpha/desplazamiento/escala', () => {
  const s = mk(); assert.ok(s.apply([{ op: 'set_clip_fx', clip_id: 'c1', intro: 'fade', outro: 'zoom', dur: 1 }]).ok);
  assert.deepEqual([s.project.clips[0].fxIn, s.project.clips[0].fxOut, s.project.clips[0].fxDur], ['fade', 'zoom', 1]);
  for (const op of [{ intro: 'spin' }, { dur: 9 }, {}, { clip_id: 'zz', intro: 'fade' }]) assert.equal(s.apply([{ op: 'set_clip_fx', clip_id: 'c1', ...op }]).ok, false, JSON.stringify(op));
  assert.ok(s.apply([{ op: 'split_clip', clip_id: 'c1', at: 5 }]).ok);
  const [a, b] = s.project.clips; assert.deepEqual([a.fxIn, a.fxOut, b.fxIn, b.fxOut], ['fade', undefined, undefined, 'zoom']);
  s.undo(); s.undo(); assert.equal(s.project.clips[0].fxIn, undefined);
  const c = { start: 0, in: 0, out: 10, fxIn: 'fade', fxOut: 'slide', fxDur: 1 };
  assert.equal(fxAt(c, 0).alpha, 0); assert.equal(fxAt(c, 0.5).alpha, 0.5); assert.equal(fxAt(c, 5).alpha, 1);
  assert.equal(fxAt(c, 10).dx, 1); assert.equal(fxAt({ ...c, fxIn: 'zoom', fxOut: undefined }, 0).scale, 0.6);
  assert.deepEqual(fxAt({ start: 0, in: 0, out: 4 }, 1), { alpha: 1, dx: 0, scale: 1 });
});
