// Línea de tiempo visual: lógica pura (sin DOM) para poder probarla. — Claude
import { applyBatch } from '../core/operations.mjs';

export const round2 = (n) => Math.round(n * 100) / 100;
export const sortedClips = (p) => [...p.clips].sort((a, b) => a.start - b.start);
export const clipEnd = (c) => c.start + (c.out - c.in);

// ¿Qué clip se ve en el instante t de la línea de tiempo? Devuelve el clip y el tiempo dentro del video original.
export function clipAt(p, t) {
  for (const c of sortedClips(p)) if (t >= c.start && t < clipEnd(c)) return { clip: c, assetTime: round2(c.in + (t - c.start)) };
  return null;
}

// Cierra huecos: cada clip empieza donde termina el anterior (el primero empieza en 0).
export function rippleOps(p) {
  const ops = []; let cursor = 0;
  for (const c of sortedClips(p)) {
    const start = round2(cursor);
    if (Math.abs(start - c.start) > 0.004) ops.push({ op: 'move_clip', clip_id: c.id, start });
    cursor = start + (c.out - c.in);
  }
  return ops;
}

// Edición manual: aplica las operaciones en una copia, y agrega las que cierran huecos. Un solo lote = un solo deshacer.
export function planEdit(project, ops, { ripple = true } = {}) {
  const r = applyBatch(project, ops);
  if (!r.ok) return { ok: false, ...r };
  return { ok: true, ops: ripple ? [...ops, ...rippleOps(r.project)] : ops };
}

export function splitAt(project, t, clipId) {
  const hit = clipId ? project.clips.find((c) => c.id === clipId) : clipAt(project, t)?.clip;
  if (!hit) return { ok: false, message: 'No hay clip en ese instante.' };
  if (t <= hit.start + 0.1 || t >= clipEnd(hit) - 0.1) return { ok: false, message: 'Mueve la línea blanca al interior del clip (no en el borde).' };
  return planEdit(project, [{ op: 'split_clip', clip_id: hit.id, at: round2(hit.in + (t - hit.start)) }], { ripple: false });
}

export const fmtTime = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
