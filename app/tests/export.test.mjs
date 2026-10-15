import test from 'node:test'; import assert from 'node:assert/strict';
import { exportPlan, outputSize, pickMime, extFor, wrapLines, textsAt } from '../export.mjs';

const P = (clips, texts = []) => ({ clips, texts });
test('plan: clips en orden y hueco negro entre clips', () => {
  const p = exportPlan(P([{ id: 'b', asset_id: 'a', in: 0, out: 2, start: 5 }, { id: 'a', asset_id: 'a', in: 1, out: 4, start: 0 }]));
  assert.deepEqual(p.segments.map((s) => s.type + ':' + (s.clip?.id ?? s.dur)), ['clip:a', 'gap:2', 'clip:b']);
  assert.equal(p.total, 7);
});
test('plan: aviso si hay texto después del final', () => {
  assert.equal(exportPlan(P([{ id: 'a', asset_id: 'a', in: 0, out: 2, start: 0 }], [{ text: 'x', start: 1, end: 9 }])).textBeyondEnd, true);
  assert.equal(exportPlan(P([{ id: 'a', asset_id: 'a', in: 0, out: 2, start: 0 }], [{ text: 'x', start: 0, end: 2 }])).textBeyondEnd, false);
});
test('tamaño: respeta la forma, máx 1080 lado corto, pares', () => {
  assert.deepEqual(outputSize(2160, 3840), { w: 1080, h: 1920 });
  assert.deepEqual(outputSize(720, 1281), { w: 720, h: 1282 });
  assert.deepEqual(outputSize(0, 0), { w: 1080, h: 1920 });
});
test('formato: prefiere MP4 (Safari) y cae a WebM', () => {
  assert.match(pickMime((t) => t.startsWith('video/mp4')), /mp4/);
  assert.match(pickMime((t) => t.startsWith('video/webm')), /webm/);
  assert.equal(pickMime(() => false), '');
  assert.equal(pickMime(() => { throw new Error('x'); }), '');
  assert.equal(extFor('video/mp4;codecs=avc1'), 'mp4'); assert.equal(extFor('video/webm'), 'webm');
});
test('texto: activo solo dentro de su intervalo y se parte en líneas', () => {
  const p = P([], [{ text: 'hola', start: 1, end: 3 }]);
  assert.equal(textsAt(p, 0.9).length, 0); assert.equal(textsAt(p, 1).length, 1); assert.equal(textsAt(p, 3).length, 0);
  assert.deepEqual(wrapLines('uno dos tres cuatro', 8, (s) => s.length), ['uno dos', 'tres', 'cuatro']);
});
