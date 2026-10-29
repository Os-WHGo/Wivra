// Offline-first orchestration boundary for a future native whisper.cpp runner.
// Dependency injection keeps the UI independent of model installation and native APIs.
import { fromWhisperJson } from './whisper-adapter.mjs';
import { exportSubtitles } from './subtitle-export.mjs';

const fail = (code, message) => ({ ok: false, code, message });

export async function transcribeToSubtitles({
  runWhisper, audio, duration, format = 'srt', language = 'auto', signal
} = {}) {
  if (typeof runWhisper !== 'function') return fail('ENGINE_UNAVAILABLE', 'Motor local Whisper no instalado.');
  if (audio == null) return fail('AUDIO_REQUIRED', 'Se requiere audio para transcribir.');
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration <= 0) {
    return fail('INVALID_DURATION', 'Duración de audio inválida.');
  }
  if (!['srt', 'vtt'].includes(format)) return fail('INVALID_FORMAT', 'Formato no compatible.');
  if (signal?.aborted) return fail('CANCELLED', 'Transcripción cancelada.');
  let raw;
  try {
    raw = await runWhisper({ audio, language, signal });
  } catch (cause) {
    return signal?.aborted || cause?.name === 'AbortError'
      ? fail('CANCELLED', 'Transcripción cancelada.')
      : fail('ENGINE_ERROR', 'Error del motor local de transcripción.');
  }
  if (signal?.aborted) return fail('CANCELLED', 'Transcripción cancelada.');
  const normalized = fromWhisperJson(raw, { duration });
  if (!normalized.ok) return normalized;
  const subtitles = exportSubtitles(normalized.value, { format, duration });
  if (!subtitles.ok) return subtitles;
  return { ok: true, transcript: normalized.value, subtitles };
}
