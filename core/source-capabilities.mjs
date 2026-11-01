// Wivra: one auditable source capability contract for REC, LIVE and Director.
// No vendor SDK, camera permission, hardware support or working LIVE is implied.
// UI and native adapters must supply runtime evidence before enabling controls.
// No imports: usable by Node tests and eventually by both mobile WebViews.
export const SOURCE_KINDS = Object.freeze([
  'meta-dat', 'phone-camera', 'screen', 'app-window',
  'user-media', 'wearable-vendor', 'external-camera'
]);
export const OUTPUT_MODES = Object.freeze([
  'local-frames', 'direct-stream', 'recorded-media', 'on-device-bridge'
]);
export const CAPABILITY_STATES = Object.freeze([
  'unknown', 'unavailable', 'experimental', 'ready'
]);
export const CAPABILITIES = Object.freeze([
  'cameraFrames', 'recordVideo', 'directLive', 'mediaImport',
  'audioFrames', 'displayHud', 'screenFrames', 'concurrentVideo'
]);

const has = (list, value) => list.includes(value);
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const finitePositive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;

export function createSourceCandidate({ id, kind, outputModes = [], label = '', provider = '' }) {
  if (!SAFE_ID.test(id ?? '') || !has(SOURCE_KINDS, kind) ||
      !Array.isArray(outputModes) || !outputModes.every(mode => has(OUTPUT_MODES, mode)) ||
      typeof label !== 'string' || typeof provider !== 'string') {
    throw new TypeError('Invalid wearable/camera source descriptor');
  }
  // A manufacturer's product page, a working example and a successful SDK
  // registration are not runtime evidence of decodable frames or saved files.
  return {
    id, kind, label: label.slice(0, 128), provider: provider.slice(0, 128),
    outputModes: [...new Set(outputModes)],
    capabilities: Object.fromEntries(CAPABILITIES.map(k => [k, 'unknown'])),
    evidence: Object.create(null)
  };
}

// Evidence is scoped to a real session, not merely a device's model name.
// Only observed/authorized outputs can be marked READY.
export function applyEvidence(source, key, evidence = {}) {
  if (!source || !CAPABILITIES.includes(key)) throw new TypeError('Unknown capability');
  const next = {
    ...source,
    capabilities: { ...source.capabilities },
    evidence: { ...source.evidence }
  };
  // Never inherit a READY state from the previous device/permission session.
  const previousSessions = Object.values(next.evidence)
    .map(item => item?.sessionId).filter(Boolean);
  if (previousSessions.some(id => id !== evidence.sessionId)) {
    next.capabilities = Object.fromEntries(CAPABILITIES.map(key => [key, 'unknown']));
    next.evidence = Object.create(null);
  }
  const scopeOk = evidence.provenance === 'runtime' &&
    typeof evidence.sessionId === 'string' && SAFE_ID.test(evidence.sessionId) &&
    evidence.permissionGranted === true;

  const frameOk = scopeOk && source.outputModes.includes('local-frames') &&
    Number.isInteger(evidence.validFrames) && evidence.validFrames >= 2 &&
    finitePositive(evidence.measuredFPS) &&
    Number.isInteger(evidence.width) && evidence.width > 0 &&
    Number.isInteger(evidence.height) && evidence.height > 0 &&
    finitePositive(evidence.lastFrameAgeSeconds) &&
    evidence.lastFrameAgeSeconds <= 4;

  const exportOk = scopeOk && source.outputModes.includes('recorded-media') &&
    evidence.localFileVerified === true && finitePositive(evidence.durationMs) &&
    evidence.fileBytes > 0 && evidence.userConfirmed === true;

  const liveOk = scopeOk && source.outputModes.includes('direct-stream') &&
    evidence.remoteIngestConfirmed === true && evidence.userConfirmed === true;

  const permissions = scopeOk && evidence.vendorCapabilityExposed === true;
  const validated = key === 'cameraFrames' || key === 'screenFrames' || key === 'audioFrames'
    ? frameOk
    : key === 'mediaImport' || key === 'recordVideo' ? exportOk
    : key === 'directLive' ? liveOk
    : key === 'displayHud' ? permissions && evidence.hudRenderedAndConfirmed === true
    : key === 'concurrentVideo' ? permissions &&
      evidence.simultaneousFrameSources >= 2 && evidence.compositorValidated === true
    : false;

  if (evidence.reportedUnavailable === true && scopeOk) {
    next.capabilities[key] = 'unavailable';
  } else if (validated) {
    next.capabilities[key] = 'ready';
  } else if (evidence.provenance === 'runtime' && scopeOk) {
    next.capabilities[key] = 'experimental';
  } else {
    next.capabilities[key] = 'unknown';
  }
  next.evidence[key] = {
    provenance: evidence.provenance === 'runtime' ? 'runtime' : 'unverified',
    sessionId: scopeOk ? evidence.sessionId : null
  };
  return next;
}

// A direct RTMP emitter is NOT a camera-frame source for Wivra PiP.
// Without observed local video frames, do not advertise multicamera mixing.
export function canUseForLocalComposition(source) {
  return source?.outputModes?.includes('local-frames') === true &&
    source?.capabilities?.cameraFrames === 'ready';
}
export function canRecordLocalVideo(source) {
  return source?.capabilities?.recordVideo === 'ready';
}
export function canStartDirectLive(source) {
  return source?.capabilities?.directLive === 'ready';
}

export function validateMultiSourcePlan(sources, { compositorValidated = false } = {}) {
  if (!Array.isArray(sources) || sources.length < 1) {
    return { ok: false, reason: 'no-sources' };
  }
  const ids = sources.map(s => s?.id);
  if (ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) {
    return { ok: false, reason: 'duplicate-or-invalid-source' };
  }
  if (sources.some(s => !canUseForLocalComposition(s))) {
    return { ok: false, reason: 'unverified-local-frames' };
  }
  if (sources.length > 1 && !compositorValidated) {
    return { ok: false, reason: 'concurrency-not-validated' };
  }
  if (sources.length > 1 &&
      !sources.every(s => s.capabilities.concurrentVideo === 'ready')) {
    return { ok: false, reason: 'source-concurrency-unverified' };
  }
  return { ok: true, reason: 'validated' };
}
