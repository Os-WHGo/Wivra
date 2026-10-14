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

import { overlayRect, overlayAt } from '../../app/export.mjs';
test('overlayRect: tamaño y posición de un video superpuesto en el cuadro', () => {
  const r = overlayRect({ x: 0.5, y: 0.5, scale: 0.5 }, 1000, 2000, 1920, 1080);   // video horizontal al 50% del ancho, centrado
  assert.equal(r.w, 500); assert.equal(Math.round(r.h * 100) / 100, 281.25); assert.equal(r.x + r.w / 2, 500); assert.equal(r.y + r.h / 2, 1000);
  const t = overlayRect({ x: 0.9, y: 0.1, scale: 0.2 }, 1000, 1000, 1000, 1000); assert.deepEqual([t.x, t.y, t.w, t.h], [800, 0, 200, 200]);
});
test('overlayAt: cuándo se ve un video superpuesto y desde dónde', () => {
  const c = { start: 2, in: 1, out: 4 };
  assert.equal(overlayAt(c, 1.9), null); assert.equal(overlayAt(c, 2), 1); assert.equal(overlayAt(c, 3.5), 2.5); assert.equal(overlayAt(c, 5), null);
});

import { formatSize, fitRect, effectiveFit, outputSize } from '../../app/export.mjs';
test('formatSize: tamaño de salida según el formato', () => {
  assert.deepEqual(formatSize({ aspect: '9:16' }, 1920, 1080), { w: 1080, h: 1920 });
  assert.deepEqual(formatSize({ aspect: '1:1' }, 100, 100), { w: 1080, h: 1080 });
  assert.deepEqual(formatSize({ aspect: '4:5' }, 1, 1), { w: 1080, h: 1350 });
  assert.deepEqual(formatSize({ aspect: '16:9' }, 1, 1), { w: 1920, h: 1080 });
  assert.deepEqual(formatSize({ aspect: 'original' }, 1936, 2576), outputSize(1936, 2576)); assert.deepEqual(formatSize(undefined, 720, 1280), outputSize(720, 1280));
});
test('fitRect y effectiveFit: rellenar recorta centrado; entero deja barras; original nunca recorta', () => {
  const c = fitRect(1920, 1080, 1080, 1920, 'cover'); assert.equal(c.h, 1920); assert.ok(c.w > 1080); assert.equal(c.x, (1080 - c.w) / 2); assert.equal(c.y, 0);
  const n = fitRect(1920, 1080, 1080, 1920, 'contain'); assert.equal(n.w, 1080); assert.ok(n.h < 1920); assert.equal(n.x, 0);
  assert.equal(effectiveFit({ aspect: 'original', fit: 'cover' }), 'contain'); assert.equal(effectiveFit({ aspect: '9:16', fit: 'cover' }), 'cover'); assert.equal(effectiveFit({ aspect: '9:16', fit: 'contain' }), 'contain');
});
