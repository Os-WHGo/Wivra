// Quitar silencios: detecta las pausas en el audio de los clips y arma operaciones normales del editor para cortarlas. Solo lógica pura (sin DOM). — Claude
// Es una regla de volumen simple y honesta (NO entiende palabras): una pausa es un tramo MÁS BAJO que el resto durante un rato.
// Todo ocurre en el teléfono; no se envía audio a ningún lado. El resultado es un solo lote de operaciones (un solo paso en «deshacer»).
const silR = (x) => Math.round(x * 1000) / 1000;
export const SIL_WIN = 0.02;                                     // ventana de análisis: 20 ms
export const SIL_LEVELS = {                                      // sensibilidad: cuánto debe durar una pausa para cortarla
  soft: { id: 'soft', minSilence: 0.7, pad: 0.15 },
  normal: { id: 'normal', minSilence: 0.4, pad: 0.12 },
  strong: { id: 'strong', minSilence: 0.25, pad: 0.08 },
};
export const SIL_MIN_KEEP = 0.1, SIL_MIN_CUT = 0.12, SIL_MIN_DYNAMIC_DB = 12, SIL_DB_FLOOR = -90;

/** Muestras (Float32, un canal) → volumen en dB por ventana de 20 ms. Devuelve { env: Float32Array, win }. */
export function envelopeFromSamples(samples, sampleRate, win = SIL_WIN) {
  const n = Math.max(1, Math.round(sampleRate * win)), count = Math.floor(samples.length / n), env = new Float32Array(count);
  for (let w = 0; w < count; w++) {
    let s = 0; const o = w * n;
    for (let i = 0; i < n; i++) { const v = samples[o + i]; if (Number.isFinite(v)) s += v * v; }
    const rms = Math.sqrt(s / n); env[w] = rms > 1e-5 ? 20 * Math.log10(rms) : SIL_DB_FLOOR;
  }
  return { env, win: n / sampleRate };
}

const silPct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];

/**
 * Pausas dentro de [from, to] segundos del medio. Umbral automático: entre el ruido de fondo (percentil 10) y las voces (percentil 95).
 * Devuelve { cuts:[{start,end}], threshold, silent, flat }: `cuts` ya deja un colchón `pad` de silencio junto a la voz (para no «comerse» las palabras).
 * `flat`=true si casi no hay diferencia de volumen (ruido o música continuos): no se corta nada, porque no se puede distinguir una pausa.
 */
export function silencesFromEnvelope(env, win, from, to, { minSilence = 0.4, pad = 0.12, thresholdDb } = {}) {
  const a = Math.max(0, Math.floor(from / win)), b = Math.min(env.length, Math.ceil(to / win));
  if (b - a < 3) return { cuts: [], threshold: null, silent: 0, flat: true };
  const part = Array.from(env.subarray(a, b)).sort((x, y) => x - y), floor = silPct(part, 0.1), peak = silPct(part, 0.95);
  if (thresholdDb === undefined && peak - floor < SIL_MIN_DYNAMIC_DB) return { cuts: [], threshold: null, silent: 0, flat: true };
  const th = thresholdDb !== undefined ? thresholdDb : Math.max(-60, Math.min(-25, floor + 0.35 * (peak - floor)));
  const cuts = []; let i = a;
  while (i < b) {
    if (env[i] >= th) { i++; continue; }
    let j = i; while (j < b && env[j] < th) j++;
    const s = i * win, e = j * win;                                  // pausa [s, e)
    if (e - s >= minSilence) {
      const cs = i === a ? s : s + pad, ce = j === b ? e : e - pad;  // en los bordes del clip no hace falta colchón hacia fuera
      if (ce - cs >= SIL_MIN_CUT) cuts.push({ start: silR(Math.max(from, cs)), end: silR(Math.min(to, ce)) });
    }
    i = j;
  }
  return { cuts, threshold: silR(th), silent: silR(cuts.reduce((x, c) => x + (c.end - c.start), 0)), flat: false };
}

