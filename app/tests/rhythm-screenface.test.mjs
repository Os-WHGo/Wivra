// Revisión de ritmo, zona segura de textos y plantilla «Pantalla + cara». — Claude
import test from 'node:test'; import assert from 'node:assert/strict';
import { analyzeRhythm, RH } from '../rhythm.mjs';
import { planTemplate, planScreenFace, SF_BUBBLE } from '../templates.mjs';
import { drawTexts } from '../export.mjs';
import { TEXT_ZONES, textZoneOf, safeZoneOn } from '../../core/text-style.mjs';
import { createProject, timelineEnd } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';
import { makeSnapshot, readSnapshot } from '../persist.mjs';

const mk = (lens, extra = []) => { let p = createProject({ assets: [...lens.map((l, i) => ({ id: `a${i + 1}`, duration: l + 5, name: `v${i + 1}.mp4` })), ...extra] }); let t = 0;
  p = applyBatch(p, lens.map((l, i) => { const o = { op: 'add_clip', asset_id: `a${i + 1}`, start: t }; t += l; return o; })).project;
  return applyBatch(p, p.clips.map((c, i) => ({ op: 'trim_clip', clip_id: c.id, in: 0, out: lens[i] }))).project; };
const ok = (p, ops) => { const r = applyBatch(p, ops); assert.ok(r.ok, JSON.stringify(r)); return r.project; };
const codes = (r) => r.items.map((i) => i.code);

test('ritmo: sin clips no analiza', () => { assert.equal(analyzeRhythm(createProject()).ok, false); });
test('ritmo: un video bien armado (cortes, texto de gancho y cierre) no recibe avisos', () => {
  let p = mk([3, 4, 3, 4, 3]); p = ok(p, [{ op: 'add_text', text: 'Mira esto', start: 0, duration: 2.5 }, { op: 'add_text', text: 'Sígueme', start: 15, duration: 2 }]);
  const r = analyzeRhythm(p); assert.ok(r.ok); assert.deepEqual(codes(r), ['clean'], JSON.stringify(r.items));
});
test('ritmo: gancho, plano largo y cierre salen como sugerencias (tip) con su momento', () => {
  const r = analyzeRhythm(mk([12, 10])); const c = codes(r);
  assert.ok(c.includes('hook-cut') && c.includes('hook-text') && c.includes('long') && c.includes('end'), c.join());
  assert.ok(r.items.filter((i) => i.level === 'tip').length >= 4); assert.equal(r.items.find((i) => i.code === 'long').at, 0);
  assert.ok(r.items.find((i) => i.code === 'end').text.includes('cierre'));
});
test('ritmo: un corte en los primeros 3 s evita el aviso de gancho; un texto dentro del plano largo evita el aviso de plano largo', () => {
  let p = mk([2, 11]); assert.ok(!codes(analyzeRhythm(p)).includes('hook-cut'));
  p = ok(p, [{ op: 'add_text', text: 'Mira', start: 1, duration: 2 }, { op: 'add_text', text: 'Dato', start: 7, duration: 2 }]); assert.ok(!codes(analyzeRhythm(p)).includes('long'));
});
test('ritmo: hueco negro y música que pasa del final son avisos (warn) y van primero', () => {
  let p = mk([5, 5, 5]); p = ok(p, [{ op: 'move_clip', clip_id: p.clips[1].id, start: 7 }, { op: 'move_clip', clip_id: p.clips[2].id, start: 12 }]);
  p = { ...p, assets: [...p.assets, { id: 'm1', kind: 'audio', duration: 40, name: 'm.mp3' }] }; p = ok(p, [{ op: 'add_audio_clip', asset_id: 'm1', start: 0, in: 0, out: 30 }]);
  const r = analyzeRhythm(p); assert.equal(r.items[0].level, 'warn'); const gap = r.items.find((i) => i.code === 'gap'); assert.ok(gap && /2 s/.test(gap.text) && gap.at === 5, JSON.stringify(gap));
  assert.ok(codes(r).includes('tail'));
});
test('ritmo: texto que no da tiempo a leer (muy corto o muy largo para su duración)', () => {
  let p = mk([4, 4, 4]); p = ok(p, [{ op: 'add_text', text: 'Hola', start: 1, duration: 0.6 }, { op: 'add_text', text: 'Esta frase tan larga no se alcanza a leer', start: 4, duration: 1.5 }, { op: 'add_text', text: 'Bien', start: 8, duration: 2 }]);
  const reads = analyzeRhythm(p).items.filter((i) => i.code === 'read'); assert.equal(reads.length, 2); assert.ok(reads[0].level === 'warn');
});
test('ritmo: muchos casos se resumen (no inunda la lista)', () => {
  let p = mk([2, 2, 2, 2, 2, 2]); p = ok(p, p.clips.map((c, i) => ({ op: 'move_clip', clip_id: c.id, start: i * 3 }))); const g = analyzeRhythm(p).items.filter((i) => i.code === 'gap');
  assert.equal(g.length, RH.listMax + 1); assert.match(g[g.length - 1].text, /más/);
});
test('ritmo: el mismo plano al inicio y al final cuenta como cierre en bucle (ok)', () => {
  let p = createProject({ assets: [{ id: 'a1', duration: 20, name: 'a.mp4' }, { id: 'a2', duration: 20, name: 'b.mp4' }] });
  p = ok(p, [{ op: 'add_clip', asset_id: 'a1', start: 0 }, { op: 'add_clip', asset_id: 'a2', start: 20 }, { op: 'add_clip', asset_id: 'a1', start: 40 }]);
  p = ok(p, p.clips.map((c) => ({ op: 'trim_clip', clip_id: c.id, in: 0, out: 3 }))).clips && ok(p, p.clips.map((c, i) => ({ op: 'trim_clip', clip_id: c.id, in: 0, out: 3 })));
  p = ok(p, p.clips.map((c, i) => ({ op: 'move_clip', clip_id: c.id, start: i * 3 })));
  const r = analyzeRhythm(p); const loop = r.items.find((i) => i.code === 'loop'); assert.ok(loop && loop.level === 'ok');
});
test('ritmo: en 9:16 con textos arriba/abajo sugiere la zona segura; activada, ya no', () => {
  let p = mk([3, 3, 3]); p = ok(p, [{ op: 'set_format', aspect: '9:16' }, { op: 'add_text', text: 'Hola', start: 0, duration: 2.5 }]);
  const s = analyzeRhythm(p).items.find((i) => i.code === 'safe'); assert.ok(s && s.action === 'safe');
  p = ok(p, [{ op: 'set_format', safe: true }]); assert.ok(!codes(analyzeRhythm(p)).includes('safe'));
});

