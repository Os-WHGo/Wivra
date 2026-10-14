// Wivra · lector del manifiesto de captura (.wivra.json).
// - v1 = lo que escribe hoy el PR #48 (WivraCaptureManifest.swift): un video y, como mucho, un audio.
// - v2 = PROPUESTA (Meta AI, FINDING-AUDIO-DJI-MULTITRACK): arreglo `tracks` con `role`. No lo escribe nadie todavía.
// Siempre devuelve la forma v2 normalizada, para que el editor tenga un solo camino. Solo valida y normaliza:
// no abre archivos ni toca el timeline. — Claude

export const ROLES = Object.freeze(['voice-host', 'voice-guest', 'music', 'ambient', 'scratch', 'other']);
const SAFE_NAME = /^[^/\\\0]+$/;            // solo nombre de archivo, sin carpetas
const isName = (s) => typeof s === 'string' && s.length > 0 && s.length <= 255 && SAFE_NAME.test(s) && s !== '.' && s !== '..';
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

export function parseManifest(input) {
  const errors = [];
  let m = input;
  if (typeof input === 'string') { try { m = JSON.parse(input); } catch { return { ok: false, errors: ['El manifiesto no es JSON válido.'] }; } }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false, errors: ['El manifiesto debe ser un objeto.'] };
  const v = m.schemaVersion;
  if (v !== 1 && v !== 2) return { ok: false, errors: [`schemaVersion ${JSON.stringify(v)} no soportada (solo 1 y 2).`] };
  if (typeof m.captureID !== 'string' || !m.captureID) errors.push('Falta captureID.');
  if (!isName(m.originalVideoFile)) errors.push('originalVideoFile debe ser un nombre de archivo simple.');
  if (m.muxedVideoFile != null && !isName(m.muxedVideoFile)) errors.push('muxedVideoFile debe ser un nombre de archivo simple.');

  let tracks;
  if (v === 1) {
    tracks = [];
    if (m.originalAudioFile != null) {
      if (!isName(m.originalAudioFile)) errors.push('originalAudioFile debe ser un nombre de archivo simple.');
      const off = m.audioStartOffsetSeconds;
      if (off != null && !isNum(off)) errors.push('audioStartOffsetSeconds debe ser un número.');
      tracks.push({ id: 't1', role: 'scratch', file: m.originalAudioFile, source: String(m.audioSource || 'unknown'), offsetSeconds: isNum(off) ? off : 0, offsetEstimated: true });
    }
  } else {
    if (!Array.isArray(m.tracks)) errors.push('v2 requiere el arreglo tracks.');
    tracks = [];
    const seen = new Set();
    (Array.isArray(m.tracks) ? m.tracks : []).forEach((t, i) => {
      const w = `tracks[${i}]`;
      if (!t || typeof t !== 'object') { errors.push(`${w} no es un objeto.`); return; }
      if (typeof t.id !== 'string' || !t.id) errors.push(`${w}.id falta.`); else if (seen.has(t.id)) errors.push(`${w}.id repetido: ${t.id}.`); else seen.add(t.id);
      if (!ROLES.includes(t.role)) errors.push(`${w}.role inválido (${JSON.stringify(t.role)}).`);
      if (!isName(t.file)) errors.push(`${w}.file debe ser un nombre de archivo simple.`);
      if (t.sampleRate != null && !(isNum(t.sampleRate) && t.sampleRate >= 8000 && t.sampleRate <= 192000)) errors.push(`${w}.sampleRate fuera de rango.`);
      if (t.channels != null && !(Number.isInteger(t.channels) && t.channels >= 1 && t.channels <= 8)) errors.push(`${w}.channels fuera de rango.`);
      if (t.offsetSeconds != null && !isNum(t.offsetSeconds)) errors.push(`${w}.offsetSeconds debe ser un número.`);
      tracks.push({ id: t.id, role: t.role, file: t.file, source: String(t.source || 'unknown'), sampleRate: t.sampleRate ?? null, channels: t.channels ?? null,
        offsetSeconds: isNum(t.offsetSeconds) ? t.offsetSeconds : 0, offsetEstimated: t.offsetEstimated !== false });
    });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], manifest: { schemaVersion: 2, sourceVersion: v, captureID: m.captureID, cameraSource: String(m.cameraSource || 'unknown'),
    videoFile: m.originalVideoFile, muxedVideoFile: m.muxedVideoFile ?? null, createdAt: m.createdAtISO8601 ?? null, tracks } };
}
