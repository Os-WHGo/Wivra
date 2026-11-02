// El filtro de color se calcula al tamaño del video de SALIDA (no a 1280 px fijos): si no, los clips con filtro salen borrosos. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawFrame } from '../export.mjs';
import { createProject } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';
import { readFileSync } from 'node:fs';

const proj = () => applyBatch(createProject({ assets: [{ id: 'a1', duration: 10, name: 'v.mp4' }] }), [{ op: 'add_clip', asset_id: 'a1' }, { op: 'set_clip_filter', clip_id: 'c1', brightness: 0.1 }]).project;
const g = new Proxy({}, { get: () => () => {}, set: () => true });

test('drawFrame pide el filtro al tamaño de salida (lado largo del cuadro)', () => {
  const seen = []; globalThis.fxRender = (el, f, t, max) => { seen.push(max); return null; };
  try {
    drawFrame(g, 1080, 1920, { videoWidth: 1080, videoHeight: 1920 }, proj(), 1, []);
    drawFrame(g, 1920, 1080, { videoWidth: 1920, videoHeight: 1080 }, proj(), 1, []);
  } finally { delete globalThis.fxRender; }
  assert.deepEqual(seen, [1920, 1920]);
});
test('fxRender: la vista previa sigue en 1280 por defecto y el tope duro es 4096', () => {
  const src = readFileSync(new URL('../filters-gl.mjs', import.meta.url), 'utf8');
  assert.match(src, /function fxRender\(src, f, t, maxSide = 1280\)/); assert.match(src, /Math\.min\(4096, maxSide\)/);
});
test('el grano tiene tamaño relativo al cuadro (misma apariencia en vista previa y exportación)', () => {
  const src = readFileSync(new URL('../filters-gl.mjs', import.meta.url), 'utf8');
  assert.match(src, /floor\(uv \* res \* \(540\.0 \/ min\(res\.x, res\.y\)\)\)/);
});
