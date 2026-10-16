// Subtítulos SRT / WebVTT ↔ textos en pantalla del editor. Solo lógica pura (sin DOM): leer, escribir y partir cues largos. — Claude
// Un subtítulo es un texto con tiempo ({ text, start, end }); el editor ya los dibuja en la vista previa y en la exportación.
// El tope de caracteres por texto (MAX_TEXT = 120 en core/operations.mjs) se respeta partiendo el cue en trozos con el tiempo repartido por longitud.

const SUB_ENT = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ', '&lrm;': '', '&rlm;': '' };
const SUB_TS = '(?:\\d{1,3}:)?\\d{1,2}:\\d{2}[.,]\\d{1,3}';
const SUB_TIMING = new RegExp(`^\\s*(${SUB_TS})\\s*-->\\s*(${SUB_TS})(?:\\s+(.*))?$`);
export const SUB_MAX_BYTES = 2 * 1024 * 1024;     // un archivo de subtítulos real pesa KB; más de 2 MB no es un SRT/VTT

/** "01:02:03,500" | "02:03.500" → segundos. null si no es una hora válida. */
export function parseTimestamp(s) {
  const m = /^(?:(\d{1,3}):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/.exec(String(s).trim()); if (!m) return null;
  const h = m[1] === undefined ? 0 : Number(m[1]), mi = Number(m[2]), se = Number(m[3]), ms = Number(m[4].padEnd(3, '0'));
  if (mi > 59 || se > 59) return null;
  return h * 3600 + mi * 60 + se + ms / 1000;
}
/** Segundos → "HH:MM:SS,mmm" (SRT) o "HH:MM:SS.mmm" (VTT). */
export function formatTimestamp(sec, sep = ',') {
  const t = Math.max(0, Math.round((Number.isFinite(sec) ? sec : 0) * 1000)), h = Math.floor(t / 3600000), m = Math.floor((t % 3600000) / 60000), s = Math.floor((t % 60000) / 1000), ms = t % 1000;
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)}${sep}${p(ms, 3)}`;
}
const subCleanText = (lines) => lines.join(' ')
  .replace(/\{\\[^}]*\}/g, '')                                  // marcas de posición tipo {\an8}
  .replace(/<[^>]*>/g, '')                                       // <b>, <i>, <c.clase>, <00:00:01.000>, <v Nombre>
  .replace(/&(?:amp|lt|gt|quot|apos|nbsp|lrm|rlm|#39);/g, (e) => SUB_ENT[e])
  .replace(/\s+/g, ' ').trim();

/** Parte un texto en trozos de ≤ max caracteres, cortando en espacios (una palabra más larga que max se corta a la fuerza). */
export function splitText(text, max) {
  const out = []; let cur = '';
  for (let w of text.split(' ')) {
    while (w.length > max) { if (cur) { out.push(cur); cur = ''; } out.push(w.slice(0, max)); w = w.slice(max); }
    if (!cur) cur = w; else if (cur.length + 1 + w.length <= max) cur += ' ' + w; else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * Lee un archivo SRT o WebVTT.
 * → { ok:true, format:'srt'|'vtt', cues:[{start,end,text}], warnings:[…] } | { ok:false, errors:[…] }
 * Descarta (con aviso) los cues vacíos o con tiempos inválidos; parte los de más de `maxChars` caracteres.
 */
export function parseSubtitles(raw, { maxChars = 120 } = {}) {
  if (typeof raw !== 'string') return { ok: false, errors: ['El archivo no es texto.'] };
  if (raw.length > SUB_MAX_BYTES) return { ok: false, errors: ['El archivo es demasiado grande para ser unos subtítulos.'] };
  const src = raw.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const vtt = /^WEBVTT(?:[ \t\n]|$)/.test(src), warnings = [], cues = [];
  let dropped = 0, split = 0;
  for (const block of src.split(/\n{2,}/)) {
    const lines = block.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l, i, a) => !(l === '' && (i === 0 || i === a.length - 1)));
    if (!lines.length) continue;
    if (/^(WEBVTT|NOTE|STYLE|REGION)(\s|$)/.test(lines[0])) continue;      // cabecera y bloques que no son subtítulos
    const ti = lines.findIndex((l) => SUB_TIMING.test(l)); if (ti < 0 || ti > 1) { if (/\S/.test(block) && !/^\d+$/.test(block.trim())) dropped++; continue; }
    const m = SUB_TIMING.exec(lines[ti]), a = parseTimestamp(m[1]), b = parseTimestamp(m[2]), text = subCleanText(lines.slice(ti + 1));
    if (a === null || b === null || !(b > a) || !text) { dropped++; continue; }
    const parts = splitText(text, maxChars);
    if (parts.length === 1) cues.push({ start: a, end: b, text });
    else {      // el tiempo se reparte según el largo de cada trozo
      split++; const total = parts.reduce((n, p) => n + p.length, 0); let t = a;
      parts.forEach((p, i) => { const e = i === parts.length - 1 ? b : t + ((b - a) * p.length) / total; cues.push({ start: t, end: e, text: p }); t = e; });
    }
  }
  if (!cues.length) return { ok: false, errors: ['No encontré subtítulos en ese archivo (se esperaba un .srt o un .vtt).'] };
  if (dropped) warnings.push(`${dropped} subtítulo(s) con tiempos o texto inválidos no se importaron.`);
  if (split) warnings.push(`${split} subtítulo(s) eran muy largos y se partieron en trozos de hasta ${maxChars} caracteres.`);
  cues.sort((x, y) => x.start - y.start);
  return { ok: true, format: vtt ? 'vtt' : 'srt', cues, warnings, stats: { dropped, split } };
}

const subOneLine = (t) => String(t).replace(/\r?\n/g, ' ').replace(/-->/g, '–>').trim();
const subSorted = (texts) => [...texts].filter((t) => t && typeof t.text === 'string' && t.end > t.start).sort((a, b) => a.start - b.start || a.end - b.end);
/** Textos del proyecto → archivo SRT (UTF-8, numerado desde 1). */
export function toSRT(texts) {
  return subSorted(texts).map((t, i) => `${i + 1}\n${formatTimestamp(t.start, ',')} --> ${formatTimestamp(t.end, ',')}\n${subOneLine(t.text)}\n`).join('\n');
}
/** Textos del proyecto → archivo WebVTT. */
export function toVTT(texts) {
  return 'WEBVTT\n\n' + subSorted(texts).map((t) => `${formatTimestamp(t.start, '.')} --> ${formatTimestamp(t.end, '.')}\n${subOneLine(t.text)}\n`).join('\n');
}

/**
 * Cues → lote de operaciones add_text para el editor. Los que empiezan después del final del video no caben (add_text lo rechazaría y el lote entero fallaría):
 * se descartan y se cuentan. `offset` mueve todos los cues (p. ej. si el SRT empieza en otro punto).
 */
export function cuesToOps(cues, totalSeconds, offset = 0) {
  const ops = []; let late = 0;
  for (const c of cues) {
    const start = Math.max(0, Math.round((c.start + offset) * 1000) / 1000), dur = Math.round((c.end - c.start) * 1000) / 1000;
    if (!(totalSeconds > 0) || start >= totalSeconds - 0.001 || dur <= 0) { late++; continue; }
    ops.push({ op: 'add_text', text: c.text, start, duration: dur });
  }
  return { ops, late };
}
