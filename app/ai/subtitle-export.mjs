// Offline subtitle serialization from the validated Wivra ASR contract.
// No network calls, native model dependency or mutation of the source transcript.
import { transcriptToCues } from './transcript-contract.mjs';

const stamp = (seconds, separator) => {
  const millis = Math.round(seconds * 1000);
  const hours = Math.floor(millis / 3600000);
  const minutes = Math.floor((millis % 3600000) / 60000);
  const secs = Math.floor((millis % 60000) / 1000);
  const ms = millis % 1000;
  return [hours, minutes, secs].map(n => String(n).padStart(2, '0')).join(':') +
    separator + String(ms).padStart(3, '0');
};
const cleanText = text => text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');

export function exportSubtitles(transcript, { format = 'srt', duration = Infinity } = {}) {
  if (!['srt', 'vtt'].includes(format)) return { ok: false, code: 'INVALID_FORMAT', message: 'Formato de subtítulos no compatible.' };
  const result = transcriptToCues(transcript, { duration });
  if (!result.ok) return result;
  const separator = format === 'srt' ? ',' : '.';
  const blocks = result.cues.map(({ start, end, text }, index) => {
    const timing = stamp(start, separator) + ' --> ' + stamp(end, separator);
    return (format === 'srt' ? (index + 1) + '\n' : '') + timing + '\n' + cleanText(text);
  });
  return { ok: true, format, mimeType: format === 'srt' ? 'application/x-subrip' : 'text/vtt',
    content: (format === 'vtt' ? 'WEBVTT\n\n' : '') + blocks.join('\n\n') + (blocks.length ? '\n' : '') };
}
