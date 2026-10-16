/**
 * Wivra Director · v0.1: deterministic, offline-first production plan.
 * This is a PLANNING module, not geocoding, GPS tracking, a route engine,
 * a vision model, a media recorder, or an editor.
 *
 * No network, permissions, accounts, telemetry, billing, or third-party assets.
 * Users supply their own places, facts, script and optionally media afterward.
 * A plan is a suggestion and never starts recording or broadcasting.
 */
export const PRODUCTION_FORMATS = Object.freeze([
  'reel', 'vertical_minidoc', 'vertical_series', 'vertical_film'
]);
export const NARRATION_MODES = Object.freeze(['live', 'voiceover_later', 'mixed', 'none']);
const SHOT_STATES = new Set(['todo', 'accepted', 'retry', 'skipped']);
const trimText = (value, max, name, required = true) => {
  if (typeof value !== 'string' || value.length > max ||
      (required && !value.trim())) throw new TypeError(name + ' inválido.');
  return value.trim();
};
const safeInt = (value, min, max, name) => {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(name + ' fuera de rango.');
  return value;
};

/** Exact integer seconds; useful for scenes, not an unverified audio beat map. */
function allocateSeconds(total, parts) {
  const base = Math.floor(total / parts);
  const extra = total % parts;
  return Array.from({length: parts}, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * A sequence of user-supplied places, not a geographically optimized route.
 * The form of the script is editable after construction.
 */
export function createOfflineProduction({
  title, format = 'reel', durationSeconds = 60, locations,
  narrationMode = 'voiceover_later', language = 'es',
  episodeNumber = null
} = {}) {
  const name = trimText(title, 150, 'Título');
  if (!PRODUCTION_FORMATS.includes(format)) throw new TypeError('Formato no admitido.');
  if (!NARRATION_MODES.includes(narrationMode)) throw new TypeError('Modo de voz inválido.');
  safeInt(durationSeconds, 5, 7200, 'Duración');
  trimText(language, 16, 'Idioma');
  if (episodeNumber !== null) safeInt(episodeNumber, 1, 999, 'Episodio');
  if (!Array.isArray(locations) || locations.length < 1 || locations.length > 30 ||
      locations.length > durationSeconds) throw new RangeError('Se requieren 1–30 lugares y tiempo suficiente.');
  const sizes = allocateSeconds(durationSeconds, locations.length);
  const ids = new Set();
  const shots = locations.map((entry, i) => {
    const location = typeof entry === 'string' ? { name: entry } : entry;
    if (!location || typeof location !== 'object' || Array.isArray(location)) throw new TypeError('Lugar inválido.');
    const placeName = trimText(location.name, 160, 'Nombre del lugar');
    const placeId = 'place-' + (i + 1);
    if (ids.has(placeId)) throw new TypeError('ID duplicado.');
    ids.add(placeId);
    const note = trimText(location.note ?? '', 800, 'Nota', false);
    const script = trimText(location.script ?? '', 2200, 'Guion', false);
    const directions = trimText(location.shootHint ?? '', 700, 'Indicación', false);
    const targetSeconds = sizes[i];
    return {
      id: 'shot-' + (i + 1), placeId, placeName,
      title: 'Toma ' + (i + 1) + ' · ' + placeName,
      directions: directions || 'Graba un plano general, un detalle y una alternativa. Revisa antes de continuar.',
      note, script, targetSeconds,
      // Filming recommendation is a heuristic, not the length of the finished edit.
      suggestedRawSeconds: Math.max(targetSeconds + 5, targetSeconds * 2),
      state: 'todo', mediaAssetId: null
    };
  });
  return {
    schema: 'wivra-production-plan-v1',
    title: name, format, durationSeconds, narrationMode,
    language: language.trim(), episodeNumber,
    route: { method: 'user_order_only', geographicallyOptimized: false,
      navigationProvided: false, gpsUsed: false, externallyVerifiedPlaces: false },
    shots, revision: 0,
    notes: [
      'La secuencia sigue el orden del usuario, NO calcula distancias ni rutas reales.',
      'Las sugerencias de toma son genéricas; los datos de los lugares provienen del usuario.',
      'La voz del teleprompter es una guía, no un hecho verificado ni audio ya grabado.',
      'Ninguna toma se marca completada automáticamente y ningún medio se copia.'
    ]
  };
}

/** Reorder whole places/shots without claiming the order is an optimal road route. */
export function reorderOfflineProduction(plan, shotIds) {
  if (plan?.schema !== 'wivra-production-plan-v1' || !Array.isArray(shotIds) ||
      shotIds.length !== plan.shots.length) throw new TypeError('Orden inválido.');
  const wanted = new Set(shotIds);
  if (wanted.size !== shotIds.length || plan.shots.some(s => !wanted.has(s.id))) {
    throw new TypeError('El orden debe conservar todas las tomas sin duplicados.');
  }
  const index = new Map(plan.shots.map(s => [s.id, s]));
  return { ...plan, revision: plan.revision + 1, shots: shotIds.map(id => ({...index.get(id)})) };
}

/**
 * Explicit human review only. An asset reference can be attached only if it is
 * actually present in the supplied editor project. No attachment is fabricated.
 */
export function reviewProductionShot(plan, shotId, decision, {assetId = null, project = null} = {}) {
  if (plan?.schema !== 'wivra-production-plan-v1' ||
      !plan.shots?.some(s => s.id === shotId)) throw new TypeError('Toma desconocida.');
  if (!SHOT_STATES.has(decision)) throw new TypeError('Decisión inválida.');
  if (assetId !== null) {
    if (typeof assetId !== 'string' || !project?.assets?.some(a => a.id === assetId)) {
      throw new TypeError('El archivo no existe en este proyecto de edición.');
    }
    if (decision !== 'accepted') throw new TypeError('Solo una toma aceptada puede vincular un archivo.');
  }
  return {
    ...plan, revision: plan.revision + 1,
    shots: plan.shots.map(s => s.id === shotId
      ? {...s, state: decision, mediaAssetId: decision === 'accepted' ? assetId : null}
      : {...s})
  };
}

export function productionProgress(plan) {
  if (plan?.schema !== 'wivra-production-plan-v1') throw new TypeError('Plan inválido.');
  const accepted = plan.shots.filter(s => s.state === 'accepted').length;
  const skipped = plan.shots.filter(s => s.state === 'skipped').length;
  const remaining = plan.shots.filter(s => s.state === 'todo' || s.state === 'retry');
  return {
    accepted, skipped, total: plan.shots.length, remaining: remaining.length,
    nextShotId: remaining[0]?.id ?? null,
    // A shot can be accepted without a media reference (user says completed).
    linkedMedia: plan.shots.filter(s => s.state === 'accepted' && !!s.mediaAssetId).length,
    readyForManualReview: remaining.length === 0
  };
}

/**
 * Context-limited interpretation: recognized phrases map to 5 planning actions.
 * Does not start camera, change editor, access GPS, or start/stop LIVE.
 */
const COMMANDS = Object.freeze({
  next: ['siguiente', 'siguiente toma', 'pasa a la siguiente', 'next', 'next shot',
    'suivant', 'prochaine prise', 'próximo', 'próxima cena', 'weiter', 'nächste aufnahme',
    'avanti', 'prossima ripresa', '次へ', '下一步'],
  repeat: ['repite', 'repite la instruccion', 'que tengo que grabar', 'repeat', 'repeat that',
    'repete', 'repete ca', 'repete a instruçao', 'ripeti', 'wiederholen', 'もう一度', '重复'],
  accepted: ['ya la hice', 'toma lista', 'listo', 'terminada', 'done', 'shot done',
    'c est fait', 'feito', 'feito isso', 'fertig', 'fatto', '撮影完了', '拍好了'],
  retry: ['repetir toma', 'no me gusto', 'otra toma', 'retake', 'try again',
    'refaire', 'refazer', 'nochmal aufnehmen', 'rifare', '撮り直し', '重拍'],
  skipped: ['saltar', 'salta esta toma', 'omitir toma', 'skip', 'skip shot',
    'passer', 'pular', 'überspringen', 'salta la ripresa', 'スキップ', '跳过']
});
const normalize = text => text.normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase().replace(/[.!?¿¡,;:]+$/g, '').replace(/\s+/g, ' ').trim();
const COMMAND_MAP = new Map(Object.entries(COMMANDS).flatMap(([action, phrases]) =>
  phrases.map(phrase => [normalize(phrase), action])));

/** Returns action metadata, never executes it or guesses at unknown phrases. */
export function understandDirectorCommand(text) {
  if (typeof text !== 'string' || text.length > 180 || !text.trim()) return null;
  const action = COMMAND_MAP.get(normalize(text));
  return action ? {scope: 'director_shot_plan', action, requiresConfirmation: action === 'skipped'} : null;
}
