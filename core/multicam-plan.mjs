// Wivra multicamera plan: camera inventory, dual/single decision, Picture-in-
// Picture geometry, selected-audio policy and disconnect recovery.
// Pure functions, no imports beyond the source capability contract, usable by
// Node tests and by both mobile WebViews. Nothing here proves that a phone can
// run two cameras: only a native runtime inventory (provenance 'runtime') may
// enable a dual plan, and only a recorded, verified take proves it worked.
// — Claude
import { validateMultiSourcePlan } from './source-capabilities.mjs';
import { applyBatch } from './operations.mjs';

export const CAMERA_FACINGS = Object.freeze(['back', 'front', 'external', 'unknown']);
export const CAPTURE_MODES = Object.freeze(['dual-composited', 'dual-separate', 'single', 'none']);
export const PIP_CORNERS = Object.freeze(['bottom-right', 'bottom-left', 'top-left', 'top-right']);
export const AUDIO_CHOICES = Object.freeze(['primary', 'secondary', 'none']);
export const CAMERA_LOSS_REASONS = Object.freeze([
  'disconnected', 'in-use', 'max-cameras', 'fatal', 'disabled', 'thermal', 'interrupted', 'unknown'
]);

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const PLATFORMS = ['android', 'ios'];
const has = (list, v) => list.includes(v);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round6 = n => Math.round(n * 1e6) / 1e6;

/**
 * Validates the report a native host produces from CameraManager /
 * CameraX availableConcurrentCameraInfos (Android) or AVCaptureDevice
 * DiscoverySession + AVCaptureMultiCamSession (iOS). Unknown fields are
 * dropped; malformed cameras or pairs are discarded, never repaired into a
 * claim. A non-runtime report (catalog, test fixture, old manifest) can list
 * cameras but never enables concurrency.
 */
export function normalizeCameraInventory(report) {
  const errors = [];
  const platform = has(PLATFORMS, report?.platform) ? report.platform : 'unknown';
  if (platform === 'unknown') errors.push('unknown-platform');
  const runtime = report?.provenance === 'runtime' &&
    typeof report?.sessionId === 'string' && SAFE_ID.test(report.sessionId);
  const cameras = [];
  const seen = new Set();
  for (const c of Array.isArray(report?.cameras) ? report.cameras : []) {
    if (typeof c?.id !== 'string' || !SAFE_ID.test(c.id) || seen.has(c.id)) {
      errors.push('invalid-camera');
      continue;
    }
    seen.add(c.id);
    cameras.push({
      id: c.id,
      facing: has(CAMERA_FACINGS, c.facing) ? c.facing : 'unknown',
      label: typeof c.label === 'string' ? c.label.slice(0, 80) : ''
    });
  }
  const pairs = [];
  const pairKeys = new Set();
  for (const p of Array.isArray(report?.concurrentPairs) ? report.concurrentPairs : []) {
    if (!Array.isArray(p) || p.length !== 2 || p[0] === p[1] ||
        !seen.has(p[0]) || !seen.has(p[1])) {
      errors.push('invalid-pair');
      continue;
    }
    const key = [...p].sort().join('|');
    if (pairKeys.has(key)) continue;
    pairKeys.add(key);
    pairs.push([p[0], p[1]]);
  }
  return {
    platform,
    runtime,
    sessionId: runtime ? report.sessionId : null,
    cameras,
    // Without runtime provenance a listed pair is only a hint.
    concurrentPairs: runtime ? pairs : [],
    multiCamSupported: runtime && report?.multiCamSupported === true,
    errors
  };
}

const byFacing = (inv, facing) => inv.cameras.find(c => c.facing === facing);

/**
 * Decides how to record. Android with a CameraX concurrent pair composes the
 * Picture-in-Picture natively into ONE file (CompositionSettings). iOS with
 * AVCaptureMultiCamSession records TWO files on one clock and the editor
 * composes them (overlay track). Everything else falls back to one camera
 * with an explicit reason, so the owner still gets a valid recording.
 */