// Operaciones para quitar `regions` (tiempo del MEDIO, ordenadas, dentro de [x.in, x.out]) de un clip x. Devuelve los trozos que quedan con su inicio actual.
function silCutOps(x, prefix, regions, ctr) {
  const ops = [], segs = []; const E = 0.002;
  let id = x.id, cin = x.in, cstart = x.start; const cout = x.out;
  for (const r of regions) {
    const rs = Math.max(r.start, cin), re = Math.min(r.end, cout); if (re - rs < E) continue;
    if (rs <= cin + E) {                                              // la pausa está al principio del trozo
      if (re >= cout - E) { ops.push({ op: 'delete_clip', clip_id: id }); id = null; break; }
      ops.push({ op: 'trim_clip', clip_id: id, in: silR(re), out: cout }); cin = silR(re);   // `start` no cambia: se corrige al final con move_clip
      continue;
    }
    ops.push({ op: 'split_clip', clip_id: id, at: silR(rs) });
    const rid = `${prefix}${ctr.n++}`;
    segs.push({ id, in: cin, out: silR(rs), start: cstart });
    const rstart = cstart + (silR(rs) - cin);                          // el trozo derecho nace en su sitio de siempre
    if (re >= cout - E) { ops.push({ op: 'delete_clip', clip_id: rid }); id = null; break; }
    ops.push({ op: 'split_clip', clip_id: rid, at: silR(re) });
    const nid = `${prefix}${ctr.n++}`;
    ops.push({ op: 'delete_clip', clip_id: rid });
    id = nid; cstart = rstart + (silR(re) - silR(rs)); cin = silR(re);
  }
  if (id) segs.push({ id, in: cin, out: cout, start: cstart });
  return { ops, segs };
}

/**
 * planSilenceCut(project, cutsByClip, { texts })
 *  cutsByClip: { [clip_id]: [{start,end}] } con las pausas en tiempo del MEDIO de cada video de la línea principal.
 * Quita esas pausas, junta lo que queda (sin huecos nuevos), corta igual el audio que iba con cada video y corre los textos.
 * → { ok, ops, before, after, removed, pauses, warnings } | { ok:false, error }
 */
