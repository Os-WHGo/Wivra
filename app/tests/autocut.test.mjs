// AutoCut v1: elegir el tramo donde más se oye al acortar, con evidencia del volumen; sin evidencia, el centro de siempre. — Claude
import test from 'node:test'; import assert from 'node:assert/strict';
import { bestWindow, makeAutoPicker } from '../autocut.mjs';
import { planQuickAssembly } from '../quick-assembly.mjs';
import { createProject, totalDuration } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';

const WIN = 0.02;
// Curva de volumen: segundos de `dur`; `loud` = [[desde, hasta], …] en dB −20 (voz), el resto −80 con un poco de ruido.
const curve = (dur, loud) => { const n = Math.round(dur / WIN), e = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i * WIN; e[i] = loud.some(([a, b]) => t >= a && t < b) ? -20 + (i % 3) : -80 + (i % 5); } return e; };

test('elige la ventana donde hay voz, no el centro', () => {
  const env = curve(60, [[30, 40]]); const r = bestWindow(env, WIN, 0, 60, 8);
  assert.ok(r && r.moved, JSON.stringify(r)); assert.ok(r.start >= 29 && r.start <= 33, 'start=' + r.start); assert.ok(r.score > r.centerScore);
});
test('la ventana no arranca ni termina en plena voz cuando puede evitarlo (empieza justo antes de la frase)', () => {
  const env = curve(60, [[20, 30]]); const r = bestWindow(env, WIN, 0, 60, 12);
  assert.ok(r.start <= 20 && r.start + 12 >= 30, 'incluye la frase entera: ' + JSON.stringify(r));
});
test('volumen parejo (música o ruido continuo) = sin evidencia → null', () => {
  const flat = new Float32Array(3000).fill(-25); assert.equal(bestWindow(flat, WIN, 0, 60, 10), null);
});
test('clip que ya cabe, muy corto o con datos raros → null', () => {
  const env = curve(10, [[2, 5]]); assert.equal(bestWindow(env, WIN, 0, 10, 10), null); assert.equal(bestWindow(env, WIN, 0, 10, 12), null);
  assert.equal(bestWindow(new Float32Array(0), WIN, 0, 10, 5), null); assert.equal(bestWindow(env, 0, 0, 10, 5), null); assert.equal(bestWindow(null, WIN, 0, 10, 5), null);
});
test('si el centro ya es casi igual de bueno, se queda el centro (no mueve por moverse)', () => {
  const env = curve(60, [[0, 60]]); const r = bestWindow(env, WIN, 0, 60, 10); assert.equal(r, null);       // todo es voz: volumen parejo
  const env2 = curve(60, [[26, 34]]); const r2 = bestWindow(env2, WIN, 0, 60, 8); assert.ok(r2 && Math.abs(r2.start - 26) < 3);
});
test('con la pasada por un clip recortado (in>0): el tramo queda dentro de [in, out]', () => {
  const env = curve(60, [[50, 58]]); const r = bestWindow(env, WIN, 20, 55, 6); assert.ok(r.start >= 20 && r.start + 6 <= 55 + 1e-6, JSON.stringify(r));
});

const mk = (lens) => { let p = createProject({ assets: lens.map((l, i) => ({ id: `a${i + 1}`, duration: l, name: `v${i + 1}.mp4` })) }); let t = 0;
  return applyBatch(p, lens.map((l, i) => { const o = { op: 'add_clip', asset_id: `a${i + 1}`, start: t }; t += l; return o; })).project; };
test('montaje rápido con AutoCut: cada clip aporta su tramo con más voz; el resultado dura lo pedido y se aplica con las operaciones normales', () => {
  const p = mk([60, 40]), envs = { a1: { env: curve(60, [[44, 52]]), win: WIN }, a2: { env: curve(40, [[2, 9]]), win: WIN } };
  const pl = planQuickAssembly(p, { targetSeconds: 20, pick: makeAutoPicker((id) => envs[id]) }); assert.ok(pl.ok, JSON.stringify(pl)); assert.equal(pl.picked, 2);
  const r = applyBatch(p, pl.ops); assert.ok(r.ok, JSON.stringify(r)); const q = r.project; assert.ok(Math.abs(totalDuration(q) - 20) < 0.02);
  const [c1, c2] = q.clips; assert.ok(c1.in <= 44 && c1.out >= 51.9, `c1 ${c1.in}-${c1.out}`); assert.ok(c2.in <= 2.1 && c2.out >= 8.9 || c2.in < 2.5, `c2 ${c2.in}-${c2.out}`);
  assert.ok(pl.warnings.some((w) => /donde más se oye/.test(w)));
});
test('AutoCut sin evidencia en un clip: ese clip queda con el centro, los demás eligen', () => {
  const p = mk([60, 60]), envs = { a1: { env: curve(60, [[44, 52]]), win: WIN }, a2: { env: new Float32Array(3000).fill(-30), win: WIN } };
  const pl = planQuickAssembly(p, { targetSeconds: 20, pick: makeAutoPicker((id) => envs[id]) }); assert.equal(pl.picked, 1);
  const q = applyBatch(p, pl.ops).project; assert.equal(q.clips[1].in, 25); assert.equal(q.clips[1].out, 35);
});
test('sin `pick` el montaje es exactamente el de siempre', () => {
  const p = mk([60, 40]); const a = planQuickAssembly(p, { targetSeconds: 20 }), b = planQuickAssembly(p, { targetSeconds: 20, pick: null }); assert.deepEqual(a.ops, b.ops); assert.equal(a.picked, 0);
  assert.ok(!a.warnings.some((w) => /donde más se oye|diferencias de volumen/.test(w)));
});
test('las fotos no usan AutoCut y un `pick` que devuelve algo fuera del clip se ignora', () => {
  const p = mk([60]); const pl = planQuickAssembly(p, { targetSeconds: 10, pick: () => 999 }); const q = applyBatch(p, pl.ops).project; assert.equal(q.clips[0].in, 25); assert.equal(pl.picked, 0);
});