export function planCameraCapture(inventoryIn, {
  want = 'dual', primaryFacing = 'back', secondaryFacing = 'front'
} = {}) {
  const inv = inventoryIn?.cameras && 'runtime' in inventoryIn
    ? inventoryIn : normalizeCameraInventory(inventoryIn);
  if (inv.cameras.length === 0) {
    return { mode: 'none', primaryId: null, secondaryId: null, composition: 'none', reason: 'no-camera' };
  }
  const primary = byFacing(inv, primaryFacing) || inv.cameras[0];
  const single = reason => ({
    mode: 'single', primaryId: primary.id, secondaryId: null, composition: 'none', reason
  });
  if (want !== 'dual') return single('single-requested');
  if (inv.cameras.length < 2) return single('one-camera');
  if (!inv.runtime) return single('unverified-inventory');

  if (inv.platform === 'android') {
    // Prefer the requested facings, then any supported pair that keeps the
    // requested primary, then any pair at all.
    const wanted = byFacing(inv, secondaryFacing);
    const match = (a, b) => inv.concurrentPairs.find(p =>
      (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a));
    let pair = wanted && wanted.id !== primary.id ? match(primary.id, wanted.id) : null;
    let p = primary.id;
    let s = pair ? wanted.id : null;
    if (!pair) {
      pair = inv.concurrentPairs.find(x => x.includes(primary.id)) || inv.concurrentPairs[0];
      if (pair) {
        // The requested primary is in no pair: keep the requested FACING.
        const facingOf = id => inv.cameras.find(c => c.id === id)?.facing;
        p = pair.includes(primary.id) ? primary.id
          : (pair.find(id => facingOf(id) === primaryFacing) || pair[0]);
        s = pair[0] === p ? pair[1] : pair[0];
      }
    }
    if (!pair) return single('no-concurrent-pair');
    return { mode: 'dual-composited', primaryId: p, secondaryId: s, composition: 'native', reason: 'concurrent-pair' };
  }
  if (inv.platform === 'ios') {
    if (!inv.multiCamSupported) return single('multicam-unsupported');
    const secondary = byFacing(inv, secondaryFacing);
    if (!secondary || secondary.id === primary.id) return single('no-secondary-facing');
    return { mode: 'dual-separate', primaryId: primary.id, secondaryId: secondary.id, composition: 'editor', reason: 'multicam-session' };
  }
  return single('unknown-platform');
}

/**
 * Phone camera + another frame source (for example Ray-Ban Meta through the
 * Wearables Device Access Toolkit). Allowed only when the shared source
 * capability contract holds runtime evidence of concurrent frames for every
 * source; otherwise the owner records with ONE source and is told why.
 */
export function planPhoneWithWearable(phoneSource, wearableSource, { compositorValidated = false } = {}) {
  const check = validateMultiSourcePlan([phoneSource, wearableSource], { compositorValidated });
  if (check.ok) {
    return { mode: 'dual-separate', composition: 'editor', sources: [phoneSource.id, wearableSource.id], reason: 'validated' };
  }
  // Fall back to whichever single source has verified frames. Phone first:
  // it does not depend on a Bluetooth/Wi-Fi link to the glasses.
  const solo = [phoneSource, wearableSource].find(s => validateMultiSourcePlan([s]).ok);
  return {
    mode: solo ? 'single' : 'none',
    composition: 'none',
    sources: solo ? [solo.id] : [],
    reason: check.reason
  };
}

/**
 * Picture-in-Picture rectangle in normalized frame units (origin top-left,
 * 0..1). The inset keeps the frame's aspect ratio (same scale on both axes),
 * which is what CameraX requires to avoid stretching. `margin` is a fraction
 * of the frame width; vertically it is corrected so both margins look equal.
 */
export function pipLayout({ corner = 'bottom-right', scale = 0.3, margin = 0.04, frameWidth = 1080, frameHeight = 1920 } = {}) {
  if (!has(PIP_CORNERS, corner)) throw new TypeError('Unknown PiP corner');
  if (!(frameWidth > 0) || !(frameHeight > 0)) throw new TypeError('Invalid frame size');
  const s = clamp(Number(scale) || 0.3, 0.15, 0.5);
  const mx = clamp(Number(margin) || 0, 0, 0.1);
  const my = mx * frameWidth / frameHeight;
  const left = corner.endsWith('left');
  const top = corner.startsWith('top');
  return {
    corner,
    x: round6(left ? mx : 1 - mx - s),
    y: round6(top ? my : 1 - my - s),
    w: round6(s),
    h: round6(s)
  };
}

/**
 * CameraX CompositionSettings use normalized device coordinates: origin at the
 * centre, X right, Y up, range -1..1, offset applied after scale. A primary
 * camera fills the frame with scale 1 and offset 0.
 */
export function toCameraXComposition(rect) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return {
    offsetX: round6(cx * 2 - 1),
    offsetY: round6(1 - cy * 2),
    scaleX: round6(rect.w),
    scaleY: round6(rect.h)
  };
}

