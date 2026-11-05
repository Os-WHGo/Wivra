// Multicamera plan: inventory, dual/single decision, PiP geometry, editor
// composition with the real operations, audio choice and recovery. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../project.mjs';
import { createSourceCandidate, applyEvidence } from '../source-capabilities.mjs';
import {
  normalizeCameraInventory, planCameraCapture, planPhoneWithWearable,
  pipLayout, toCameraXComposition, toEditorOverlay, nextPipCorner, PIP_CORNERS,
  buildPipEditorOps, applyPipComposition, chooseCaptureAudio,
  createMulticamSession, multicamReduce, screenCaptureGate
} from '../multicam-plan.mjs';

const androidReport = (pairs = [['0', '1']], extra = {}) => ({
  platform: 'android', provenance: 'runtime', sessionId: 'probe-1',
  cameras: [{ id: '0', facing: 'back' }, { id: '1', facing: 'front' }, { id: '2', facing: 'back' }],
  concurrentPairs: pairs, ...extra
});
const iosReport = (multi = true) => ({
  platform: 'ios', provenance: 'runtime', sessionId: 'probe-2', multiCamSupported: multi,
  cameras: [{ id: 'com.apple.avfoundation.avcapturedevice.built-in_video:0', facing: 'back' },
            { id: 'com.apple.avfoundation.avcapturedevice.built-in_video:1', facing: 'front' }]
});

test('inventory drops malformed cameras and pairs, never repairs them into claims', () => {
  const inv = normalizeCameraInventory({
    ...androidReport([['0', '1'], ['1', '0'], ['0', '0'], ['0', '9'], ['x']]),
    cameras: [{ id: '0', facing: 'back' }, { id: '0', facing: 'front' }, { id: '../etc', facing: 'back' },
              { id: '1', facing: 'sideways' }]
  });
  assert.deepEqual(inv.cameras.map(c => [c.id, c.facing]), [['0', 'back'], ['1', 'unknown']]);
  assert.deepEqual(inv.concurrentPairs, [['0', '1']]); // duplicate reversed pair removed
  assert.ok(inv.errors.includes('invalid-camera'));
  assert.ok(inv.errors.includes('invalid-pair'));
});

test('a catalog or fixture inventory never enables two cameras', () => {
  const inv = normalizeCameraInventory({ ...androidReport(), provenance: 'catalog' });
  assert.equal(inv.runtime, false);
  assert.deepEqual(inv.concurrentPairs, []);
  const plan = planCameraCapture(inv);
  assert.equal(plan.mode, 'single');
  assert.equal(plan.reason, 'unverified-inventory');
  assert.equal(normalizeCameraInventory({ ...iosReport(), sessionId: undefined }).multiCamSupported, false);
});

test('Android concurrent pair → one natively composited file; no pair → single camera', () => {
  const dual = planCameraCapture(androidReport());
  assert.deepEqual([dual.mode, dual.primaryId, dual.secondaryId, dual.composition],
    ['dual-composited', '0', '1', 'native']);
  // Requested facings unavailable together: keep the requested primary.
  const other = planCameraCapture(androidReport([["1", "2"]]));
  assert.deepEqual([other.mode, other.primaryId, other.secondaryId], ['dual-composited', '2', '1']);
  const swapped = planCameraCapture(androidReport(), { primaryFacing: 'front', secondaryFacing: 'back' });
  assert.deepEqual([swapped.primaryId, swapped.secondaryId], ['1', '0']);
  const none = planCameraCapture(androidReport([]));
  assert.deepEqual([none.mode, none.primaryId, none.reason], ['single', '0', 'no-concurrent-pair']);
  assert.equal(planCameraCapture(androidReport(), { want: 'single' }).reason, 'single-requested');
  assert.equal(planCameraCapture({ ...androidReport(), cameras: [] }).mode, 'none');
});

