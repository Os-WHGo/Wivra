// Plantillas: se aplican de verdad con las operaciones del editor y son repetibles. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { TPL_CATALOG, planTemplate, TPL_TITLE_MAX } from '../templates.mjs';
import { LOOK_PRESETS } from '../../core/filters.mjs';
import { createProject } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';
import { totalDuration } from '../../core/project.mjs';

const build = (lens) => { let p = createProject({ assets: lens.map((l, i) => ({ id: `a${i + 1}`, duration: l + 2, name: `v${i + 1}.mp4` })) }); let t = 0;
  p = applyBatch(p, lens.map((l, i) => { const o = { op: 'add_clip', asset_id: `a${i + 1}`, start: t }; t += l; return o; })).project; return applyBatch(p, p.clips.map((c, i) => ({ op: 'trim_clip', clip_id: c.id, in: 0, out: lens[i] }))).project; };

test('el catálogo es coherente: ids únicos, formatos y looks que existen', () => {
  assert.equal(new Set(TPL_CATALOG.map((t) => t.id)).size, TPL_CATALOG.length);
  for (const t of TPL_CATALOG) { assert.ok(['9:16', '1:1', '4:5', '16:9'].includes(t.format.aspect), t.id); assert.ok(['cover', 'contain'].includes(t.format.fit)); assert.ok(t.special || (t.targetSeconds >= 3 && t.targetSeconds <= 600)); assert.ok(!t.look || LOOK_PRESETS[t.look], t.id); assert.ok(t.name && t.desc); }
});
test('«Reel vertical»: formato 9:16, 30 s, look en TODOS los clips y título al inicio, en un solo lote', () => {
  const p = build([20, 15, 25]), pl = planTemplate(p, 'reel', { title: 'Mi viaje' }); assert.ok(pl.ok, JSON.stringify(pl));
  const r = applyBatch(p, pl.ops); assert.ok(r.ok, JSON.stringify(r)); const q = r.project;
  assert.deepEqual(q.format, { aspect: '9:16', fit: 'cover' }); assert.ok(Math.abs(totalDuration(q) - 30) < 0.02);
  assert.ok(q.clips.every((c) => c.filter && c.filter.look === 'film')); assert.deepEqual(q.texts.map((t) => [t.text, t.start, t.end]), [['Mi viaje', 0, 3]]);
});
test('sin título escrito no se agrega texto; con título en una plantilla que no lo lleva se ignora con aviso', () => {
  const p = build([20, 15]); assert.ok(!planTemplate(p, 'reel').ops.some((o) => o.op === 'add_text'));
  const s = planTemplate(p, 'story', { title: 'hola' }); assert.ok(!s.ops.some((o) => o.op === 'add_text')); assert.match(s.warnings.join(' '), /no lleva título/);
});
test('plantillas sin look no tocan los filtros; el formato horizontal usa contain', () => {
  const p = build([20, 15]), w = planTemplate(p, 'wide'); assert.ok(!w.ops.some((o) => o.op === 'set_clip_filter'));
  assert.deepEqual(applyBatch(p, w.ops).project.format, { aspect: '16:9', fit: 'contain' });
});
test('repetible: aplicar la misma plantilla dos veces no cambia nada ni duplica el título', () => {
  const p = build([20, 15, 25]), a = applyBatch(p, planTemplate(p, 'reel', { title: 'Hola' }).ops).project, again = planTemplate(a, 'reel', { title: 'Hola' });
  assert.deepEqual(again.ops, []); assert.match(again.warnings.join(' '), /ya está|nada que cambiar/);
});
test('si el video ya es más corto que la plantilla no se alarga ni se pierde nada', () => {
  const p = build([5, 4]), pl = planTemplate(p, 'wide'); const q = applyBatch(p, pl.ops).project; assert.equal(totalDuration(q), 9); assert.equal(q.clips.length, 2);
});
test('entradas inválidas: plantilla inexistente, sin clips, título demasiado largo', () => {
  const p = build([10]); assert.equal(planTemplate(p, 'nada').ok, false); assert.equal(planTemplate(createProject({ assets: [] }), 'reel').ok, false);
  const l = planTemplate(p, 'reel', { title: 'x'.repeat(TPL_TITLE_MAX + 1) }); assert.equal(l.ok, false); assert.match(l.error, /hasta 60/);
});
test('el título se normaliza (espacios) y cabe en el límite del editor', () => {
  const p = build([10]), pl = planTemplate(p, 'reel', { title: '  Mi   viaje  ' }); assert.equal(pl.ops.find((o) => o.op === 'add_text').text, 'Mi viaje'); assert.ok(applyBatch(p, pl.ops).ok);
});
