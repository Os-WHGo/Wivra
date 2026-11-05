// W63 unified beta contracts: Claude multicamera + LIVE scenes coexist with
// ChatGPT/Codex recoverable capture, LIVE and Photos journal. QA source only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCameraInventory, planCameraCapture } from '../../core/multicam-plan.mjs';
import { createSceneState, liveSceneReduce, layoutScene } from '../../core/live-scenes.mjs';

const swift = name => readFileSync(new URL('../ios/B0/Sources/' + name, import.meta.url), 'utf8');
const android = name => readFileSync(new URL('../android/app/src/full/java/com/oswhgo/wivra/' + name, import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../../.github/workflows/meta-b0-native-build.yml', import.meta.url), 'utf8');

test('W63: dual camera is never falsely enabled from an unverified inventory', () => {
  const base = { platform: 'android', cameras: [
    { id: 'back1', facing: 'back' }, { id: 'front1', facing: 'front' }
  ], concurrentPairs: [['back1', 'front1']], multiCamSupported: true };
  const unverified = normalizeCameraInventory(base);
  assert.equal(unverified.runtime, false);
  assert.equal(planCameraCapture(unverified).mode, 'single');
  const verified = normalizeCameraInventory({ ...base, provenance: 'runtime', sessionId: 'camera-session-1' });
  assert.equal(planCameraCapture(verified).mode, 'dual-composited');
});

test('W63: LIVE scenes never publish unloaded media and return to camera at end', () => {
  let s = createSceneState({ cameraLayer: true });
  s = liveSceneReduce(s, { type: 'select', scene: 'camera-video' });
  assert.equal(s.current, 'camera');
  s = liveSceneReduce(s, { type: 'source-loaded', source: 'video' });
  s = liveSceneReduce(s, { type: 'select', scene: 'camera-video' });
  assert.equal(s.current, 'camera-video');
  s = liveSceneReduce(s, { type: 'media-ended', source: 'video' });
  assert.equal(s.current, 'camera');
  assert.ok(s.notices.some(n => n.kind === 'fallback-video-ended'));
  assert.equal(layoutScene('image').micMuted, true);
});

test('W63: optional iOS scenes do not override LIVE consent, recording intent or guarded Photos', () => {
  const live = swift('WivraIPhoneLiveScreen.swift');
  const scenes = swift('WivraLiveScenes.swift');
  const receipt = swift('WivraLiveRecordingReceipt.swift');
  const journal = swift('WivraPhotosSaveJournal.swift');
  assert.match(scenes, /var enabled = false/);
  assert.match(live, /if let scenes, scenes.enabled \{ await scenes.attach\(to: capture\) \}/);
  assert.match(live, /WivraLiveRecordingReceipt.stage\(/);
  assert.ok(live.indexOf('WivraLiveRecordingReceipt.stage(') <
            live.indexOf('try await writer.startRecording(file, settings: settings)'));
  assert.match(receipt, /FileManager\.default\.linkItem\(at: temporary, to: receipt\)/);
  assert.match(live, /WivraPhotosSaveJournal\.shared\.reviewStatus\(for: file\)/);
  assert.match(journal, /inFlightHashes\.contains\(hash\)/);
  assert.match(live, /Button\("INICIAR LIVE"\)/);
  assert.match(live, /generation == current, phase == \.connecting/);
});

test('W63: Android scene filters reattach on renewed preview; native CI keeps both safety gates', () => {
  const host = android('WivraPhoneLiveActivity.kt');
  assert.match(host, /publisher\.startPreview\(preview\)\s*scenes\.reattach\(\)/);
  assert.match(host, /scenes\.bind\(publisher\)/);
  assert.match(workflow, /Verify iOS multicamera policy and pair receipt/);
  assert.match(workflow, /Verify iOS LIVE scene layout/);
  assert.match(workflow, /Verify iOS LIVE audio-intent recovery/);
  assert.match(workflow, /Verify active Photos reservations against immutable pre-fix control/);
});