test('iOS MultiCam → two files composed in the editor; unsupported → single', () => {
  const dual = planCameraCapture(iosReport(true));
  assert.deepEqual([dual.mode, dual.composition], ['dual-separate', 'editor']);
  assert.match(dual.primaryId, /:0$/);
  const single = planCameraCapture(iosReport(false));
  assert.deepEqual([single.mode, single.reason], ['single', 'multicam-unsupported']);
  const oneFacing = planCameraCapture({ ...iosReport(true), cameras: [iosReport().cameras[0]] });
  assert.equal(oneFacing.reason, 'one-camera');
});

test('PiP geometry keeps aspect, stays inside the frame and maps to CameraX NDC', () => {
  for (const corner of PIP_CORNERS) {
    const r = pipLayout({ corner, scale: 0.3, frameWidth: 1080, frameHeight: 1920 });
    assert.equal(r.w, r.h);
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 1 && r.y + r.h <= 1, corner);
  }
  const br = pipLayout({ corner: 'bottom-right', scale: 0.3, margin: 0.04, frameWidth: 1080, frameHeight: 1920 });
  assert.deepEqual(br, { corner: 'bottom-right', x: 0.66, y: 0.6775, w: 0.3, h: 0.3 });
  // These numbers are mirrored in the Kotlin JVM test (WivraMulticamPolicyTest).
  assert.deepEqual(toCameraXComposition(br), { offsetX: 0.62, offsetY: -0.655, scaleX: 0.3, scaleY: 0.3 });
  assert.deepEqual(toCameraXComposition({ x: 0, y: 0, w: 1, h: 1 }), { offsetX: 0, offsetY: 0, scaleX: 1, scaleY: 1 });
  assert.deepEqual(toEditorOverlay(br), { x: 0.81, y: 0.8275, scale: 0.3 });
  assert.equal(pipLayout({ scale: 5 }).w, 0.5);
  assert.equal(pipLayout({ scale: 0.01 }).w, 0.15);
  assert.throws(() => pipLayout({ corner: 'middle' }));
  assert.deepEqual(PIP_CORNERS.map(nextPipCorner), ['bottom-left', 'top-left', 'top-right', 'bottom-right']);
});

test('two separate takes become main video + PiP layer with the editor operations', () => {
  const project = createProject({ assets: [
    { id: 'back', duration: 20, name: 'back.mov' }, { id: 'front', duration: 19.5, name: 'front.mov' }
  ] });
  // Front camera started 120 ms after the back camera on the same clock.
  const r = applyPipComposition(project, {
    primaryAssetId: 'back', secondaryAssetId: 'front', primaryDurationS: 20, secondaryDurationS: 19.5,
    secondaryOffsetMs: 120, corner: 'top-left', scale: 0.3
  });
  assert.ok(r.ok, JSON.stringify(r));
  assert.equal(project.clips.length, 0, 'input project is not mutated');
  const [main] = r.project.clips;
  const [pip] = r.project.overlayClips;
  assert.deepEqual([main.asset_id, main.start, main.muted], ['back', 0, undefined]);
  assert.deepEqual([pip.asset_id, pip.start, pip.in, pip.out, pip.muted], ['front', 0.12, 0, 19.5, true]);
  assert.ok(pip.start + (pip.out - pip.in) <= 20 + 1e-9);
  // Secondary started 300 ms BEFORE: skip its head instead of shifting main.
  const early = buildPipEditorOps({ primaryAssetId: 'back', secondaryAssetId: 'front',
    primaryDurationS: 20, secondaryDurationS: 19.5, secondaryOffsetMs: -300 });
  assert.deepEqual([early.ops[1].start, early.ops[1].in, early.ops[1].out], [0, 0.3, 19.5]);
  // Secondary audio selected: overlay audible, main lane muted by real op.
  const sec = applyPipComposition(project, { primaryAssetId: 'back', secondaryAssetId: 'front',
    primaryDurationS: 20, secondaryDurationS: 19.5, audio: 'secondary' });
  assert.equal(sec.project.clips[0].muted, true);
  assert.equal(sec.project.overlayClips[0].muted, false);
  const silent = applyPipComposition(project, { primaryAssetId: 'back', secondaryAssetId: 'front',
    primaryDurationS: 20, secondaryDurationS: 19.5, audio: 'none' });
  assert.equal(silent.project.clips[0].muted, true);
  assert.equal(silent.project.overlayClips[0].muted, true);
  const apart = buildPipEditorOps({ primaryAssetId: 'back', secondaryAssetId: 'front',
    primaryDurationS: 5, secondaryDurationS: 5, secondaryOffsetMs: 6000 });
  assert.deepEqual([apart.ok, apart.reason], [false, 'no-overlap']);
  assert.throws(() => buildPipEditorOps({ primaryAssetId: 'a', secondaryAssetId: 'a', primaryDurationS: 1, secondaryDurationS: 1 }));
  assert.equal(applyPipComposition(project, { primaryAssetId: 'back', secondaryAssetId: 'missing',
    primaryDurationS: 20, secondaryDurationS: 3 }).ok, false);
});

