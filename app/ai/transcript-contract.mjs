// Contrato de resultados ASR/VAD local-first. No depende de motores nativos ni de red.
// Los adaptadores Whisper, Sherpa y VAD deben entregar este formato antes de editar Wivra.
export const TRANSCRIPT_SCHEMA_VERSION = 1;
const finite = n => typeof n === 'number' && Number.isFinite(n);
const error = (code, message) => ({ ok: false, code, message });
export function validateTranscript(value, { duration = Infinity, maxSegments = 10000 } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return error('INVALID_RESULT', 'Resultado ASR inválido.');
  if (value.version !== TRANSCRIPT_SCHEMA_VERSION) return error('UNSUPPORTED_VERSION', 'Versión ASR no compatible.');
  if (!['whisper.cpp', 'sherpa-onnx', 'external', 'manual'].includes(value.engine)) return error('INVALID_ENGINE', 'Motor ASR no reconocido.');
  if (!Array.isArray(value.segments) || value.segments.length > maxSegments) return error('INVALID_SEGMENTS', 'Lista de segmentos inválida.');
  if (!(duration === Infinity || (finite(duration) && duration >= 0))) return error('INVALID_DURATION', 'Duración inválida.');
  const segments = [];
  let previousStart = -1;
  for (const [index, segment] of value.segments.entries()) {
    if (!segment || !finite(segment.start) || !finite(segment.end) || segment.start < 0 || segment.end <= segment.start || segment.end > duration) return error('INVALID_TIME', 'Tiempo inválido en segmento ' + index);
    if (segment.start < previousStart) return error('UNSORTED', 'Los segmentos deben estar ordenados por inicio.');
    if (typeof segment.text !== 'string' || !segment.text.trim() || segment.text.length > 10000) return error('INVALID_TEXT', 'Texto inválido en segmento ' + index);
    if (segment.confidence !== undefined && (!finite(segment.confidence) || segment.confidence < 0 || segment.confidence > 1)) return error('INVALID_CONFIDENCE', 'Confianza inválida.');
    segments.push({ start: segment.start, end: segment.end, text: segment.text.trim(), ...(segment.confidence === undefined ? {} : { confidence: segment.confidence }) });
    previousStart = segment.start;
  }
  return { ok: true, value: { version: TRANSCRIPT_SCHEMA_VERSION, engine: value.engine, language: typeof value.language === 'string' ? value.language.slice(0, 32) : 'und', segments } };
}
export function transcriptToCues(transcript, options = {}) {
  const result = validateTranscript(transcript, options);
  return result.ok ? { ok: true, cues: result.value.segments.map(({ start, end, text }) => ({ start, end, text })) } : result;
}