test('zona segura: set_format safe se guarda solo si está activa, se conserva y se valida; deshacer/migrar la respetan', () => {
  let p = mk([3]); p = ok(p, [{ op: 'set_format', aspect: '9:16', safe: true }]); assert.deepEqual(p.format, { aspect: '9:16', fit: 'cover', safe: true });
  p = ok(p, [{ op: 'set_format', fit: 'contain' }]); assert.equal(p.format.safe, true);
  assert.equal(applyBatch(p, [{ op: 'set_format', safe: 'si' }]).ok, false);
  p = ok(p, [{ op: 'set_format', safe: false }]); assert.deepEqual(p.format, { aspect: '9:16', fit: 'contain' });
  const q = ok(p, [{ op: 'set_format', safe: true }]); assert.equal(readSnapshot(JSON.stringify(makeSnapshot({ project: q }))).snapshot.project.format.safe, true);
  assert.ok(!safeZoneOn({ aspect: '1:1', safe: true }) && safeZoneOn({ aspect: '9:16', safe: true }) && textZoneOf({ aspect: '1:1', safe: true }) === TEXT_ZONES.normal);
});
test('zona segura: los textos se dibujan dentro de x 90–950 y y 240–1470 (1080×1920); sin ella, como siempre', () => {
  const fake = () => { const g = { calls: [], font: '' }; g.measureText = (s) => ({ width: s.length * parseFloat(/(\d+(\.\d+)?)px/.exec(g.font)[1]) * 0.55 }); g.fillText = (t, x, y) => g.calls.push([t, x, y]); g.strokeText = () => {}; g.beginPath = g.fill = g.rect = g.roundRect = () => {}; return g; };
  const list = [{ id: 'a', text: 'ARRIBA', pos: 'top' }, { id: 'b', text: 'CENTRO', pos: 'middle' }, { id: 'c', text: 'ABAJO' }];
  const a = fake(); drawTexts(a, list, 1080, 1920, TEXT_ZONES.safe); const b = fake(); drawTexts(b, list, 1080, 1920);
  const y = (g, t) => g.calls.find((c) => c[0] === t)[2];
  assert.ok(y(a, 'ARRIBA') >= 240 && y(a, 'ABAJO') <= 1470, `${y(a, 'ARRIBA')} ${y(a, 'ABAJO')}`); assert.ok(y(b, 'ABAJO') > 1470, 'sin zona segura el texto de abajo cae donde tapan los botones');
  assert.ok(a.calls.every((c) => Math.abs(c[1] - 520) < 1), 'centrado en la zona'); assert.ok(b.calls.every((c) => c[1] === 540));
  const long = fake(); drawTexts(long, [{ id: 'l', text: 'palabra '.repeat(30) }], 1080, 1920, TEXT_ZONES.safe); assert.ok(long.calls.every((c) => c[2] >= 240 - 60 && c[2] <= 1470), 'varias líneas siguen dentro');
});

