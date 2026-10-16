// Volumen parejo: mide cuánto «suena» el video mezclado (norma ITU-R BS.1770 / EBU R128, implementación propia) y calcula UNA ganancia fija.
// Solo lógica pura (sin DOM). No comprime ni «aprieta» la voz: sube o baja todo por igual, y solo se detiene antes de que el pico distorsione. — Claude
// El objetivo (-14 LUFS u otro) es una ELECCIÓN editorial, no una norma universal: se ofrece como opción.
import { clipLength, speedOf } from '../core/project.mjs';
export const LOUD_LEVELS = {
  off: { id: 'off', target: null },
  balanced: { id: 'balanced', target: -14 },      // el estilo habitual de reels
  quiet: { id: 'quiet', target: -16 },
};
export const LOUD_RATE = 16000, LOUD_CEILING_DB = -1.5, LOUD_MAX_GAIN_DB = 12, LOUD_MIN_GAIN_DB = -12, LOUD_ABS_GATE = -70;
const loudR = (x) => Math.round(x * 100) / 100;

/** Coeficientes de los dos filtros de la norma (realce de agudos + pasa-altos), para cualquier frecuencia de muestreo. */
export function kWeightCoeffs(fs) {
  const shelf = (() => {
    const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196;
    const K = Math.tan(Math.PI * f0 / fs), Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416, a0 = 1 + K / Q + K * K;
    return { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
  })();
  const hp = (() => {
    const f0 = 38.13547087602444, Q = 0.5003270373238773, K = Math.tan(Math.PI * f0 / fs), a0 = 1 + K / Q + K * K;
    return { b: [1, -2, 1], a: [1, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] };
  })();
  return [shelf, hp];
}

function biquad(x, { b, a }) {
  const y = new Float64Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = Number.isFinite(x[i]) ? x[i] : 0, o = b[0] * v + b[1] * x1 + b[2] * x2 - a[1] * y1 - a[2] * y2;
    x2 = x1; x1 = v; y2 = y1; y1 = o; y[i] = o;
  }
  return y;
}

/**
 * Sonoridad integrada en LUFS (con compuertas de la norma). `channels` = un arreglo de canales (izquierdo, derecho…) o un solo canal.
 * La norma SUMA la energía de los canales: un audio mono repartido igual en izquierda y derecha suena 3 dB más fuerte que medido como un solo canal.
 * -Infinity si es silencio total.
 */
export function integratedLoudness(channels, fs) {
  const chs = Array.isArray(channels) ? channels : [channels], len = chs.length ? chs[0].length : 0; if (!len) return -Infinity;
  const n = Math.round(0.4 * fs), step = Math.round(0.1 * fs), pres = [];
  const done = new Map();                                              // un canal repetido (mono en L y R) se filtra una sola vez
  for (const c of chs) {
    if (!done.has(c)) { let y = c; for (const f of kWeightCoeffs(fs)) y = biquad(y, f); const pre = new Float64Array(y.length + 1); for (let i = 0; i < y.length; i++) pre[i + 1] = pre[i] + y[i] * y[i]; done.set(c, pre); }
    pres.push(done.get(c));
  }
  const power = (a, b) => pres.reduce((sum, pre) => sum + (pre[b] - pre[a]) / (b - a), 0), blocks = [];
  if (len < n) blocks.push(power(0, len)); else for (let st = 0; st + n <= len; st += step) blocks.push(power(st, st + n));
  const lufs = (ms) => (ms > 0 ? -0.691 + 10 * Math.log10(ms) : -Infinity);
  const abs = blocks.filter((ms) => lufs(ms) > LOUD_ABS_GATE); if (!abs.length) return -Infinity;
  const rel = lufs(abs.reduce((a, b) => a + b, 0) / abs.length) - 10, kept = abs.filter((ms) => lufs(ms) > rel);
  return kept.length ? lufs(kept.reduce((a, b) => a + b, 0) / kept.length) : -Infinity;
}

export const samplePeak = (x) => { let p = 0; for (const c of (Array.isArray(x) ? x : [x])) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > p) p = v; } return p; };

/** Un canal a la frecuencia `rate` (promedio de muestras). */
export function toRate(x, sr, rate = LOUD_RATE) {
  const len = x.length, ratio = sr / rate, n = Math.max(0, Math.floor(len / ratio)), out = new Float32Array(n);
  for (let i = 0; i < n; i++) { const a = Math.floor(i * ratio), b = Math.max(a + 1, Math.floor((i + 1) * ratio)); let s = 0; for (let j = a; j < b && j < len; j++) s += x[j]; out[i] = s / (b - a); }
  return out;
}
/** Sonido leído de un medio → { l, r, rate }: un audio mono usa el MISMO canal a izquierda y derecha, como al exportar. */
export function pcmFromChannels(channels, sr, rate = LOUD_RATE) {
  const l = toRate(channels[0], sr, rate); return { l, r: channels.length > 1 ? toRate(channels[1], sr, rate) : l, rate };
}
/** Promedio de izquierda y derecha (para el detector de pausas). */
export function monoOf(pcm) {
  if (pcm.r === pcm.l) return pcm.l; const o = new Float32Array(pcm.l.length); for (let i = 0; i < o.length; i++) o[i] = (pcm.l[i] + pcm.r[i]) / 2; return o;
}

