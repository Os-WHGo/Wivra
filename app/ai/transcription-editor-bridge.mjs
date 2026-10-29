// Connects the local ASR pipeline to the editor's existing subtitle import operations.
// This module is pure: it proposes operations and never mutates a project.
import { transcribeToSubtitles } from './local-transcription-pipeline.mjs';
import { parseSubtitles, cuesToOps } from '../subtitles.mjs';

const fail = (code, message) => ({ ok: false, code, message });

export async function proposeTranscribedTextEdits({
  runWhisper, audio, duration, language = 'auto', signal,
  timelineDuration, offset = 0, maxChars = 120
} = {}) {
  if (!Number.isFinite(timelineDuration) || timelineDuration <= 0) {
    return fail('INVALID_TIMELINE', 'El proyecto necesita una duración válida.');
  }
  if (!Number.isFinite(offset)) return fail('INVALID_OFFSET', 'Desfase de subtítulos inválido.');
  if (!Number.isInteger(maxChars) || maxChars < 1 || maxChars > 120) {
    return fail('INVALID_TEXT_LIMIT', 'Límite de texto inválido.');
  }
  const result = await transcribeToSubtitles({ runWhisper, audio, duration, language, signal, format: 'srt' });
  if (!result.ok) return result;
  if (!result.transcript.segments.length) {
    return fail('EMPTY_TRANSCRIPT', 'No se detectó voz para generar subtítulos.');
  }
  const parsed = parseSubtitles(result.subtitles.content, { maxChars });
  if (!parsed.ok) return fail('SUBTITLE_PARSE_FAILED', parsed.errors.join(' '));
  const { ops, late } = cuesToOps(parsed.cues, timelineDuration, offset);
  if (!ops.length) return fail('NO_VISIBLE_CUES', 'No hay subtítulos dentro del proyecto.');
  return {
    ok: true, ops, late, warnings: parsed.warnings,
    transcript: result.transcript, subtitles: result.subtitles,
    // The UI must pass ops through the existing preview/approve workflow.
    requiresApproval: true
  };
}
