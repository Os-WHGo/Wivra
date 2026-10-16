// Quitar silencios: detección por volumen + que las operaciones se apliquen de verdad (clips, audio ligado, textos). — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { envelopeFromSamples, silencesFromEnvelope, planSilenceCut, SIL_LEVELS } from '../silence.mjs';
import { createProject } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';

const RATE = 8000;
// Señal de prueba: tramos [desde, hasta, amplitud] en segundos (el resto, silencio con un poco de ruido).
const signal = (dur, loud) => { const x = new Float32Array(Math.round(dur * RATE)); for (let i = 0; i < x.length; i++) { const t = i / RATE; let a = 0.0008 * Math.sin(i * 0.37); for (const [s, e, amp] of loud) if (t >= s && t < e) a = amp * Math.sin(i * 0.21); x[i] = a; } return x; };
const detect = (x, dur, opts = SIL_LEVELS.normal) => { const { env, win } = envelopeFromSamples(x, RATE); return silencesFromEnvelope(env, win, 0, dur, opts); };
const near = (a, b, tol = 0.05) => Math.abs(a - b) <= tol;

test('encuentra la pausa del medio y deja un colchón junto a la voz', () => {
  const r = detect(signal(6, [[0, 2, 0.4], [4, 6, 0.4]]), 6); assert.equal(r.flat, false); assert.equal(r.cuts.length, 1);
  assert.ok(near(r.cuts[0].start, 2.12) && near(r.cuts[0].end, 3.88), JSON.stringify(r.cuts));
});
test('pausas cortas no se cortan; las largas sí; en el borde no hay colchón hacia fuera', () => {
  const r = detect(signal(8, [[1.5, 3, 0.4], [3.2, 5, 0.4], [6.5, 8, 0.4]]), 8);       // 0–1.5 (borde), 3–3.2 (corta), 5–6.5
  assert.equal(r.cuts.length, 2, JSON.stringify(r.cuts)); assert.ok(near(r.cuts[0].start, 0) && near(r.cuts[0].end, 1.38)); assert.ok(near(r.cuts[1].start, 5.12) && near(r.cuts[1].end, 6.38));
});
test('más sensible corta pausas más cortas', () => {
  const x = signal(5, [[0, 2, 0.4], [2.5, 5, 0.4]]);
  assert.equal(detect(x, 5, SIL_LEVELS.soft).cuts.length, 0); assert.equal(detect(x, 5, SIL_LEVELS.normal).cuts.length, 1);
});
test('ruido parejo (sin diferencia de volumen) no se corta', () => {
  const r = detect(signal(5, [[0, 5, 0.3]]), 5); assert.equal(r.flat, true); assert.deepEqual(r.cuts, []);
});
test('muestras dañadas (NaN) no rompen nada', () => { const x = signal(3, [[0, 1, 0.4]]); x[100] = NaN; assert.doesNotThrow(() => detect(x, 3)); });

const base = (extra = {}) => {
  let p = createProject({ assets: [{ id: 'a1', duration: 30, name: 'v1.mp4' }, { id: 'a2', duration: 30, name: 'v2.mp4' }, { id: 'm1', duration: 100, name: 'mic.wav', kind: 'audio' }, { id: 'p1', duration: 3600, name: 'f.jpg', kind: 'image' }] });
  p = applyBatch(p, [{ op: 'add_clip', asset_id: 'a1', start: 0 }, { op: 'trim_clip', clip_id: 'c1', in: 2, out: 12 }, { op: 'add_clip', asset_id: 'a2', start: 10 }, { op: 'trim_clip', clip_id: 'c2', in: 0, out: 8 }]).project;
  return p;
};
const total = (p) => p.clips.reduce((m, c) => Math.max(m, c.start + c.out - c.in), 0);
const sorted = (p) => [...p.clips].sort((a, b) => a.start - b.start);
const contiguous = (cs) => cs.slice(1).every((c, i) => near(c.start, cs[i].start + cs[i].out - cs[i].in, 0.002));