/**
 * Mezcla (izquierda y derecha, a LOUD_RATE) de todo lo que SUENA en el timeline: videos de la línea principal, capas con sonido y pistas de audio, con su volumen y silencio.
 * getPcm(asset_id) → { l, r } (de pcmFromChannels) | null (si no se puede leer; se cuenta en `missing`).
 */
export function buildMix(project, getPcm, rate = LOUD_RATE) {
  const kind = new Map((project.assets || []).map((a) => [a.id, a.kind]));
  const all = [...project.clips.filter((c) => kind.get(c.asset_id) !== 'image').map((c) => ({ c, g: gainOf(c) })),
    ...(project.overlayClips || []).filter((c) => kind.get(c.asset_id) !== 'image').map((c) => ({ c, g: gainOf(c) })),
    ...(project.audioClips || []).map((c) => ({ c, g: gainOf(c) }))].filter((x) => x.g > 0);
  const vEnd = [...project.clips, ...(project.overlayClips || [])].reduce((m, c) => Math.max(m, c.start + clipLength(c)), 0);      // el audio que pasa del final del video se corta al exportar: no cuenta
  const aEnd = all.reduce((m, x) => Math.max(m, x.c.start + clipLength(x.c)), 0), end = vEnd > 0 ? Math.min(aEnd, vEnd) : aEnd, size = Math.ceil(end * rate) + 1, L = new Float32Array(size), R = new Float32Array(size), missing = [];
  for (const { c, g } of all) {
    const pcm = getPcm(c.asset_id); if (!pcm || !pcm.l) { if (!missing.includes(c.asset_id)) missing.push(c.asset_id); continue; }
    const sp = speedOf(c), i0 = Math.floor(c.in * rate), len = Math.min(Math.floor(clipLength(c) * rate), Math.floor((end - c.start) * rate), Math.floor((pcm.l.length - i0) / sp)), o0 = Math.floor(c.start * rate), r = pcm.r || pcm.l;
    for (let i = 0; i < len; i++) { const o = o0 + i, k = i0 + Math.floor(i * sp); if (o < size) { L[o] += pcm.l[k] * g; R[o] += r[k] * g; } }      // con velocidad ≠ 1 se lee el medio más rápido o más lento (el volumen medido casi no cambia)
  }
  return { channels: [L, R], rate, seconds: end, missing, sources: all.length };
}
const gainOf = (c) => (c.muted ? 0 : Math.max(0, Math.min(2, typeof c.volume === 'number' && Number.isFinite(c.volume) ? c.volume : 1)));

/**
 * Qué ganancia fija aplicar. Nunca sube tanto que el pico pase de `ceilingDb` (sin limitador que «aplaste»): si no alcanza el objetivo, lo dice.
 * → { ok, before (LUFS), peakDb, gainDb, after (LUFS estimado), reached, limitedByPeak, note }
 */
export function planLoudness(measure, targetLufs, { ceilingDb = LOUD_CEILING_DB } = {}) {
  const { lufs, peak } = measure;
  if (!Number.isFinite(targetLufs)) return { ok: false, note: 'sin objetivo' };
  if (!Number.isFinite(lufs) || peak <= 1e-6) return { ok: false, note: 'No hay sonido que medir.' };
  const peakDb = 20 * Math.log10(peak); let gain = Math.max(LOUD_MIN_GAIN_DB, Math.min(LOUD_MAX_GAIN_DB, targetLufs - lufs)), limited = false;
  if (peakDb + gain > ceilingDb) { gain = ceilingDb - peakDb; limited = true; }
  gain = Math.max(LOUD_MIN_GAIN_DB, Math.min(LOUD_MAX_GAIN_DB, gain));
  const after = lufs + gain, reached = Math.abs(after - targetLufs) <= 0.5;
  return { ok: true, before: loudR(lufs), peakDb: loudR(peakDb), gainDb: loudR(gain), after: loudR(after), reached, limitedByPeak: limited && !reached,
    note: Math.abs(gain) < 0.3 ? 'El volumen ya está cerca del objetivo.' : (limited && !reached ? 'No se pudo subir más sin que el sonido se rompa.' : '') };
}
