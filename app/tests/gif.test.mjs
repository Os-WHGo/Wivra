import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { decodeGif, gifFrameAt } from '../gif.mjs';

// GIF de 3 fotogramas (amarillo, azul, magenta; 200 ms; transparencia y descarte 2) generado con Pillow; fixture pequeño.
const fx = new URL('./fixtures/anim.gif', import.meta.url);
test('decodifica fotogramas, colores, transparencia y retardos', () => {
  const g = decodeGif(readFileSync(fx));
  assert.equal(g.frames.length, 3); assert.equal(g.w, 120); assert.equal(g.h, 120);
  const px = (f, x, y) => [...g.frames[f].rgba.subarray((y * 120 + x) * 4, (y * 120 + x) * 4 + 4)];
  assert.deepEqual(px(0, 60, 60), [255, 255, 0, 255]); assert.deepEqual(px(1, 60, 60), [0, 0, 255, 255]); assert.deepEqual(px(2, 60, 60), [255, 0, 255, 255]);
  assert.equal(px(0, 2, 2)[3], 0);                    // fuera del cuadrado = transparente
  assert.ok(g.frames.every((f) => Math.abs(f.delay - 0.2) < 1e-9));
});
test('el fotograma depende del tiempo y el GIF se repite', () => {
  const g = decodeGif(readFileSync(fx));
  assert.deepEqual([0, 0.1, 0.25, 0.45, 0.65, 0.7].map((t) => gifFrameAt(g, t)), [0, 0, 1, 2, 0, 0]);
});
test('basura y GIF cortado no rompen: lanzan Error claro', () => {
  assert.throws(() => decodeGif(new Uint8Array([1, 2, 3])), /No es un GIF/);
  const b = readFileSync(fx); assert.throws(() => decodeGif(b.subarray(0, 40)), /GIF/);
});
