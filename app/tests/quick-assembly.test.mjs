// Montaje rápido: reglas puras + que las operaciones se apliquen de verdad en el editor. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { planQuickAssembly, qaLevel } from '../quick-assembly.mjs';
import { createProject } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';

const build = (lens, extra = []) => {
  const assets = lens.map((l, i) => ({ id: `a${i + 1}`, duration: l + 5, name: `v${i + 1}.mp4` })).concat(extra.map((e, i) => ({ id: `p${i + 1}`, duration: 3600, name: `f${i + 1}.jpg`, kind: 'image' })));
  let ops = [], t = 0; lens.forEach((l, i) => { ops.push({ op: 'add_clip', asset_id: `a${i + 1}`, start: t }, { op: 'trim_clip', clip_id: `c${i + 1}`, in: 1, out: 1 + l }); t += l; });
  // los ids de clip los reparte el editor: se leen después
  let p = createProject({ assets }); const r = applyBatch(p, lens.map((l, i) => ({ op: 'add_clip', asset_id: `a${i + 1}`, start: lens.slice(0, i).reduce((a, b) => a + b, 0), })));
  assert.ok(r.ok, JSON.stringify(r)); p = r.project;
  p = applyBatch(p, p.clips.map((c, i) => ({ op: 'trim_clip', clip_id: c.id, in: 1, out: 1 + lens[i] }))).project;
  extra.forEach((d, i) => { const at = p.clips.reduce((m, c) => Math.max(m, c.start + c.out - c.in), 0); const rr = applyBatch(p, [{ op: 'add_photo_clip', asset_id: `p${i + 1}`, start: at, duration: d }]); assert.ok(rr.ok, JSON.stringify(rr)); p = rr.project; });
  return p;
};
const total = (p) => Math.round(p.clips.reduce((m, c) => Math.max(m, c.start + c.out - c.in), 0) * 100) / 100;

test('qaLevel: reparte sin pasarse del largo de ningún clip', () => {
  assert.deepEqual(qaLevel([2, 10, 10], 12), [2, 5, 5]); assert.deepEqual(qaLevel([3, 4], 20), [3, 4]);
  const r = qaLevel([1, 8, 20], 15); assert.ok(Math.abs(r.reduce((a, b) => a + b, 0) - 15) < 1e-9); assert.equal(r[0], 1); assert.ok(r[1] === r[2] || r[1] === 8);
});
test('acorta a la duración pedida, conserva el orden y deja todo pegado sin huecos', () => {
  const p = build([10, 8, 12, 6]), pl = planQuickAssembly(p, { targetSeconds: 20 });
  assert.ok(pl.ok); assert.ok(Math.abs(pl.after - 20) < 0.1, String(pl.after)); assert.equal(pl.trimmed, 4);
  const r = applyBatch(p, pl.ops); assert.ok(r.ok, JSON.stringify(r)); assert.ok(Math.abs(total(r.project) - 20) < 0.1);
  const cs = [...r.project.clips].sort((a, b) => a.start - b.start); assert.deepEqual(cs.map((c) => c.id), p.clips.map((c) => c.id));
  cs.slice(1).forEach((c, i) => assert.ok(Math.abs(c.start - (cs[i].start + cs[i].out - cs[i].in)) < 0.011, 'sin huecos ni solapes'));
  cs.forEach((c, i) => { const o = p.clips.find((k) => k.id === c.id); assert.ok(c.in >= o.in - 1e-9 && c.out <= o.out + 1e-9, 'dentro del tramo original'); });
});
test('toma el tramo del CENTRO de cada clip', () => {
  const p = build([10]), pl = planQuickAssembly(p, { targetSeconds: 4 }); const it = pl.items[0];
  assert.deepEqual(it.to, [4, 8]); assert.equal(it.from[0], 1); assert.equal(it.from[1], 11);       // original 1–11 → centro 4–8
});
test('si ya dura menos que lo pedido no toca nada (ni fotos) y avisa', () => {
  const p = build([4, 5], [3]), pl = planQuickAssembly(p, { targetSeconds: 30 }); assert.equal(pl.trimmed, 0); assert.deepEqual(pl.ops, []); assert.match(pl.warnings.join(' '), /ya dura 12 s/);
});
test('la duración final es exacta (centésimas), no 30.01', () => {
  for (const [lens, T] of [[[10, 8, 12, 6], 20], [[7, 13, 9], 17], [[11, 11, 11], 10], [[3, 30, 30], 25]]) { const p = build(lens), pl = planQuickAssembly(p, { targetSeconds: T }); assert.equal(pl.after, T, `${lens} → ${pl.after}`); }
});
test('un clip corto no se alarga y los largos ceden el resto', () => {
  const p = build([2, 20, 20]), pl = planQuickAssembly(p, { targetSeconds: 12 }); const d = pl.items.map((i) => Math.round((i.to[1] - i.to[0]) * 100) / 100);
  assert.equal(d[0], 2); assert.ok(Math.abs(d[1] - 5) < 0.02 && Math.abs(d[2] - 5) < 0.02, d.join(','));
});
test('las fotos duran 2 s (o menos si ya eran más cortas) y los videos se reparten lo que queda', () => {
  const p = build([20, 20], [3, 1]), pl = planQuickAssembly(p, { targetSeconds: 15 }); const ph = pl.items.filter((i) => i.photo).map((i) => Math.round((i.to[1] - i.to[0]) * 100) / 100);
  assert.deepEqual(ph, [2, 1]); const r = applyBatch(p, pl.ops); assert.ok(r.ok, JSON.stringify(r)); assert.ok(Math.abs(total(r.project) - 15) < 0.1);
});
test('demasiados clips para el tiempo: no borra nada, avisa y se queda con el mínimo', () => {
  const p = build(new Array(10).fill(5)), pl = planQuickAssembly(p, { targetSeconds: 3 }); assert.ok(pl.ok); assert.ok(pl.after > 3); assert.match(pl.warnings.join(' '), /No cabe todo en 3 s/);
  const r = applyBatch(p, pl.ops); assert.ok(r.ok); assert.equal(r.project.clips.length, 10);
});
test('avisa que capas, audios y textos no se mueven', () => {
  let p = build([10, 10]); p = applyBatch(p, [{ op: 'add_text', text: 'hola', start: 1, duration: 2 }]).project;
  assert.match(planQuickAssembly(p, { targetSeconds: 8 }).warnings.join(' '), /no se mueven/);
});
test('entradas inválidas se rechazan con motivo', () => {
  const p = build([10]);
  for (const t of [0, 2, 601, NaN, 'x']) assert.equal(planQuickAssembly(p, { targetSeconds: t }).ok, false);
  assert.equal(planQuickAssembly(createProject({ assets: [] }), { targetSeconds: 30 }).ok, false);
});
test('es repetible: aplicar dos veces el mismo montaje no cambia el resultado', () => {
  const p = build([10, 8, 12]), a = applyBatch(p, planQuickAssembly(p, { targetSeconds: 15 }).ops).project, pl2 = planQuickAssembly(a, { targetSeconds: 15 });
  assert.equal(pl2.trimmed, 0); assert.deepEqual(pl2.ops, []);
});