test('«Pantalla + cara»: el 2.º video pasa a círculo encima del 1.º, lo demás se corre y todo se aplica en un lote', () => {
  const p = mk([20, 15, 10]), pl = planTemplate(p, 'screenface'); assert.ok(pl.ok, JSON.stringify(pl));
  const q = ok(p, pl.ops); assert.deepEqual(q.format, { aspect: '9:16', fit: 'cover', safe: true });
  assert.equal(q.clips.length, 2); assert.deepEqual(q.clips.map((c) => [c.asset_id, c.start]), [['a1', 0], ['a3', 20]]);
  assert.equal(q.overlayClips.length, 1); const o = q.overlayClips[0];
  assert.equal(o.asset_id, 'a2'); assert.equal(o.start, 0); assert.equal(o.out - o.in, 15); assert.equal(o.shape, 'circle'); assert.equal(o.x, SF_BUBBLE.x); assert.equal(o.frameColor, '#ffffff');
  assert.equal(timelineEnd(q), 30);
  assert.ok(pl.warnings.some((w) => /termina 5 s antes/.test(w)) && pl.warnings.some((w) => /silencia uno/.test(w)));
});
test('«Pantalla + cara»: círculo dentro de la zona segura de 1080×1920', () => {
  const half = SF_BUBBLE.scale * 1080 / 2; assert.ok(SF_BUBBLE.x * 1080 - half >= 90 && SF_BUBBLE.x * 1080 + half <= 950); assert.ok(SF_BUBBLE.y * 1920 - half >= 240 && SF_BUBBLE.y * 1920 + half <= 1470);
});
test('«Pantalla + cara»: si la cara es más larga se recorta a la pantalla; el audio de la cara se va con ella y el resto del audio se corre', () => {
  let p = mk([10, 14, 6], [{ id: 'm1', kind: 'audio', duration: 60, name: 'mic.m4a' }, { id: 'm2', kind: 'audio', duration: 60, name: 'mic2.m4a' }]);
  p = ok(p, [{ op: 'add_audio_clip', asset_id: 'm1', start: 10, in: 0, out: 14, role: 'voice_primary' }, { op: 'add_audio_clip', asset_id: 'm2', start: 24, in: 0, out: 6, role: 'voice_primary' }]);
  const pl = planScreenFace(p); assert.ok(pl.ok); const q = ok(p, pl.ops);
  assert.equal(q.overlayClips[0].out - q.overlayClips[0].in, 10); assert.ok(pl.warnings.some((w) => /dura 4 s más/.test(w)));
  const a1 = q.audioClips.find((c) => c.asset_id === 'm1'), a2 = q.audioClips.find((c) => c.asset_id === 'm2');
  assert.equal(a1.start, 0); assert.equal(a1.out - a1.in, 10); assert.equal(a2.start, 10); assert.deepEqual(q.clips.map((c) => c.start), [0, 10]);
});
test('«Pantalla + cara»: pide dos videos; con 4 capas ya puestas avisa; no cuenta fotos', () => {
  assert.equal(planTemplate(mk([10]), 'screenface').ok, false);
  let p = mk([10, 10]); p = ok(p, [1, 2, 3, 4].map((t) => ({ op: 'add_overlay_clip', asset_id: 'a1', start: 0, in: 0, out: 2, track: t })));
  assert.equal(planScreenFace(p).ok, false);
  let q = createProject({ assets: [{ id: 'a1', duration: 10, name: 'a.mp4' }, { id: 'f1', kind: 'image', duration: 3600, name: 'f.png' }] }); q = ok(q, [{ op: 'add_clip', asset_id: 'a1', start: 0 }, { op: 'add_photo_clip', asset_id: 'f1', start: 10, duration: 3 }]);
  assert.equal(planScreenFace(q).ok, false);
});
test('«Pantalla + cara»: aplicarla dos veces ya no es posible (queda un solo video) y la zona segura se pide una sola vez', () => {
  const p = mk([10, 10]), q = ok(p, planTemplate(p, 'screenface').ops); assert.equal(planTemplate(q, 'screenface').ok, false);
  const r = createProject({ assets: p.assets }); const base = ok(r, [{ op: 'set_format', aspect: '9:16', fit: 'cover', safe: true }, { op: 'add_clip', asset_id: 'a1', start: 0 }, { op: 'add_clip', asset_id: 'a2', start: 10 }]);
  assert.ok(!planTemplate(base, 'screenface').ops.some((o) => o.op === 'set_format'));
});
