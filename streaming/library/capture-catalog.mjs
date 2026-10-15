// Wivra B1L: metadata-only capture catalog. No uploads, file reads, or media copying.
// Each batch lists the *actual files* supplied with one v2 capture manifest.
// Grouping is chronological, not an inferred event, location or shooting plan.
const safeName = s => typeof s === 'string' && s.length > 0 && s.length <= 255 &&
  s !== '.' && s !== '..' && !/[\/\\\0\r\n]/.test(s);
const isRecord = x => !!x && typeof x === 'object' && !Array.isArray(x);

function dayKey(date, dateFormatter) {
  const parts = Object.fromEntries(dateFormatter.formatToParts(date).map(p => [p.type, p.value]));
  return [parts.year, parts.month, parts.day].join('-');
}

function parseBatch(batch, formatter) {
  if (!isRecord(batch) || !isRecord(batch.manifest)) throw new Error('Se requiere un manifiesto por captura.');
  const m = batch.manifest;
  if (m.schemaVersion !== 2) throw new Error('Solo se admite manifiesto v2 normalizado.');
  if (typeof m.captureID !== 'string' || !m.captureID.trim() || m.captureID.length > 128) throw new Error('captureID inválido.');
  if (typeof m.cameraSource !== 'string' || !m.cameraSource) throw new Error('cameraSource inválido.');
  // Require an offset or UTC marker: a clock without zone cannot safely determine its day.
  if (typeof m.createdAtISO8601 !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(m.createdAtISO8601)) {
    throw new Error('createdAtISO8601 debe incluir zona horaria.');
  }
  const at = new Date(m.createdAtISO8601);
  if (Number.isNaN(at.getTime())) throw new Error('createdAtISO8601 inválida.');
  if (!safeName(m.originalVideoFile)) throw new Error('Video original inválido.');
  if (m.muxedVideoFile != null && !safeName(m.muxedVideoFile)) throw new Error('Video combinado inválido.');
  if (!Array.isArray(m.tracks) || !Array.isArray(m.muxedFromTrackIDs)) throw new Error('Arreglos de pistas requeridos.');
  const ids = new Set(), names = new Set([m.originalVideoFile]);
  if (m.muxedVideoFile) names.add(m.muxedVideoFile);
  for (const t of m.tracks) {
    if (!isRecord(t) || t.kind !== 'audio' || typeof t.id !== 'string' || !t.id || ids.has(t.id) || !safeName(t.file)) throw new Error('Pista de audio inválida o duplicada.');
    if (t.channelIndex != null && (!Number.isInteger(t.channelIndex) || t.channelIndex < 0)) throw new Error('Índice de canal inválido.');
    ids.add(t.id); names.add(t.file);
  }
  const muxIDs = new Set(m.muxedFromTrackIDs);
  if (muxIDs.size !== m.muxedFromTrackIDs.length || (muxIDs.size && !m.muxedVideoFile) ||
      [...muxIDs].some(id => !ids.has(id))) throw new Error('Referencias del MOV combinado inválidas.');
  if (!Array.isArray(batch.files) || batch.files.some(f => !safeName(f))) throw new Error('Se requiere una lista de nombres de archivos seguros.');
  const files = new Set(batch.files);
  const availableVideo = files.has(m.originalVideoFile) ? m.originalVideoFile :
    (m.muxedVideoFile && files.has(m.muxedVideoFile) ? m.muxedVideoFile : null);
  const missing = [...names].filter(n => !files.has(n));
  return {
    captureID: m.captureID,
    cameraSource: m.cameraSource,
    recordedAt: at.toISOString(),
    day: dayKey(at, formatter),
    originalVideo: m.originalVideoFile,
    muxedVideo: m.muxedVideoFile ?? null,
    availableVideo,
    missing,
    sidecarAudioFiles: [...new Set(m.tracks.map(t => t.file))],
    declaredAudioTracks: m.tracks.length,
    embeddedMuxedTrackIDs: availableVideo === m.muxedVideoFile ? [...muxIDs] : [],
    // No declaration about audio embedded inside the original MOV is inferred.
    embeddedAudioInOriginal: 'unknown',
    readyToInspect: availableVideo !== null,
    requiresAttention: missing.length > 0
  };
}

// Returns metadata only. No attempt to extract individual channels, inspect
// actual MOV audio streams, automatically identify people, or create editor clips.
export function indexCaptureBatches(batches, { timeZone = 'UTC' } = {}) {
  if (!Array.isArray(batches)) throw new TypeError('captures debe ser una lista.');
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const captures = [], rejected = [], ids = new Set();
  batches.forEach((batch, inputIndex) => {
    try {
      const capture = parseBatch(batch, fmt);
      if (ids.has(capture.captureID)) throw new Error('captureID duplicado.');
      ids.add(capture.captureID);
      captures.push(capture);
    } catch (e) {
      rejected.push({ inputIndex, reason: String(e.message || e) });
    }
  });
  captures.sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) ||
    a.captureID.localeCompare(b.captureID));
  const byDay = new Map();
  for (const capture of captures) {
    if (!byDay.has(capture.day)) byDay.set(capture.day, []);
    byDay.get(capture.day).push(capture);
  }
  const days = [...byDay].sort(([a], [b]) => a.localeCompare(b))
    .map(([date, entries], i) => ({ date, dayNumber: i + 1, captureIDs: entries.map(c => c.captureID), count: entries.length }));
  return { schema: 'wivra-capture-catalog-v1', timeZone, days, captures, rejected };
}
