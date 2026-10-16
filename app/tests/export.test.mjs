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

import { contentRect, solveContent } from '../export.mjs';
test('contentRect cubre la ventana y solveContent es su inverso (con zoom y desplazamiento en ambos ejes)', () => {
  const win = { left: 10, top: 20, w: 200, h: 200 }, vw = 1920, vh = 1080;
  for (const zoom of [1, 1.7, 3.2]) for (const px of [0, 0.3, 1]) for (const py of [0, 0.5, 1]) {
    const r = contentRect(win.w, win.h, vw, vh, zoom, px, py);
    assert.ok(r.x <= 1e-9 && r.y <= 1e-9 && r.x + r.w >= win.w - 1e-9 && r.y + r.h >= win.h - 1e-9, 'siempre cubre la ventana');
    const s = solveContent(win, { X: win.left + r.x, Y: win.top + r.y, W: r.w, H: r.h }, vw, vh);
    assert.ok(Math.abs(s.zoom - zoom) < 1e-9);
    if (zoom > 1 || r.w > win.w) assert.ok(Math.abs(s.px - px) < 1e-9, `px ${px} zoom ${zoom}`);
    assert.ok(Math.abs(s.py - py) < 1e-9 || r.h <= win.h + 1e-9);
  }
});
test('solveContent limita zoom a 1..4 y deja el contenido cubriendo la ventana aunque se arrastre de más', () => {
  const win = { left: 0, top: 0, w: 100, h: 100 };
  assert.equal(solveContent(win, { X: 0, Y: 0, W: 10, H: 10 }, 100, 100).zoom, 1);
  assert.equal(solveContent(win, { X: 0, Y: 0, W: 9999, H: 9999 }, 100, 100).zoom, 4);
  const s = solveContent(win, { X: 500, Y: -500, W: 200, H: 200 }, 100, 100); assert.ok(s.px >= 0 && s.px <= 1 && s.py >= 0 && s.py <= 1);
  assert.equal(contentRect(100, 100, 100, 100, 1, 0.2, 0.9).x, 0, 'sin sobrante a este zoom, px no mueve nada');
});
