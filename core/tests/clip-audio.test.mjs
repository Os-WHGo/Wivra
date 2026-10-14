import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../project.mjs';
import { applyBatch } from '../operations.mjs';
import { Session } from '../session.mjs';
import { clipGain } from '../../app/export.mjs';

const base = () => { const p = createProject({ assets: [{ id: 'a1', duration: 10, name: 'x' }] }); return applyBatch(p, [{ op: 'add_clip', asset_id: 'a1', start: 0 }]).project; };

test('silenciar y volumen se guardan en el clip', () => {
  const r = applyBatch(base(), [{ op: 'set_clip_audio', clip_id: 'c1', muted: true, volume: 0.5 }]);
  assert.ok(r.ok); assert.equal(r.project.clips[0].muted, true); assert.equal(r.project.clips[0].volume, 0.5);
});
test('valida clip, rango y tipos; el lote es atómico', () => {
  const p = base();
  for (const op of [{ clip_id: 'zz', muted: true }, { clip_id: 'c1' }, { clip_id: 'c1', volume: 3 }, { clip_id: 'c1', volume: -1 }, { clip_id: 'c1', muted: 'si' }])
    assert.equal(applyBatch(p, [{ op: 'set_clip_audio', ...op }]).ok, false);
  const r = applyBatch(p, [{ op: 'set_clip_audio', clip_id: 'c1', muted: true }, { op: 'set_clip_audio', clip_id: 'c1', volume: 9 }]);
  assert.equal(r.ok, false); assert.equal(p.clips[0].muted, undefined);
});
test('cortar un clip conserva su audio en ambas mitades', () => {
  let p = applyBatch(base(), [{ op: 'set_clip_audio', clip_id: 'c1', muted: true, volume: 0.7 }]).project;
  p = applyBatch(p, [{ op: 'split_clip', clip_id: 'c1', at: 4 }]).project;
  assert.deepEqual(p.clips.map((c) => [c.muted, c.volume]), [[true, 0.7], [true, 0.7]]);
});
test('deshacer revierte el cambio de audio', () => {
  const s = new Session(base()); s.apply([{ op: 'set_clip_audio', clip_id: 'c1', muted: true }]);
  assert.equal(s.project.clips[0].muted, true); s.undo(); assert.equal(s.project.clips[0].muted, undefined);
});
test('clipGain: silenciado 0, por defecto 1, limitado a 0–2', () => {
  assert.equal(clipGain({}), 1); assert.equal(clipGain({ muted: true, volume: 2 }), 0); assert.equal(clipGain({ volume: 0.5 }), 0.5); assert.equal(clipGain({ volume: 9 }), 2);
});

import { audioStartAt } from '../../app/export.mjs';
test('audioStartAt: cuándo y desde dónde arranca una pista de audio aparte', () => {
  const c = { start: 2, in: 1, out: 5 };            // dura 4 s, suena del 2 al 6 del timeline
  assert.deepEqual(audioStartAt(c, 2), { offset: 1, dur: 4 });
  assert.deepEqual(audioStartAt(c, 3), { offset: 2, dur: 3 });   // entra tarde (p. ej. tras un hueco): arranca en el punto correcto
  assert.equal(audioStartAt(c, 1), null);                         // aún no
  assert.equal(audioStartAt(c, 6), null);                         // ya terminó
  assert.equal(audioStartAt({ ...c, muted: true }, 3), null);
  assert.deepEqual(audioStartAt(c, 1.99), { offset: 1, dur: 4 }); // tolerancia de un fotograma antes
});
