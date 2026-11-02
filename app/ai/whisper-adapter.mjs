// Normalizes timestamped whisper.cpp JSON to Wivra's offline transcript contract.
// The native whisper.cpp runtime/model is not bundled by this adapter.
import { validateTranscript, TRANSCRIPT_SCHEMA_VERSION } from './transcript-contract.mjs';

export function fromWhisperJson(payload, { duration = Infinity, language = 'und' } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !Array.isArray(payload.transcription)) {
    return { ok: false, code: 'INVALID_WHISPER_RESULT', message: 'Respuesta de whisper.cpp inválida.' };
  }
  const segments = [];
  for (const item of payload.transcription) {
    if (!item || typeof item !== 'object' || !item.offsets || !Number.isFinite(item.offsets.from) || !Number.isFinite(item.offsets.to)) {
      return { ok: false, code: 'INVALID_WHISPER_OFFSETS', message: 'Segmento de Whisper sin tiempos válidos.' };
    }
    const text = typeof item.text === 'string' ? item.text : '';
    segments.push({ start: item.offsets.from / 1000, end: item.offsets.to / 1000, text });
  }
  const transcript = {
    version: TRANSCRIPT_SCHEMA_VERSION,
    engine: 'whisper.cpp',
    language: typeof payload.result?.language === 'string' ? payload.result.language : language,
    segments
  };
  return validateTranscript(transcript, { duration });
}