test('one audio source; missing permission or input is explicit, not a silent mute take', () => {
  assert.deepEqual(chooseCaptureAudio({ micPermission: true }), { audio: 'selected', reason: 'ok' });
  assert.equal(chooseCaptureAudio({ micPermission: false }).warn, true);
  assert.equal(chooseCaptureAudio({ micPermission: true, selectedInputAvailable: false }).audio, 'system-default');
  assert.equal(chooseCaptureAudio({ wantSound: false }).reason, 'owner-chose-silent');
});

test('losing a camera mid-recording keeps the take and continues with the other camera', () => {
  let s = createMulticamSession(planCameraCapture(androidReport()));
  assert.deepEqual([s.phase, s.active], ['preview', ['0', '1']]);
  s = multicamReduce(s, { type: 'record-start' });
  assert.deepEqual(s.actions, [{ do: 'start-recording', take: 1, continuation: false }]);
  s = multicamReduce(s, { type: 'camera-lost', cameraId: '1', reason: 'disconnected' });
  assert.equal(s.phase, 'finalizing');
  assert.deepEqual(s.actions, [{ do: 'finalize-take', take: 1 }, { do: 'rebind-single', cameraId: '0' }]);
  assert.equal(s.mode, 'single');
  s = multicamReduce(s, { type: 'take-finalized', verified: true, bytes: 9_000_000, durationMs: 12_000, mode: 'dual-composited' });
  assert.equal(s.phase, 'recording');
  assert.deepEqual(s.takes, [{ take: 1, status: 'kept', durationMs: 12_000, mode: 'dual-composited' }]);
  assert.deepEqual(s.actions, [{ do: 'start-recording', take: 2, continuation: true }]);
  // The front camera returns: do not interrupt the running take.
  s = multicamReduce(s, { type: 'camera-restored', cameraId: '1' });
  assert.equal(s.dualAvailableAgain, true);
  assert.deepEqual(s.actions, []);
  s = multicamReduce(s, { type: 'record-stop' });
  s = multicamReduce(s, { type: 'take-finalized', verified: true, bytes: 1, durationMs: 4000 });
  assert.equal(s.phase, 'preview');
  assert.deepEqual(s.takes.map(t => t.status), ['kept', 'kept']);
});

