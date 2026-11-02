// Puente ASR → subtítulos → operaciones del editor. Sin modificar el motor existente.
import { transcriptToCues } from './transcript-contract.mjs';
import { splitText, cuesToOps } from '../subtitles.mjs';
import { MAX_TEXT } from '../../core/operations.mjs';

export function transcriptToEditorOps(transcript, totalSeconds, { offset = 0 } = {}) {
  if (typeof totalSeconds !== 'number' || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return { ok: false, code: 'INVALID_DURATION', message: 'Duración de video inválida.' };
  }
  if (typeof offset !== 'number' || !Number.isFinite(offset)) {
    return { ok: false, code: 'INVALID_OFFSET', message: 'Desfase inválido.' };
  }
  const parsed = transcriptToCues(transcript);
  if (!parsed.ok) return parsed;
  const cues = [];
  for (const cue of parsed.cues) {
    // Mantener el contrato del editor: máximo 120 unidades UTF-16 por texto.
    // No recortar grafemas: la segmentación Unicode completa se resolverá en su propio bloque.
    const parts = splitText(cue.text, MAX_TEXT);
    if (!parts.length) continue;
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    let cursor = cue.start;
    parts.forEach((text, i) => {
      const end = i === parts.length - 1 ? cue.end : cursor + (cue.end - cue.start) * text.length / total;
      cues.push({ start: cursor, end, text });
      cursor = end;
    });
  }
  const { ops, late } = cuesToOps(cues, totalSeconds, offset);
  return { ok: true, ops, late, cues: cues.length };
}
