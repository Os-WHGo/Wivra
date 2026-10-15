// Wivra · lector del manifiesto de captura (.wivra.json). Solo valida y normaliza: no abre archivos ni toca el timeline.
// Formato canónico provisional = el que escribe WivraCaptureManifest.swift (PR #50, ChatGPT); contrato en
// streaming/contracts/wivra-manifest-v2.schema.json (copia en app/tests/fixtures/). v1 = el del PR #48 (un video + a lo sumo un audio).
// Siempre devuelve una sola forma interna para que el editor tenga un solo camino. — Claude

export const ROLES = Object.freeze(['voice_primary', 'voice_guest', 'music', 'scratch', 'ambience', 'other']);
const isName = (s) => typeof s === 'string' && s.length > 0 && s.length <= 255 && !/[\/\\\0\r\n]/.test(s) && s !== '.' && s !== '..';
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const nul = (v) => v === undefined || v === null;

export function parseManifest(input) {
  const errors = [], warnings = [];
  let m = input;
  if (typeof input === 'string') { try { m = JSON.parse(input); } catch { return { ok: false, errors: ['El manifiesto no es JSON válido.'], warnings }; } }
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { ok: false, errors: ['El manifiesto debe ser un objeto.'], warnings };
  const v = m.schemaVersion;
  if (v !== 1 && v !== 2) return { ok: false, errors: [`schemaVersion ${JSON.stringify(v)} no soportada (solo 1 y 2).`], warnings };
  if (typeof m.captureID !== 'string' || !m.captureID) errors.push('Falta captureID.');
  if (!isName(m.originalVideoFile)) errors.push('originalVideoFile debe ser un nombre de archivo simple.');
  if (!nul(m.muxedVideoFile) && !isName(m.muxedVideoFile)) errors.push('muxedVideoFile debe ser un nombre de archivo simple.');
  if (typeof m.createdAtISO8601 !== 'string' || !m.createdAtISO8601) errors.push('Falta createdAtISO8601.');

  let tracks = [], muxedFrom = [];
  if (v === 1) {
    // v1: se sintetiza SOLO la pista que corresponde a originalAudioFile; el MOV combinado ya la contiene.
    if (!nul(m.originalAudioFile)) {
      if (!isName(m.originalAudioFile)) errors.push('originalAudioFile debe ser un nombre de archivo simple.');
      if (!nul(m.audioStartOffsetSeconds) && !isNum(m.audioStartOffsetSeconds)) errors.push('audioStartOffsetSeconds debe ser un número.');
      tracks.push({ id: 'audio-1', role: 'voice_primary', file: m.originalAudioFile, source: String(m.audioSource || 'unknown'), channelIndex: null, sampleRateHz: null, channelCount: null,
        inputName: m.selectedInputName ?? null, offsetSeconds: isNum(m.audioStartOffsetSeconds) ? m.audioStartOffsetSeconds : 0, offsetKnown: isNum(m.audioStartOffsetSeconds) });
      if (m.muxedVideoFile) muxedFrom = ['audio-1'];
    }
  } else {
    if (typeof m.audioSource !== 'string' || !m.audioSource) errors.push('Falta audioSource.');
    if (typeof m.cameraSource !== 'string' || !m.cameraSource) errors.push('Falta cameraSource.');
    if (!Array.isArray(m.tracks)) errors.push('v2 requiere el arreglo tracks.');
    if (!Array.isArray(m.muxedFromTrackIDs)) errors.push('v2 requiere el arreglo muxedFromTrackIDs.');
    const seen = new Set();
    (Array.isArray(m.tracks) ? m.tracks : []).forEach((t, i) => {
      const w = `tracks[${i}]`;
      if (!t || typeof t !== 'object') { errors.push(`${w} no es un objeto.`); return; }
      if (typeof t.id !== 'string' || !t.id) errors.push(`${w}.id falta.`); else if (seen.has(t.id)) errors.push(`${w}.id repetido: ${t.id}.`); else seen.add(t.id);
      if (t.kind !== 'audio') errors.push(`${w}.kind debe ser "audio".`);
      if (!ROLES.includes(t.role)) errors.push(`${w}.role inválido (${JSON.stringify(t.role)}).`);
      if (typeof t.source !== 'string' || !t.source) errors.push(`${w}.source falta.`);
      if (!isName(t.file)) errors.push(`${w}.file debe ser un nombre de archivo simple.`);
      if (!nul(t.channelIndex) && !(Number.isInteger(t.channelIndex) && t.channelIndex >= 0)) errors.push(`${w}.channelIndex inválido.`);
      if (!nul(t.sampleRateHz) && !(isNum(t.sampleRateHz) && t.sampleRateHz > 0)) errors.push(`${w}.sampleRateHz inválido.`);
      if (!nul(t.channelCount) && !(Number.isInteger(t.channelCount) && t.channelCount >= 1)) errors.push(`${w}.channelCount inválido.`);
      if (!nul(t.startOffsetSeconds) && !isNum(t.startOffsetSeconds)) errors.push(`${w}.startOffsetSeconds debe ser un número o null.`);
      if (isNum(t.channelIndex) && isNum(t.channelCount) && t.channelIndex >= t.channelCount) errors.push(`${w}.channelIndex (${t.channelIndex}) fuera de channelCount (${t.channelCount}).`);
      tracks.push({ id: t.id, role: t.role, file: t.file, source: t.source, channelIndex: t.channelIndex ?? null, sampleRateHz: t.sampleRateHz ?? null, channelCount: t.channelCount ?? null,
        inputName: t.inputName ?? null, offsetSeconds: isNum(t.startOffsetSeconds) ? t.startOffsetSeconds : 0, offsetKnown: isNum(t.startOffsetSeconds) });
    });
    muxedFrom = Array.isArray(m.muxedFromTrackIDs) ? m.muxedFromTrackIDs : [];
    const ids = new Set(tracks.map((t) => t.id));
    muxedFrom.forEach((id) => { if (typeof id !== 'string' || !ids.has(id)) errors.push(`muxedFromTrackIDs hace referencia a una pista que no existe: ${JSON.stringify(id)}.`); });
    if (new Set(muxedFrom).size !== muxedFrom.length) errors.push('muxedFromTrackIDs tiene ids repetidos.');
    if (muxedFrom.length && !m.muxedVideoFile) errors.push('muxedFromTrackIDs indica pistas mezcladas pero no hay muxedVideoFile.');
    // Mismo archivo en dos pistas solo tiene sentido con canales distintos.
    const byFile = new Map(); for (const t of tracks) { if (!byFile.has(t.file)) byFile.set(t.file, []); byFile.get(t.file).push(t); }
    for (const [f, ts] of byFile) if (ts.length > 1 && new Set(ts.map((t) => t.channelIndex)).size < ts.length) warnings.push(`Varias pistas usan ${f} sin canales distintos: el audio se duplicaría.`);
    const known = new Set(['schemaVersion', 'captureID', 'cameraSource', 'audioSource', 'selectedInputName', 'originalVideoFile', 'originalAudioFile', 'muxedVideoFile', 'audioStartOffsetSeconds', 'createdAtISO8601', 'tracks', 'muxedFromTrackIDs']);
    for (const k of Object.keys(m)) if (!known.has(k)) warnings.push(`Campo desconocido ignorado: ${k}.`);
  }
  if (errors.length) return { ok: false, errors, warnings };
  return { ok: true, errors: [], warnings, manifest: { schemaVersion: 2, sourceVersion: v, captureID: m.captureID, cameraSource: String(m.cameraSource || 'unknown'), audioSource: String(m.audioSource || 'unknown'),
    selectedInputName: m.selectedInputName ?? null, videoFile: m.originalVideoFile, muxedVideoFile: m.muxedVideoFile ?? null, createdAt: m.createdAtISO8601, tracks, muxedFromTrackIDs: muxedFrom } };
}

