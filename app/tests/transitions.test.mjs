import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';
import { planCutTransitions } from '../transitions.mjs';

const mk = (n) => { const p = createProject({ assets: [{ id: 'a', kind: 'video', name: 'a', duration: 10 }] }); return applyBatch(p, Array.from({ length: n }, (_, i) => ({ op: 'add_clip', asset_id: 'a', start: i * 10 }))).project; };
test('transición en los cortes: salida del que termina y entrada del que sigue; no toca los extremos', () => {
  const r = planCutTransitions(mk(3), 'fade', 0.7); assert.ok(r.ok); assert.equal(r.cuts, 2);
  const out = applyBatch(mk(3), r.ops); assert.ok(out.ok, JSON.stringify(out));
  const [a, b, c] = out.project.clips;
  assert.deepEqual([a.fxIn, a.fxOut, b.fxIn, b.fxOut, c.fxIn, c.fxOut], [undefined, 'fade', 'fade', 'fade', 'fade', undefined]); assert.equal(b.fxDur, 0.7);
});
test('«ninguno» quita solo los lados de los cortes; una sola clip o tipo raro = error claro', () => {
  let p = applyBatch(mk(2), planCutTransitions(mk(2), 'zoom').ops).project; p = applyBatch(p, planCutTransitions(p, 'none').ops).project;
  assert.deepEqual(p.clips.map((c) => [c.fxIn, c.fxOut]), [[undefined, undefined], [undefined, undefined]]);
  assert.match(planCutTransitions(mk(1), 'fade').error, /al menos dos/); assert.match(planCutTransitions(mk(2), 'spin').error, /no existe/);
  assert.equal(planCutTransitions(mk(2), 'fade', 99).ops[0].dur, 2);
});
