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

test('audio en varias filas: add_audio_clip con track, set_audio_clip valida y se deshace', () => {
  const s = mk();
  assert.ok(s.apply([{ op: 'add_audio_clip', asset_id: 'v', start: 0, track: 2, role: 'voice_guest' }]).ok);
  const id = s.project.audioClips[0].id; assert.equal(s.project.audioClips[0].track, 2);
  assert.equal(s.apply([{ op: 'add_audio_clip', asset_id: 'v', track: 9 }]).ok, false);
  assert.ok(s.apply([{ op: 'set_audio_clip', clip_id: id, track: 3, role: 'music' }]).ok); assert.deepEqual([s.project.audioClips[0].track, s.project.audioClips[0].role], [3, 'music']);
  for (const op of [{}, { track: 0 }, { role: 'x' }, { clip_id: 'c1', track: 2 }]) assert.equal(s.apply([{ op: 'set_audio_clip', clip_id: id, ...op }]).ok, false, JSON.stringify(op));
  s.undo(); assert.equal(s.project.audioClips[0].track, 2);
  assert.ok(s.apply([{ op: 'split_clip', clip_id: id, at: 4 }]).ok); assert.equal(s.project.audioClips[1].track, 2);
});

import { SHAPE_IDS } from '../operations.mjs';
import { SHAPE_PATHS, overlayAr, overlayRect, contentRect } from '../../app/export.mjs';
test('formas del superpuesto: validación, valores por defecto se borran, el corte las conserva, y la lista del núcleo coincide con la de la app', () => {
  assert.deepEqual(SHAPE_IDS.filter((x) => x !== 'none').sort(), Object.keys(SHAPE_PATHS).sort());
  const s = mk(); assert.ok(s.apply([{ op: 'add_overlay_clip', asset_id: 'v', start: 0, track: 1 }]).ok); const id = s.project.overlayClips[0].id;
  assert.ok(s.apply([{ op: 'set_overlay', clip_id: id, shape: 'heart', zoom: 2, px: 0.2, py: 0.7 }]).ok);
  const c = s.project.overlayClips[0]; assert.deepEqual([c.shape, c.zoom, c.px, c.py], ['heart', 2, 0.2, 0.7]);
  for (const op of [{ shape: 'nube2' }, { zoom: 0.5 }, { zoom: 9 }, { px: 2 }, { py: -1 }]) assert.equal(s.apply([{ op: 'set_overlay', clip_id: id, ...op }]).ok, false, JSON.stringify(op));
  assert.ok(s.apply([{ op: 'split_clip', clip_id: id, at: 5 }]).ok); assert.equal(s.project.overlayClips[1].shape, 'heart');
  assert.ok(s.apply([{ op: 'set_overlay', clip_id: id, shape: 'none', zoom: 1, px: 0.5, py: 0.5 }]).ok); assert.deepEqual([s.project.overlayClips[0].shape, s.project.overlayClips[0].zoom, s.project.overlayClips[0].px], [undefined, undefined, undefined]);
  assert.equal(overlayAr({ shape: 'circle' }, 1000, 2000), 1); assert.equal(overlayAr({}, 1000, 2000), 2); assert.equal(overlayRect({ scale: 0.5, x: 0.5, y: 0.5, shape: 'star' }, 1000, 1000, 100, 200).h, 500);
  const cr = contentRect(100, 100, 200, 100, 1); assert.deepEqual([cr.w, cr.h, cr.x], [200, 100, -50]);          // 2:1 en cuadro cuadrado: rellena y recorta a los lados
  assert.deepEqual(contentRect(100, 100, 200, 100, 2), { x: -150, y: -50, w: 400, h: 200 });                      // zoom 2 desde el centro
});

test('marco y transparencia del superpuesto: valida, borra los valores por defecto y el corte los conserva', () => {
  const s = mk(); s.apply([{ op: 'add_overlay_clip', asset_id: 'v', start: 0, track: 1 }]); const id = s.project.overlayClips[0].id;
  assert.ok(s.apply([{ op: 'set_overlay', clip_id: id, frame: 0.03, frameColor: '#FF00AA', opacity: 0.6, shape: 'splat' }]).ok);
  const c = s.project.overlayClips[0]; assert.deepEqual([c.frame, c.frameColor, c.opacity, c.shape], [0.03, '#ff00aa', 0.6, 'splat']);
  for (const op of [{ frame: 0.5 }, { frameColor: 'red' }, { opacity: 0 }, { opacity: 2 }]) assert.equal(s.apply([{ op: 'set_overlay', clip_id: id, ...op }]).ok, false, JSON.stringify(op));
  assert.ok(s.apply([{ op: 'split_clip', clip_id: id, at: 5 }]).ok); assert.deepEqual([s.project.overlayClips[1].frame, s.project.overlayClips[1].opacity], [0.03, 0.6]);
  assert.ok(s.apply([{ op: 'set_overlay', clip_id: id, frame: 0, opacity: 1 }]).ok); assert.deepEqual([s.project.overlayClips[0].frame, s.project.overlayClips[0].opacity], [undefined, undefined]);
});

test('imágenes (logo/foto/GIF) solo van como capa: add_clip y add_audio_clip las rechazan', () => {
  const s = new Session(createProject({ assets: [] }));
  s.addAsset({ id: 'a1', duration: 10, name: 'v.mp4' }); s.addAsset({ id: 'a2', duration: 3600, name: 'logo.png', kind: 'image' });
  const bad = s.apply([{ op: 'add_clip', asset_id: 'a2', start: 0 }], 0); assert.equal(bad.ok, false); assert.equal(bad.code, 'image_not_allowed');
  const bad2 = s.apply([{ op: 'add_audio_clip', asset_id: 'a2', start: 0 }], 0); assert.equal(bad2.ok, false); assert.equal(bad2.code, 'image_not_allowed');
  const ok = s.apply([{ op: 'add_clip', asset_id: 'a1', start: 0 }, { op: 'add_overlay_clip', asset_id: 'a2', start: 1, out: 5 }], 0);
  assert.ok(ok.ok, JSON.stringify(ok)); assert.equal(s.project.overlayClips[0].out - s.project.overlayClips[0].in, 5);
});