test('quita pausas dentro de un clip, en el medio, y deja todo pegado', () => {
  const p = base(), pl = planSilenceCut(p, { c1: [{ start: 5, end: 7 }], c2: [{ start: 0, end: 1 }] });
  assert.ok(pl.ok); assert.equal(pl.pauses, 2); assert.ok(near(pl.removed, 3, 1e-6)); assert.ok(near(pl.before, 18) && near(pl.after, 15));
  const r = applyBatch(p, pl.ops); assert.ok(r.ok, JSON.stringify(r)); assert.ok(near(total(r.project), 15, 0.002), String(total(r.project)));
  const cs = sorted(r.project); assert.equal(cs.length, 3); assert.ok(contiguous(cs)); assert.equal(cs[0].start, 0);
  assert.deepEqual(cs.map((c) => [c.asset_id, c.in, c.out]), [['a1', 2, 5], ['a1', 7, 12], ['a2', 1, 8]]);
});
test('pausa al principio o al final de un clip: recorta sin partir', () => {
  const p = base(), pl = planSilenceCut(p, { c1: [{ start: 2, end: 3 }, { start: 11, end: 12 }] });
  const r = applyBatch(p, pl.ops); assert.ok(r.ok, JSON.stringify(r)); const cs = sorted(r.project);
  assert.equal(cs.length, 2); assert.deepEqual([cs[0].in, cs[0].out], [3, 11]); assert.ok(contiguous(cs)); assert.ok(near(total(r.project), 16));
});
test('clip entero en silencio se borra y el resto se corre', () => {
  const p = base(), pl = planSilenceCut(p, { c1: [{ start: 0, end: 99 }] });
  const r = applyBatch(p, pl.ops); assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.project.clips.length, 1); assert.equal(r.project.clips[0].start, 0);
});
test('varias pausas en el mismo clip y ids que se predicen bien', () => {
  const p = base(), pl = planSilenceCut(p, { c1: [{ start: 3, end: 4 }, { start: 6, end: 7 }, { start: 9, end: 10 }] });
  const r = applyBatch(p, pl.ops); assert.ok(r.ok, JSON.stringify(r));
  const cs = sorted(r.project).filter((c) => c.asset_id === 'a1'); assert.deepEqual(cs.map((c) => [c.in, c.out]), [[2, 3], [4, 6], [7, 9], [10, 12]]); assert.ok(near(total(r.project), 15));
});
test('conserva volumen y silencio del clip en todos los trozos', () => {
  let p = base(); p = applyBatch(p, [{ op: 'set_clip_audio', clip_id: 'c1', volume: 0.5 }]).project;
  const r = applyBatch(p, planSilenceCut(p, { c1: [{ start: 5, end: 7 }] }).ops); assert.ok(r.ok); assert.ok(r.project.clips.filter((c) => c.asset_id === 'a1').every((c) => c.volume === 0.5));
});
test('el audio que va con el video se corta igual; la música que cruza clips no', () => {
  let p = base(); p = applyBatch(p, [{ op: 'add_audio_clip', asset_id: 'm1', start: 0, in: 10, out: 20 }, { op: 'add_audio_clip', asset_id: 'm1', start: 0, in: 50, out: 70 }]).project;
  const [mic, music] = p.audioClips; const pl = planSilenceCut(p, { c1: [{ start: 5, end: 7 }] });
  const r = applyBatch(p, pl.ops); assert.ok(r.ok, JSON.stringify(r));
  const mine = r.project.audioClips.filter((u) => u.asset_id === 'm1' && u.in < 40).sort((a, b) => a.start - b.start);
  assert.deepEqual(mine.map((u) => [u.in, u.out]), [[10, 13], [15, 20]]); assert.ok(near(mine[1].start, 3)); assert.ok(near(mine[0].start + 3, mine[1].start));
  const mus = r.project.audioClips.filter((u) => u.in >= 40); assert.equal(mus.length, 1); assert.equal(mus[0].start, 0); assert.ok(pl.warnings.some((w) => /música/.test(w)));
});
test('los textos se corren; uno dentro de una pausa se borra', () => {
  let p = base(); p = applyBatch(p, [{ op: 'add_text', text: 'antes', start: 1, duration: 1 }, { op: 'add_text', text: 'despues', start: 9, duration: 2 }, { op: 'add_text', text: 'en pausa', start: 4, duration: 1 }]).project;
  const pl = planSilenceCut(p, { c1: [{ start: 5, end: 8 }] }); const r = applyBatch(p, pl.ops); assert.ok(r.ok, JSON.stringify(r));
  const tx = Object.fromEntries(r.project.texts.map((t) => [t.text, t])); assert.equal(tx['antes'].start, 1); assert.ok(near(tx['despues'].start, 6) && near(tx['despues'].end, 8)); assert.equal(tx['en pausa'], undefined);
});
test('sin pausas: nada que hacer; foto en la línea principal no se toca y se corre', () => {
  const p = base(); const a = planSilenceCut(p, {}); assert.ok(a.ok && !a.ops.length);
  let q = applyBatch(p, [{ op: 'add_photo_clip', asset_id: 'p1', start: 18, duration: 3 }]).project; const pl = planSilenceCut(q, { c1: [{ start: 5, end: 7 }], c9: [{ start: 0, end: 1 }] });
  const r = applyBatch(q, pl.ops); assert.ok(r.ok, JSON.stringify(r)); const ph = r.project.clips.find((c) => c.asset_id === 'p1'); assert.ok(near(ph.start, 16)); assert.ok(near(ph.out - ph.in, 3));
});
test('un solo lote se deshace de una vez (es una sola revisión)', () => {
  const p = base(), r = applyBatch(p, planSilenceCut(p, { c1: [{ start: 5, end: 7 }] }).ops); assert.equal(r.project.revision, p.revision + 1);
});
test('sin clips o proyecto vacío', () => { assert.equal(planSilenceCut(createProject({ assets: [] }), {}).ok, false); });

test('un resto de menos de 0,1 s junto al borde se va con la pausa (no quedan astillas)', () => {
  const p = base(), pl = planSilenceCut(p, { c1: [{ start: 2.04, end: 4 }, { start: 8, end: 11.95 }] });
  const r = applyBatch(p, pl.ops); assert.ok(r.ok, JSON.stringify(r)); const cs = sorted(r.project).filter((c) => c.asset_id === 'a1');
  assert.deepEqual(cs.map((c) => [c.in, c.out]), [[4, 8]]);
});
