// Velocidad de un clip (cámara lenta / rápida). Solo lógica pura, sin DOM. — Claude
// `in`/`out` siguen siendo segundos del medio original; la velocidad solo cambia cuánto dura el clip en la línea de tiempo: (out − in) / velocidad.
// Al cambiarla en el video PRINCIPAL, lo que viene después se corre (como al recortar), y el audio que iba con ese video cambia igual.
import { clipLength, speedOf, totalDuration, SPEED_MIN, SPEED_MAX } from '../core/project.mjs';
import { applyBatch } from '../core/operations.mjs';

export const SPEED_CHOICES = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];
export const SPEED_SAFE_MIN = 0.5, SPEED_SAFE_MAX = 2;      // fuera de este rango el navegador puede dejar el sonido raro o mudo (en iPhone: sin verificar)
const spR = (x) => Math.round(x * 1000) / 1000, spR2 = (x) => Math.round(x * 100) / 100;

export const speedLabel = (v) => `${spR2(v)}×`;

/**
 * planSpeed(project, clipId, speed) → { ok, ops, before, after, linked, warnings } | { ok:false, error }
 * before/after = duración del clip en la línea de tiempo (s). Las operaciones son normales del editor (se deshacen de una vez).
 */
export function planSpeed(project, clipId, speed) {
  if (!project) return { ok: false, error: 'No hay proyecto.' };
  if (!Number.isFinite(speed) || speed < SPEED_MIN || speed > SPEED_MAX) return { ok: false, error: `La velocidad va de ${SPEED_MIN}× a ${SPEED_MAX}×.` };
  const kind = new Map((project.assets || []).map((a) => [a.id, a.kind]));
  const groups = { main: project.clips || [], overlay: project.overlayClips || [], audio: project.audioClips || [] };
  let group = null, c = null;
  for (const g of ['main', 'overlay', 'audio']) { const f = groups[g].find((k) => k.id === clipId); if (f) { group = g; c = f; break; } }
  if (!c) return { ok: false, error: 'Elige primero un video, una capa o un audio en la línea de tiempo.' };
  if (kind.get(c.asset_id) === 'image') return { ok: false, error: 'Las fotos no tienen velocidad: cambia cuánto duran.' };
  const warnings = [], ops = [], before = clipLength(c), s0 = speedOf(c), target = spR(speed), s1 = target;
  const after = spR2((c.out - c.in) / s1), oldEnd = c.start + before, delta = (c.out - c.in) / s1 - before;
  if (Math.abs(s1 - s0) < 0.0005) return { ok: true, ops: [], before: spR2(before), after: spR2(before), linked: 0, warnings: ['Ese clip ya tiene esa velocidad.'] };
  ops.push({ op: 'set_clip_speed', clip_id: c.id, speed: s1 });
  let linked = 0;
  if (group === 'main') {
    const ratio = s1 / s0, clipEnd = oldEnd, shiftable = (start) => start >= clipEnd - 0.01;
    // Audio que «va con» este video (≥80 % de su duración dentro de él): cambia de velocidad igual y conserva su sitio relativo.
    const mine = new Set();
    for (const a of groups.audio) {
      const alen = clipLength(a), ov = Math.min(a.start + alen, clipEnd) - Math.max(a.start, c.start);
      if (alen <= 0 || ov < 0.8 * alen) continue;
      const na = spR(speedOf(a) * ratio);
      if (na < SPEED_MIN || na > SPEED_MAX) { warnings.push('Un audio que iba con este video se pasaría del límite de velocidad y se quedó como estaba.'); continue; }
      mine.add(a.id); linked++;
      ops.push({ op: 'set_clip_speed', clip_id: a.id, speed: na }, { op: 'move_clip', clip_id: a.id, start: spR2(Math.max(0, c.start + (a.start - c.start) / ratio)) });
    }
    if (Math.abs(delta) > 0.004) {
      for (const k of groups.main) if (k.id !== c.id && shiftable(k.start)) ops.push({ op: 'move_clip', clip_id: k.id, start: spR2(Math.max(0, k.start + delta)) });
      for (const a of groups.audio) if (!mine.has(a.id) && shiftable(a.start)) ops.push({ op: 'move_clip', clip_id: a.id, start: spR2(Math.max(0, a.start + delta)) });
      for (const o of groups.overlay) if (shiftable(o.start)) ops.push({ op: 'move_clip', clip_id: o.id, start: spR2(Math.max(0, o.start + delta)) });
      for (const t of project.texts || []) if (shiftable(t.start)) ops.push({ op: 'set_text', text_id: t.id, start: spR2(Math.max(0, t.start + delta)), duration: spR2(t.end - t.start) });
      const inside = [...groups.overlay, ...groups.audio.filter((a) => !mine.has(a.id))].filter((k) => k.start > c.start + 0.01 && k.start < clipEnd - 0.01).length
        + (project.texts || []).filter((t) => t.start > c.start + 0.01 && t.start < clipEnd - 0.01).length;
      if (inside) warnings.push('Las capas, audios y textos que empiezan dentro de este clip no se movieron: revisa su tiempo.');
    }
    if (linked) warnings.push('El audio que iba con este video cambió de velocidad igual.');
  }
  return { ok: true, ops, before: spR2(before), after, linked, warnings };
}

/**
 * planSpeedAll(project, speed) → { ok, ops, before, after, count, skipped, warnings } | { ok:false, error }
 * La misma velocidad para TODOS los videos de la línea principal (las fotos no tienen velocidad y se saltan). Se planea de a un clip sobre una copia del proyecto,
 * para que cada clip corra lo que sigue con su duración ya cambiada. Un solo paso en «deshacer».
 */
export function planSpeedAll(project, speed) {
  if (!project) return { ok: false, error: 'No hay proyecto.' };
  const kind = new Map((project.assets || []).map((a) => [a.id, a.kind]));
  const vids = [...(project.clips || [])].sort((a, b) => a.start - b.start).filter((c) => kind.get(c.asset_id) !== 'image');
  if (!vids.length) return { ok: false, error: 'No hay videos en la línea principal.' };
  let cur = project; const ops = [], warnings = new Set(); let count = 0;
  for (const c of vids) {
    const pl = planSpeed(cur, c.id, speed); if (!pl.ok) return pl;
    if (!pl.ops.length) continue;
    const r = applyBatch(cur, pl.ops); if (!r.ok) return { ok: false, error: r.message || 'No se pudo cambiar la velocidad.' };
    cur = r.project; ops.push(...pl.ops); count++; pl.warnings.forEach((w) => warnings.add(w));
  }
  const skipped = (project.clips || []).length - vids.length;
  return { ok: true, ops, before: spR2(totalDuration(project)), after: spR2(totalDuration(cur)), count, skipped, warnings: [...warnings] };
}