/** Same rectangle as an editor overlay clip (x, y = centre; scale = width). */
export function toEditorOverlay(rect) {
  return { x: round6(rect.x + rect.w / 2), y: round6(rect.y + rect.h / 2), scale: round6(rect.w) };
}

export function nextPipCorner(corner) {
  const i = PIP_CORNERS.indexOf(corner);
  return PIP_CORNERS[(i + 1) % PIP_CORNERS.length];
}

/**
 * Editor operations that compose two separately recorded takes (iOS dual
 * session, or phone + glasses) as main video + Picture-in-Picture layer.
 * `secondaryOffsetMs` = secondary first frame - primary first frame, measured
 * on one native monotonic clock. Only the selected audio stays audible; the
 * other source is muted, never mixed by accident.
 */
export function buildPipEditorOps({
  primaryAssetId, secondaryAssetId, primaryDurationS, secondaryDurationS,
  secondaryOffsetMs = 0, corner = 'bottom-right', scale = 0.3,
  frameWidth = 1080, frameHeight = 1920, audio = 'primary', at = 0
}) {
  if (typeof primaryAssetId !== 'string' || typeof secondaryAssetId !== 'string' ||
      primaryAssetId === secondaryAssetId) throw new TypeError('Two distinct assets are required');
  if (!(primaryDurationS > 0) || !(secondaryDurationS > 0)) throw new TypeError('Durations must be positive');
  if (!Number.isFinite(secondaryOffsetMs)) throw new TypeError('Offset must be finite');
  if (!has(AUDIO_CHOICES, audio)) throw new TypeError('Unknown audio choice');
  if (!Number.isFinite(at) || at < 0) throw new TypeError('Timeline position must be >= 0');
  const offsetS = secondaryOffsetMs / 1000;
  // Secondary started later: place it later. Started earlier: skip its head.
  const start = round6(Math.max(0, offsetS));
  const tin = round6(Math.max(0, -offsetS));
  const visible = Math.min(secondaryDurationS - tin, primaryDurationS - start);
  if (!(visible > 0.05)) return { ok: false, reason: 'no-overlap', ops: [] };
  const rect = pipLayout({ corner, scale, frameWidth, frameHeight });
  const overlay = toEditorOverlay(rect);
  const ops = [
    { op: 'add_clip', asset_id: primaryAssetId, start: round6(at) },
    {
      op: 'add_overlay_clip', asset_id: secondaryAssetId, start: round6(at + start), in: tin,
      out: round6(tin + visible), track: 1, ...overlay,
      muted: audio !== 'secondary'
    }
  ];
  // The main clip id only exists after add_clip runs, so muting the main
  // lane is a second step (see applyPipComposition).
  return { ok: true, ops, muteMainAudio: audio !== 'primary', overlapS: round6(visible) };
}

/**
 * Applies the composition with the editor's own atomic operations. Returns
 * the new project (the input is not modified) or the editor's error.
 */
export function applyPipComposition(project, options) {
  const plan = buildPipEditorOps(options);
  if (!plan.ok) return { ok: false, code: plan.reason };
  const first = applyBatch(project, plan.ops);
  if (!first.ok) return first;
  const mainClipId = first.results[0].id;
  const overlayClipId = first.results[1].id;
  if (!plan.muteMainAudio) return { ok: true, project: first.project, mainClipId, overlayClipId, overlapS: plan.overlapS };
  const muted = applyBatch(first.project, [{ op: 'set_clip_audio', clip_id: mainClipId, muted: true }]);
  if (!muted.ok) return muted;
  return { ok: true, project: muted.project, mainClipId, overlayClipId, overlapS: plan.overlapS };
}

/**
 * One audio source per recording. A dual camera recording never records two
 * microphones; a microphone that disappears never silently turns the take
 * into an unlabelled mute file.
 */
export function chooseCaptureAudio({ micPermission = false, wantSound = true, selectedInputAvailable = true } = {}) {
  if (!wantSound) return { audio: 'none', reason: 'owner-chose-silent' };
  if (!micPermission) return { audio: 'none', reason: 'mic-permission-denied', warn: true };
  if (!selectedInputAvailable) return { audio: 'system-default', reason: 'selected-input-missing', warn: true };
  return { audio: 'selected', reason: 'ok' };
}

/**
 * Recovery state machine shared by both platforms. Native code performs the
 * actions; this function only decides them, so the decisions are testable.
 * Phases: preview → recording → finalizing → (recording | stopped).
 */
