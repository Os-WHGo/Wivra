import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, totalDuration } from '../project.mjs';
import { Session } from '../session.mjs';

const assets = [{ id: 'v', duration: 10, name: 'v.mov' }, { id: 'b', duration: 4, name: 'b.mov' }];
const mk = () => { const s = new Session(createProject({ assets })); assert.ok(s.apply([{ op: 'add_clip', asset_id: 'v', start: 0 }]).ok); return s; };
const ov = (s) => s.project.overlayClips;

test('add_overlay_clip superpone un video con valores por defecto y no alarga el video principal', () => {
  const s = mk(); const r = s.apply([{ op: 'add_overlay_clip', asset_id: 'b', start: 2 }]); assert.ok(r.ok, JSON.stringify(r));
  const c = ov(s)[0]; assert.match(c.id, /^o\d+$/); assert.deepEqual([c.start, c.in, c.out, c.track, c.x, c.y, c.scale], [2, 0, 4, 1, 0.72, 0.28, 0.4]);
  assert.equal(totalDuration(s.project), 10);
});
test('add_overlay_clip y set_overlay validan tamaño, posición y pista; lote todo-o-nada', () => {
  const s = mk(); const before = JSON.stringify(s.project);
  for (const op of [{ asset_id: 'x' }, { asset_id: 'b', scale: 0 }, { asset_id: 'b', scale: 1.5 }, { asset_id: 'b', x: -0.1 }, { asset_id: 'b', y: 2 }, { asset_id: 'b', track: 0 }, { asset_id: 'b', track: 5 }, { asset_id: 'b', track: 1.5 }, { asset_id: 'b', out: 99 }])
    assert.equal(s.apply([{ op: 'add_overlay_clip', ...op }]).ok, false, JSON.stringify(op));
  assert.equal(JSON.stringify(s.project), before);
  s.apply([{ op: 'add_overlay_clip', asset_id: 'b' }]); const id = ov(s)[0].id;
  assert.ok(s.apply([{ op: 'set_overlay', clip_id: id, x: 0.5, y: 0.5, scale: 1 }]).ok); assert.deepEqual([ov(s)[0].x, ov(s)[0].y, ov(s)[0].scale], [0.5, 0.5, 1]);
  assert.equal(s.apply([{ op: 'set_overlay', clip_id: id }]).ok, false);
  assert.equal(s.apply([{ op: 'set_overlay', clip_id: id, scale: 0.01 }]).ok, false);
  assert.equal(s.apply([{ op: 'set_overlay', clip_id: 'c1', x: 0.5 }]).ok, false);   // un clip del video principal no se superpone
});
test('mover, recortar, dividir, volumen y borrar también sirven en videos superpuestos y conservan tamaño/posición/pista', () => {
  const s = mk(); s.apply([{ op: 'add_overlay_clip', asset_id: 'b', start: 1, track: 2, x: 0.3, y: 0.6, scale: 0.5 }]); const id = ov(s)[0].id;
  assert.ok(s.apply([{ op: 'move_clip', clip_id: id, start: 3 }]).ok); assert.ok(s.apply([{ op: 'set_clip_audio', clip_id: id, muted: true }]).ok);
  assert.ok(s.apply([{ op: 'split_clip', clip_id: id, at: 2 }]).ok); assert.equal(ov(s).length, 2); assert.equal(s.project.clips.length, 1);
  const [a, b] = ov(s); assert.deepEqual([a.out, b.in, b.start, b.track, b.x, b.y, b.scale, b.muted], [2, 2, 5, 2, 0.3, 0.6, 0.5, true]); assert.match(b.id, /^o\d+$/);
  assert.ok(s.apply([{ op: 'delete_clip', clip_id: b.id }]).ok); assert.equal(ov(s).length, 1);
});
test('deshacer y rehacer; proyectos viejos sin overlayClips', () => {
  const s = mk(); s.apply([{ op: 'add_overlay_clip', asset_id: 'b' }]); assert.equal(ov(s).length, 1); s.undo(); assert.equal(ov(s).length, 0); s.redo(); assert.equal(ov(s).length, 1);
  const p = createProject({ assets }); delete p.overlayClips; const t = new Session(p); assert.ok(t.apply([{ op: 'add_clip', asset_id: 'v' }, { op: 'add_overlay_clip', asset_id: 'b' }]).ok);
});
