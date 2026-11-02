// Plantillas con huecos (Ráfaga, Antes y después, Top 3). — Claude
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, clipLength, totalDuration } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';
import { planTemplate, TPL_CATALOG } from '../templates.mjs';

const ids = 'abcdefgh'.split(''), assets = [...ids.map((i) => ({ id: i, kind: 'video', name: i, duration: 20 })), { id: 'p', kind: 'image', name: 'f.jpg', duration: 3600 }, { id: 'm', kind: 'audio', name: 'm.wav', duration: 30 }];
const mk = (lens, extra = [], photoAt = -1) => {
  const ops = []; let t = 0, k = 0, n = 0;
  lens.forEach((l, i) => { n++; if (i === photoAt) ops.push({ op: 'add_photo_clip', asset_id: 'p', start: t, duration: l }); else ops.push({ op: 'add_clip', asset_id: ids[k++], start: t }, { op: 'trim_clip', clip_id: `c${n}`, in: 0, out: l }); t += l; });
  const r = applyBatch(createProject({ assets }), [...ops, ...extra]); assert.ok(r.ok, JSON.stringify(r)); return r.project;
};
const apply = (p, plan) => { assert.ok(plan.ok, JSON.stringify(plan)); const r = applyBatch(p, plan.ops); assert.ok(r.ok, JSON.stringify(r)); return r.project; };

test('catálogo: las plantillas con huecos existen y suman su duración', () => {
  for (const id of ['burst', 'beforeafter', 'top3']) { const t = TPL_CATALOG.find((x) => x.id === id); assert.ok(t && t.special === 'slots' && t.slots.length >= 2, id); }
  assert.equal(TPL_CATALOG.find((x) => x.id === 'burst').slots.reduce((a, b) => a + b, 0), 9);
});
test('Ráfaga: 6 clips largos pasan a 1,5 s del centro, pegados, en 9:16', () => {
  const p = mk([10, 8, 12, 6, 9, 7]), q = apply(p, planTemplate(p, 'burst'));
  assert.equal(q.format.aspect, '9:16'); assert.equal(q.clips.length, 6); assert.ok(q.clips.every((c) => Math.abs(clipLength(c) - 1.5) < 1e-6));
  assert.deepEqual(q.clips.map((c) => c.start), [0, 1.5, 3, 4.5, 6, 7.5]); assert.equal(totalDuration(q), 9);
  assert.equal(q.clips[0].in, 4.25);      // centro de 0–10 con 1,5 s: 4,25 → 5,75
  assert.equal(q.texts.length, 0);
});
test('Antes y después: 2 huecos de 4 s con rótulos; Top 3: cuenta regresiva N.º 3, 2, 1', () => {
  const p = mk([10, 9]), q = apply(p, planTemplate(p, 'beforeafter')); assert.equal(totalDuration(q), 8);
  assert.deepEqual(q.texts.map((t) => [t.text, t.start]), [['Antes', 0.3], ['Después', 4.3]]); assert.ok(q.texts.every((t) => t.end - t.start > 1 && t.end - t.start <= 2));
  const p3 = mk([6, 6, 6]), q3 = apply(p3, planTemplate(p3, 'top3')); assert.equal(totalDuration(q3), 12); assert.deepEqual(q3.texts.map((t) => t.text), ['N.º 3', 'N.º 2', 'N.º 1']);
});
test('menos clips que huecos: llena los que hay y avisa; clips que sobran siguen después sin cambios', () => {
  const p = mk([10, 10]), plan = planTemplate(p, 'burst'); assert.ok(plan.ok); assert.ok(plan.warnings.some((w) => /Faltan 4 clips/.test(w)));
  const q = apply(p, plan); assert.equal(totalDuration(q), 3);
  const p5 = mk([10, 10, 10, 10]), q5 = apply(p5, planTemplate(p5, 'beforeafter')); assert.equal(q5.clips.length, 4); assert.equal(clipLength(q5.clips[2]), 10); assert.equal(q5.clips[2].start, 8);
  assert.ok(planTemplate(p5, 'beforeafter').warnings.some((w) => /Sobran 2 clips/.test(w)));
});
test('un video más corto que su hueco queda corto; una foto dura lo del hueco', () => {
  const p = mk([2, 3], [], 1), plan = planTemplate(p, 'beforeafter'), q = apply(p, plan);
  assert.equal(clipLength(q.clips[0]), 2); assert.equal(clipLength(q.clips[1]), 4); assert.equal(q.clips[1].start, 2); assert.ok(plan.warnings.some((w) => /menos que su hueco/.test(w)));
});
test('el audio que iba con un video se recorta y se mueve con él; con velocidad ≠ 1 se niega con claridad', () => {
  let p = mk([10, 10]); p = applyBatch(p, [{ op: 'add_audio_clip', asset_id: 'm', start: 10, in: 0, out: 10 }]).project;
  const q = apply(p, planTemplate(p, 'beforeafter')); const a = q.audioClips[0]; assert.equal(a.start, 4); assert.equal(clipLength(a), 4);
  const s = applyBatch(p, [{ op: 'set_clip_speed', clip_id: 'c1', speed: 2 }]).project, r = planTemplate(s, 'burst'); assert.equal(r.ok, false); assert.match(r.error, /1×/);
});
test('sin clips falla; ver la propuesta no cambia el proyecto', () => {
  assert.equal(planTemplate(createProject({ assets }), 'top3').ok, false);
  const p = mk([10, 10, 10]), before = JSON.stringify(p); planTemplate(p, 'top3'); assert.equal(JSON.stringify(p), before);
});