export function createMulticamSession(plan) {
  const active = [plan?.primaryId, plan?.secondaryId].filter(Boolean);
  return {
    phase: active.length ? 'preview' : 'stopped',
    mode: plan?.mode || 'none',
    active,
    takes: [],
    takeIndex: 0,
    resumeAfterFinalize: false,
    dualAvailableAgain: false,
    actions: [],
    notices: []
  };
}

export function multicamReduce(state, event) {
  const s = { ...state, active: [...state.active], takes: [...state.takes], actions: [], notices: [] };
  switch (event?.type) {
    case 'record-start': {
      if (s.phase !== 'preview' || s.active.length === 0) return s;
      s.phase = 'recording';
      s.takeIndex += 1;
      s.actions.push({ do: 'start-recording', take: s.takeIndex, continuation: false });
      return s;
    }
    case 'record-stop': {
      if (s.phase !== 'recording') return s;
      s.phase = 'finalizing';
      s.resumeAfterFinalize = false;
      s.actions.push({ do: 'finalize-take', take: s.takeIndex });
      return s;
    }
    case 'camera-lost': {
      if (!s.active.includes(event.cameraId)) return s;
      const reason = has(CAMERA_LOSS_REASONS, event.reason) ? event.reason : 'unknown';
      s.active = s.active.filter(id => id !== event.cameraId);
      const remaining = s.active[0] || null;
      s.notices.push({ kind: 'camera-lost', cameraId: event.cameraId, reason });
      if (s.phase === 'recording') {
        // Close the current file first: it holds valid frames up to the loss.
        s.phase = 'finalizing';
        s.resumeAfterFinalize = remaining !== null;
        s.actions.push({ do: 'finalize-take', take: s.takeIndex });
      }
      if (remaining) {
        s.mode = 'single';
        s.actions.push({ do: 'rebind-single', cameraId: remaining });
      } else {
        s.mode = 'none';
        s.resumeAfterFinalize = false;
        if (s.phase !== 'finalizing') s.phase = 'stopped';
        s.actions.push({ do: 'release-cameras' });
      }
      return s;
    }
    case 'take-finalized': {
      if (s.phase !== 'finalizing') return s;
      const bytes = Number(event.bytes) || 0;
      const status = event.verified === true ? 'kept'
        : bytes > 0 ? 'needs-review' // never delete bytes that may be playable
        : 'empty';
      s.takes.push({ take: s.takeIndex, status, durationMs: Number(event.durationMs) || 0, mode: event.mode || state.mode });
      if (status === 'empty') s.actions.push({ do: 'delete-empty-placeholder', take: s.takeIndex });
      if (s.resumeAfterFinalize && s.active.length > 0) {
        s.phase = 'recording';
        s.takeIndex += 1;
        s.actions.push({ do: 'start-recording', take: s.takeIndex, continuation: true });
      } else {
        s.phase = s.active.length > 0 ? 'preview' : 'stopped';
      }
      s.resumeAfterFinalize = false;
      return s;
    }
    case 'camera-restored': {
      // Never interrupt a running single-camera take to go back to dual: the
      // owner decides after stopping.
      if (s.phase === 'recording' || s.phase === 'finalizing') {
        s.dualAvailableAgain = true;
        s.notices.push({ kind: 'dual-available-after-stop', cameraId: event.cameraId });
      } else {
        s.dualAvailableAgain = false;
        s.actions.push({ do: 'replan' });
      }
      return s;
    }
    default:
      return s;
  }
}

/**
 * Screen capture always requires the platform consent dialog for THIS session
 * (Android MediaProjection, iOS ReplayKit). A previous consent, a setting or a
 * WebView message is never enough.
 */
export function screenCaptureGate({ platform, consentResult = null, sessionId = null, purpose = 'recording' } = {}) {
  if (!has(PLATFORMS, platform)) return { allowed: false, reason: 'unknown-platform' };
  if (!['recording', 'live'].includes(purpose)) return { allowed: false, reason: 'unknown-purpose' };
  if (platform === 'ios' && purpose === 'recording') {
    // No ReplayKit broadcast extension is compiled in Wivra iOS yet.
    return { allowed: false, reason: 'not-implemented-ios' };
  }
  const fresh = consentResult?.granted === true && typeof sessionId === 'string' &&
    SAFE_ID.test(sessionId) && consentResult?.sessionId === sessionId;
  return fresh ? { allowed: true, reason: 'consented-this-session' }
    : { allowed: false, reason: 'needs-system-consent' };
}