export function planSilenceCut(project, cutsByClip, { texts = true } = {}) {
  if (!project || !Array.isArray(project.clips) || !project.clips.length) return { ok: false, error: 'No hay clips en la línea de tiempo.' };
  const kind = new Map((project.assets || []).map((a) => [a.id, a.kind])), mains = [...project.clips].sort((a, b) => a.start - b.start);
  const tl = [];                                                      // pausas en tiempo de la línea de tiempo
  const perClip = new Map();
  for (const c of mains) {
    if (kind.get(c.asset_id) === 'image') continue;
    const regs = (cutsByClip?.[c.id] || []).map((r) => ({ start: Math.max(c.in, r.start), end: Math.min(c.out, r.end) })).filter((r) => r.end - r.start >= 0.01).sort((a, b) => a.start - b.start);
    for (const r of regs) { if (r.start - c.in < SIL_MIN_KEEP) r.start = c.in; if (c.out - r.end < SIL_MIN_KEEP) r.end = c.out; }      // un resto de menos de 0,1 s junto al borde es un clic, no voz: se va con la pausa
    const merged = []; for (const r of regs) { const l = merged[merged.length - 1]; if (l && r.start <= l.end + 0.001) l.end = Math.max(l.end, r.end); else merged.push({ ...r }); }
    if (!merged.length) continue;
    perClip.set(c.id, merged);
    for (const r of merged) tl.push({ start: c.start + (r.start - c.in), end: c.start + (r.end - c.in) });
  }
  const before = mains.reduce((m, c) => Math.max(m, c.start + (c.out - c.in)), 0);
  if (!tl.length) return { ok: true, ops: [], before: silR(before), after: silR(before), removed: 0, pauses: 0, warnings: ['No encontré pausas para quitar con esta sensibilidad.'] };
  tl.sort((a, b) => a.start - b.start);
  const removedBefore = (t) => { let s = 0; for (const r of tl) { if (r.start >= t) break; s += Math.min(r.end, t) - r.start; } return s; };
  const ctr = { n: project.nextId ?? 1 }, ops = [], newStart = (oldStart) => Math.max(0, silR(oldStart - removedBefore(oldStart + 1e-9)));
  const moves = [];
  const finish = (x, segs, base) => {                                  // inicio nuevo de cada trozo = su inicio de siempre − lo ya quitado antes
    for (const s of segs) { const orig = base + (s.in - x.in), want = newStart(orig); if (Math.abs(want - s.start) > 0.0005) moves.push({ op: 'move_clip', clip_id: s.id, start: want }); }
  };
  for (const c of mains) {
    const regs = perClip.get(c.id);
    if (!regs) { const want = newStart(c.start); if (Math.abs(want - c.start) > 0.0005) moves.push({ op: 'move_clip', clip_id: c.id, start: want }); continue; }
    const r = silCutOps(c, 'c', regs, ctr); ops.push(...r.ops); finish(c, r.segs, c.start);
  }
  // Audio que «va con» un video (≥80 % de su duración dentro de él): se corta con las mismas pausas. La música que cruza varios clips no se toca.
  let linked = 0, other = 0;
  for (const a of project.audioClips || []) {
    const alen = a.out - a.in, as = a.start, ae = a.start + alen; let home = null, best = 0;
    for (const c of mains) { if (!perClip.has(c.id) && kind.get(c.asset_id) === 'image') continue; const ov = Math.min(ae, c.start + (c.out - c.in)) - Math.max(as, c.start); if (ov > best) { best = ov; home = c; } }
    if (!home || alen <= 0 || best < 0.8 * alen || kind.get(home.asset_id) === 'image') { other++; continue; }
    linked++;
    const regs = tl.map((r) => ({ start: a.in + (r.start - a.start), end: a.in + (r.end - a.start) })).filter((r) => r.end > a.in && r.start < a.out)
      .map((r) => ({ start: Math.max(a.in, r.start), end: Math.min(a.out, r.end) }));
    const merged = []; for (const r of regs) { const l = merged[merged.length - 1]; if (l && r.start <= l.end + 0.001) l.end = Math.max(l.end, r.end); else merged.push({ ...r }); }
    if (!merged.length) { const want = newStart(a.start); if (Math.abs(want - a.start) > 0.0005) moves.push({ op: 'move_clip', clip_id: a.id, start: want }); continue; }
    const r = silCutOps(a, 'u', merged, ctr); ops.push(...r.ops); finish(a, r.segs, a.start);
  }
  ops.push(...moves);
  let shifted = 0, dropped = 0;
  if (texts) for (const t of project.texts || []) {
    const ns = silR(t.start - removedBefore(t.start + 1e-9)), ne = silR(t.end - removedBefore(t.end - 1e-9)), dur = silR(ne - ns);
    if (dur < 0.2) { ops.push({ op: 'delete_text', text_id: t.id }); dropped++; continue; }
    if (Math.abs(ns - t.start) > 0.0005 || Math.abs(dur - (t.end - t.start)) > 0.0005) { ops.push({ op: 'set_text', text_id: t.id, start: ns, duration: dur }); shifted++; }
  }
  const removed = silR(tl.reduce((s, r) => s + (r.end - r.start), 0)), warnings = [];
  if (linked) warnings.push('El audio que iba con cada video se cortó igual.');
  if (shifted || dropped) warnings.push('Los textos se corrieron con el video.');
  if (dropped) warnings.push('Algún texto quedó dentro de una pausa y se borró.');
  if ((project.overlayClips || []).length || other) warnings.push('Las capas y los audios aparte (música) no se mueven: revisa su tiempo.');
  return { ok: true, ops, before: silR(before), after: silR(before - removed), removed, pauses: tl.length, warnings };
}