test('losing the last camera stops safely; unverified bytes are kept for review', () => {
  let s = createMulticamSession({ mode: 'single', primaryId: '0' });
  s = multicamReduce(s, { type: 'record-start' });
  s = multicamReduce(s, { type: 'camera-lost', cameraId: '0', reason: 'in-use' });
  assert.deepEqual(s.actions, [{ do: 'finalize-take', take: 1 }, { do: 'release-cameras' }]);
  s = multicamReduce(s, { type: 'take-finalized', verified: false, bytes: 4096 });
  assert.equal(s.phase, 'stopped');
  assert.equal(s.takes[0].status, 'needs-review');
  assert.ok(!s.actions.some(a => a.do === 'start-recording'));
  // Empty placeholder after a failed start is the only thing removed.
  let e = createMulticamSession({ mode: 'single', primaryId: '0' });
  e = multicamReduce(multicamReduce(e, { type: 'record-start' }), { type: 'record-stop' });
  e = multicamReduce(e, { type: 'take-finalized', verified: false, bytes: 0 });
  assert.deepEqual(e.actions, [{ do: 'delete-empty-placeholder', take: 1 }]);
  // Unknown events and cameras are ignored without state damage.
  assert.equal(multicamReduce(e, { type: 'camera-lost', cameraId: 'zz' }).phase, 'preview');
  assert.equal(multicamReduce(e, { type: 'nonsense' }).phase, 'preview');
  // Camera lost in preview: rebind remaining camera, no recording started.
  let p = createMulticamSession(planCameraCapture(androidReport()));
  p = multicamReduce(p, { type: 'camera-lost', cameraId: '0', reason: 'thermal' });
  assert.deepEqual([p.phase, p.actions], ['preview', [{ do: 'rebind-single', cameraId: '1' }]]);
  p = multicamReduce(p, { type: 'camera-restored', cameraId: '0' });
  assert.deepEqual(p.actions, [{ do: 'replan' }]);
});

test('phone + glasses need runtime concurrent evidence; otherwise phone alone', () => {
  const ev = (id, extra = {}) => ({ provenance: 'runtime', sessionId: id, permissionGranted: true,
    validFrames: 30, measuredFPS: 30, width: 1280, height: 720, lastFrameAgeSeconds: 0.1, ...extra });
  let phone = createSourceCandidate({ id: 'phone-back', kind: 'phone-camera', outputModes: ['local-frames', 'recorded-media'] });
  let glasses = createSourceCandidate({ id: 'meta-gen2', kind: 'meta-dat', outputModes: ['local-frames', 'recorded-media'] });
  phone = applyEvidence(phone, 'cameraFrames', ev('s1'));
  const notYet = planPhoneWithWearable(phone, glasses, { compositorValidated: true });
  assert.deepEqual([notYet.mode, notYet.sources, notYet.reason], ['single', ['phone-back'], 'unverified-local-frames']);
  glasses = applyEvidence(glasses, 'cameraFrames', ev('s1'));
  const noConcurrency = planPhoneWithWearable(phone, glasses, { compositorValidated: true });
  assert.equal(noConcurrency.reason, 'source-concurrency-unverified');
  const conc = { vendorCapabilityExposed: true, simultaneousFrameSources: 2, compositorValidated: true };
  phone = applyEvidence(phone, 'concurrentVideo', ev('s1', conc));
  glasses = applyEvidence(glasses, 'concurrentVideo', ev('s1', conc));
  assert.equal(planPhoneWithWearable(phone, glasses).reason, 'concurrency-not-validated');
  const ok = planPhoneWithWearable(phone, glasses, { compositorValidated: true });
  assert.deepEqual([ok.mode, ok.composition], ['dual-separate', 'editor']);
});

test('screen capture needs this session’s system consent; iOS recording not offered yet', () => {
  assert.equal(screenCaptureGate({ platform: 'android' }).allowed, false);
  assert.equal(screenCaptureGate({ platform: 'android', sessionId: 's9', consentResult: { granted: true, sessionId: 's8' } }).allowed, false);
  assert.equal(screenCaptureGate({ platform: 'android', sessionId: 's9', consentResult: { granted: true, sessionId: 's9' } }).allowed, true);
  assert.equal(screenCaptureGate({ platform: 'ios', purpose: 'recording', sessionId: 's9', consentResult: { granted: true, sessionId: 's9' } }).reason, 'not-implemented-ios');
  assert.equal(screenCaptureGate({ platform: 'web' }).allowed, false);
});
