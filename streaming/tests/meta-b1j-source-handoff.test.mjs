import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Compile-time and static behavioral guards. Tests cannot replace real iPhone
// or Ray-Ban Meta tests for I/O completion and AVSession exclusivity.
const read = file => readFileSync(new URL('../ios/B0/Sources/' + file, import.meta.url), 'utf8');

test('B1J waits for Meta audio/video and capture manifest before releasing DAT', () => {
  const meta = read('MetaB0Model.swift');
  assert.match(meta, /private var endSessionAfterRecording = false/);
  assert.match(meta, /if recordingArmed \|\| recordingFinishing \{/);
  assert.match(meta, /endSessionAfterRecording = true/);
  assert.match(meta, /if endSessionAfterRecording \{\s+endSession\(\)/);
  assert.match(meta, /lastCaptureManifestURL = try WivraCaptureManifest.write/);
  assert.match(meta, /recordingFinishing = false/);
  assert.match(meta, /deviceSession == nil && camera == nil && !recordingArmed/);
  assert.match(meta, /!recordingFinishing && \(sessionState == \.idle \|\| sessionState == \.stopped\)/);
});

test('B1J releases iPhone only after MOV/photo callbacks and real stopRunning()', () => {
  const camera = read('WivraIPhoneCamera.swift');
  assert.match(camera, /private\(set\) var isStopping = false/);
  assert.match(camera, /var isReleasedForCameraHandoff: Bool/);
  assert.match(camera, /!isRunning && !isStarting && !isRecording && !isFinishing/);
  assert.match(camera, /!isStopping && !photoBusy/);
  assert.match(camera, /if isRecording \{\s+isStopping = true/);
  assert.match(camera, /if isFinishing \{\s+isStopping = true/);
  assert.match(camera, /runner\.stop \{ \[weak self\] in/);
  assert.match(camera, /self\.isStopping = false/);
});

test('B1J tab switches are gated and share the same iPhone camera model', () => {
  const app = read('WivraMetaB0App.swift');
  const ui = read('WivraIPhoneCameraScreen.swift');
  assert.match(app, /@State private var pendingCaptureTab: WivraCaptureTab\?/);
  assert.match(app, /@State private var iPhoneCamera = WivraIPhoneCamera\(\)/);
  assert.match(app, /guard destination != captureTab, pendingCaptureTab == nil else \{ return \}/);
  assert.match(app, /set: \{ requestCaptureTab\(\$0\) \}/);
  assert.match(app, /WivraIPhoneCameraScreen\(camera: iPhoneCamera\)/);
  assert.match(app, /completeCameraHandoffIfReady\(\)/);
  assert.match(app, /camera_handoff_pending/);
  assert.match(ui, /@Bindable var camera: WivraIPhoneCamera/);
  assert.doesNotMatch(app, /\.onChange\(of: captureTab\)/);
});

test.todo('DEVICE: record HEVC + CAF and tap iPhone while mux/manifest is still finishing');
test.todo('DEVICE: record MOV and switch to Meta before fileOutput didFinishRecording callback');
test.todo('DEVICE: switch while permissions are pending and while still JPEG is in flight');
test.todo('DEVICE: background/foreground and rapid repeated tab taps never overlap capture sessions');
