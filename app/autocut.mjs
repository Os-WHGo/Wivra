// AutoCut (v1, determinista y local): al acortar un clip, elige el tramo donde MÁS se oye (voz/actividad) en vez de quedarse con el centro. Solo lógica pura. — Claude
// Usa la curva de volumen de app/silence.mjs: NO entiende palabras ni imágenes. Si el volumen es parejo (música o ruido continuo) no hay evidencia y se usa el centro.
// Evita empezar o terminar en medio de una frase: un tramo que arranca o acaba con sonido fuerte pierde puntos.
import { SIL_MIN_DYNAMIC_DB } from './silence.mjs';
import { bestTimedWindow } from './autocut-evidence.mjs';

export const AC_STEP = 0.1, AC_EDGE_PENALTY = 0.2, AC_MIN_GAIN = 0.05;      // paso de búsqueda (s), castigo por cortar en sonido fuerte, mejora mínima sobre el centro para cambiar de tramo
const acPct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];

/**
 * bestWindow(env, win, from, to, d) → { start, score, centerScore } | null
 * Mejor ventana de `d` segundos dentro de [from, to] (tiempo del medio). null si no hay evidencia (volumen parejo, clip muy corto o ya cabe).
 */
export function bestWindow(env, win, from, to, d) {
  if (!env || !env.length || !(win > 0) || !(d > 0) || to - from <= d + 1e-6) return null;
  const a = Math.max(0, Math.floor(from / win)), b = Math.min(env.length, Math.ceil(to / win)); if (b - a < 5) return null;
  const sorted = Array.from(env.subarray ? env.subarray(a, b) : env.slice(a, b)).sort((x, y) => x - y), floor = acPct(sorted, 0.1), peak = acPct(sorted, 0.95);
  if (peak - floor < SIL_MIN_DYNAMIC_DB) return null;
  const th = Math.max(-60, Math.min(-25, floor + 0.35 * (peak - floor))), pre = new Float64Array(env.length + 1);
  for (let i = 0; i < env.length; i++) pre[i + 1] = pre[i] + (env[i] >= th ? 1 : 0);
  const frac = (s, e) => { const i = Math.max(0, Math.floor(s / win)), j = Math.min(env.length, Math.max(i + 1, Math.ceil(e / win))); return (pre[j] - pre[i]) / (j - i); };
  const loud = (t) => (env[Math.min(env.length - 1, Math.max(0, Math.floor(t / win)))] >= th ? 1 : 0);
  const score = (s) => frac(s, s + d) - AC_EDGE_PENALTY * (loud(s) + loud(s + d - win));
  const center = from + (to - from - d) / 2, centerScore = score(center); let best = center, bs = centerScore;
  const last = to - d;
  for (let s = from; s <= last + 1e-9; s += AC_STEP) {
    const t = Math.min(s, last), sc = score(t);
    if (sc > bs + 1e-9 || (Math.abs(sc - bs) <= 1e-9 && Math.abs(t - center) < Math.abs(best - center))) { best = t; bs = sc; }
  }
  if (bs - centerScore < AC_MIN_GAIN) return { start: center, score: centerScore, centerScore, moved: false };      // no mejora lo bastante: se queda el centro
  return { start: Math.round(best * 100) / 100, score: bs, centerScore, moved: true };
}

/** makeAutoPicker(envOf) → pick(clip, d): inicio (en el medio) del mejor tramo de `d` s del clip, o null si no hay evidencia. `envOf(asset_id)` → { env, win } | null. */
export function makeAutoPicker(envOf) {
  return (c, d) => { const e = envOf(c.asset_id); if (!e) return null; const spoken = e.timedSpeech ? bestTimedWindow(e.timedSpeech, c.in, c.out, d) : null; if (spoken) return spoken.moved ? spoken.start : null; const r = bestWindow(e.env, e.win, c.in, c.out, d); return r && r.moved ? r.start : null; };
}