// Qué debe importar el editor sin duplicar audio. `useMuxed`: usar el MOV combinado como video (ya trae sus pistas) o el original.
// - Con el MOV combinado, las pistas de muxedFromTrackIDs NO se importan aparte (ya suenan dentro del video).
// - Con el original, se importan todas las pistas (el video HEVC original no trae ese audio).
export function importPlan(manifest, { useMuxed = false } = {}) {
  if (!manifest || manifest.schemaVersion !== 2 || !Array.isArray(manifest.tracks)) throw new Error('importPlan necesita un manifiesto ya normalizado por parseManifest.');
  const muxed = useMuxed && manifest.muxedVideoFile;
  const inMux = new Set(muxed ? manifest.muxedFromTrackIDs : []);
  return { videoFile: muxed ? manifest.muxedVideoFile : manifest.videoFile, audioTracks: manifest.tracks.filter((t) => !inMux.has(t.id)), embeddedTrackIDs: [...inMux] };
}

// Convierte el plan de importación en operaciones del editor (sin tocar archivos ni el navegador).
// ctx: { videoStart (s en el timeline), assets: { [nombreDeArchivo]: { id, duration } } } — el navegador llena `assets` tras abrir cada archivo.
// Desfase: offsetSeconds > 0 = el audio empezó DESPUÉS del video; < 0 = empezó antes (se recorta el inicio del audio, no se mueve a tiempo negativo).
// Devuelve { ops, warnings, skipped }: `skipped` lista lo que no se pudo importar (archivo ausente, sin duración, pista que cae fuera del video).
export function planImportOps(plan, ctx) {
  if (!plan || !Array.isArray(plan.audioTracks)) throw new Error('planImportOps necesita el resultado de importPlan.');
  const videoStart = Number.isFinite(ctx?.videoStart) ? ctx.videoStart : 0, assets = ctx?.assets || {};
  const ops = [], warnings = [], skipped = [];
  // A channelIndex is a request for one channel, not proof that the full file
  // is already split. Never play the same stereo CAF twice as two voices.
  // Only independently extracted/verified assets may be provided by the caller.
  const splitChannelAssets = ctx?.splitChannelAssets || {};
  const usedSplitIds = new Set();
  const v = assets[plan.videoFile];
  if (!v) skipped.push({ file: plan.videoFile, reason: 'video no abierto' }); else ops.push({ op: 'add_clip', asset_id: v.id, start: videoStart });
  for (const t of plan.audioTracks) {
    const indexed = t.channelIndex != null;
    const a = indexed ? splitChannelAssets[t.id] : assets[t.file];
    // A full audio asset is never an acceptable replacement for an isolated channel.
    if (indexed && (!a || !a.id || a.id === assets[t.file]?.id || usedSplitIds.has(a.id))) {
      warnings.push(`${t.id}: canal ${t.channelIndex} no separado; se omite para evitar audio duplicado.`);
      skipped.push({ file: t.file, id: t.id, reason: 'canal independiente sin extraer' });
      continue;
    }
    if (!a) { skipped.push({ file: t.file, id: t.id, reason: 'archivo de audio no abierto' }); continue; }
    if (!(a.duration > 0)) { skipped.push({ file: t.file, id: t.id, reason: 'no se pudo medir la duración' }); continue; }
    if (indexed) usedSplitIds.add(a.id);
    if (!t.offsetKnown) warnings.push(`${t.id}: desfase desconocido; se coloca al inicio del video. Ajústalo a mano.`);
    const off = t.offsetKnown ? t.offsetSeconds : 0;
    const at = videoStart + off;                       // dónde cae el inicio del audio en el timeline
    const tin = at < 0 ? Math.min(-at, a.duration) : 0, start = Math.max(0, at);   // si cae antes de 0, se recorta ese tramo del audio
    if (tin >= a.duration) { skipped.push({ file: t.file, id: t.id, reason: 'el desfase deja la pista sin contenido' }); continue; }
    ops.push({ op: 'add_audio_clip', asset_id: a.id, start: Math.round(start * 1000) / 1000, in: Math.round(tin * 1000) / 1000, out: a.duration, role: t.role });
  }
  return { ops, warnings, skipped };
}
