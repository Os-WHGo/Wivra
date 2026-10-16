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

// ── Audios que van con cada video (p. ej. el micrófono de «Captura»): se recortan y se mueven junto con su video ──
const withAudio = (extra = []) => {
  const assets = [{ id: 'a1', duration: 20, name: 'v1.mov' }, { id: 'a2', duration: 20, name: 'v2.mov' }, { id: 'p1', duration: 3600, name: 'f.jpg', kind: 'image' }, { id: 'm1', duration: 20, name: 'mic1.m4a', kind: 'audio' }, { id: 'm2', duration: 20, name: 'mic2.m4a', kind: 'audio' }, { id: 'mus', duration: 120, name: 'musica.mp3', kind: 'audio' }];
  let p = createProject({ assets });
  p = applyBatch(p, [{ op: 'add_clip', asset_id: 'a1', start: 0 }, { op: 'add_photo_clip', asset_id: 'p1', start: 20, duration: 4 }, { op: 'add_clip', asset_id: 'a2', start: 24 }]).project;
  p = applyBatch(p, [{ op: 'add_audio_clip', asset_id: 'm1', start: 0, in: 0, out: 20, role: 'voice_primary' }, { op: 'add_audio_clip', asset_id: 'm2', start: 24, in: 0, out: 20, role: 'voice_primary' }, ...extra]).project;
  return p;
};
const sync = (p, a, c) => (a.in - a.start) - (c.in - c.start);      // desfase entre el audio y su video: no debe cambiar al recortar y mover
test('el audio que va con cada video se recorta y se mueve junto con él (no suena sobre la foto ni el siguiente video)', () => {
  const p = withAudio(), pl = planQuickAssembly(p, { targetSeconds: 12 });
  assert.ok(pl.ok && pl.trimmed > 0, JSON.stringify(pl.warnings));
  const r = applyBatch(p, pl.ops); assert.ok(r.ok, JSON.stringify(r)); const q = r.project;
  const vids = q.clips.filter((c) => !['p1'].includes(c.asset_id)), photo = q.clips.find((c) => c.asset_id === 'p1');
  for (const [mic, vid0] of [['m1', 'a1'], ['m2', 'a2']]) {
    const a = q.audioClips.find((k) => k.asset_id === mic), c = vids.find((k) => k.asset_id === vid0), a0 = p.audioClips.find((k) => k.asset_id === mic), c0 = p.clips.find((k) => k.asset_id === vid0);
    assert.ok(a.start >= c.start - 0.01 && a.start + (a.out - a.in) <= c.start + (c.out - c.in) + 0.01, `${mic}: el audio queda dentro de su video (${a.start}–${a.start + a.out - a.in} vs ${c.start}–${c.start + c.out - c.in})`);
    assert.ok(Math.abs(sync(q, a, c) - sync(p, a0, c0)) < 0.011, `${mic}: sigue en sincronía con su video`);
    assert.ok(a.start + (a.out - a.in) <= photo.start + 0.01 || a.start >= photo.start + (photo.out - photo.in) - 0.01, `${mic}: no pisa la foto`);
  }
  assert.ok(pl.warnings.some((w) => /audio que iba con cada video/.test(w)));
  assert.ok(!pl.warnings.some((w) => /audios aparte/.test(w)), 'sin audios sueltos no se avisa de ellos');
});
test('una música que cruza varios clips no se toca; sí se avisa', () => {
  const p = withAudio([{ op: 'add_audio_clip', asset_id: 'mus', start: 0, in: 0, out: 60, role: 'music' }]), pl = planQuickAssembly(p, { targetSeconds: 12 });
  const r = applyBatch(p, pl.ops); assert.ok(r.ok, JSON.stringify(r));
  const mus0 = p.audioClips.find((k) => k.asset_id === 'mus'), mus = r.project.audioClips.find((k) => k.asset_id === 'mus');
  assert.deepEqual([mus.start, mus.in, mus.out], [mus0.start, mus0.in, mus0.out]); assert.ok(pl.warnings.some((w) => /audios aparte/.test(w)));
});
test('un audio que solo cubría el tramo recortado se quita; si el video no cambia, el audio tampoco', () => {
  const p0 = withAudio([{ op: 'add_audio_clip', asset_id: 'm1', start: 0, in: 0, out: 1, role: 'other' }]), pl = planQuickAssembly(p0, { targetSeconds: 12 });
  const r = applyBatch(p0, pl.ops); assert.ok(r.ok, JSON.stringify(r)); assert.equal(r.project.audioClips.length, p0.audioClips.length - 1, 'el audio de 1 s del inicio (recortado) se borra');
  const ok = planQuickAssembly(withAudio(), { targetSeconds: 600 }); assert.deepEqual(ok.ops, []);
});
