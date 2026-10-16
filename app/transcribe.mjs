// Subtítulos automáticos: qué audio transcribir, cómo pasar los tiempos del medio a la línea de tiempo y cómo quedan como textos. Lógica pura (sin DOM ni motor). — Claude
import { clipLength, speedOf } from '../core/project.mjs';
import { segmentsToCues } from './whisper-engine.mjs';

const trR = (x) => Math.round(x * 1000) / 1000;

/**
 * transcriptionJobs(project) → [{ clipId, assetId, group, from, to, start, speed }]: los tramos de audio con voz del proyecto.
 *  - Videos de la línea principal con sonido (no silenciados), salvo los que ya tienen una pista de voz aparte (voice_primary / voice_guest) que los cubre ≥ 80 %.
 *  - Pistas de audio con papel de voz (voice_primary, voice_guest) no silenciadas. La música y los ambientes no se transcriben.
 * from/to = segundos del MEDIO; start = segundo de la línea de tiempo donde empieza el tramo.
 */
export function transcriptionJobs(project) {
  const kind = new Map((project.assets || []).map((a) => [a.id, a.kind]));
  const voices = (project.audioClips || []).filter((a) => !a.muted && (a.role === 'voice_primary' || a.role === 'voice_guest'));
  const covered = (c) => voices.some((a) => { const alen = clipLength(a), clen = clipLength(c); return Math.min(a.start + alen, c.start + clen) - Math.max(a.start, c.start) >= 0.8 * clen; });
  const jobs = [];
  for (const c of [...project.clips].sort((a, b) => a.start - b.start)) {
    if (kind.get(c.asset_id) === 'image' || c.muted || covered(c)) continue;
    jobs.push({ clipId: c.id, assetId: c.asset_id, group: 'main', from: c.in, to: c.out, start: c.start, speed: speedOf(c) });
  }
  for (const a of voices) if (kind.get(a.asset_id) !== 'image') jobs.push({ clipId: a.id, assetId: a.asset_id, group: 'audio', from: a.in, to: a.out, start: a.start, speed: speedOf(a) });
  return jobs;
}

/** Recorta la ventana [from, to] (s) de un audio mono a `rate` Hz (copia: el original no se transfiere). */
export function windowAudio(samples, rate, from, to) {
  const a = Math.max(0, Math.floor(from * rate)), b = Math.min(samples.length, Math.ceil(to * rate));
  return b > a ? Float32Array.from(samples.subarray(a, b)) : new Float32Array(0);
}

/** Segmentos del motor (ms desde el inicio de la ventana) → cues en tiempo de la línea de tiempo, recortados al clip. */
export function jobCues(job, segments, opts) {
  const len = (job.to - job.from) / job.speed, end = job.start + len, out = [];
  for (const c of segmentsToCues(segments, opts)) {
    const s = job.start + c.start / job.speed, e = Math.min(end, job.start + c.end / job.speed);
    if (e - s >= 0.2 && s < end) out.push({ start: trR(Math.max(job.start, s)), end: trR(e), text: c.text });
  }
  return out;
}

/** Cues de todos los tramos, en orden y sin solapes → { cues, ops } con ops = add_text (los que empiezan después del final del video se descartan). */
export function planSubtitles(project, cues, totalSeconds) {
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length - 1; i++) if (sorted[i].end > sorted[i + 1].start) sorted[i] = { ...sorted[i], end: Math.max(sorted[i].start + 0.05, sorted[i + 1].start) };
  const ops = []; let late = 0;
  for (const c of sorted) {
    const dur = trR(c.end - c.start);
    if (!(totalSeconds > 0) || c.start >= totalSeconds - 0.001 || dur <= 0) { late++; continue; }
    ops.push({ op: 'add_text', text: c.text.slice(0, 120), start: c.start, duration: dur });
  }
  return { cues: sorted, ops, late };
}
