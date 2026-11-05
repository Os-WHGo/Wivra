// iOS two-camera capture: source contract. Static checks only; compiling and
// the macOS policy smoke run in CI; nothing here proves an iPhone records. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pipLayout, toEditorOverlay } from '../../core/multicam-plan.mjs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const src = '../ios/B0/Sources/';
const capture = read(src + 'WivraMultiCamCapture.swift');
const policy = read(src + 'WivraMultiCamPolicy.swift');
const screen = read(src + 'WivraMultiCamScreen.swift');
const camScreen = read(src + 'WivraIPhoneCameraScreen.swift');
const smoke = read('./WivraMultiCamPolicySmoke.swift');
const workflow = read('../../.github/workflows/meta-b0-native-build.yml');

test('MultiCam only when this iPhone supports it and the session cost fits', () => {
  assert.match(capture, /AVCaptureMultiCamSession\.isMultiCamSupported && !forceSingle/);
  assert.match(capture, /hardwareCost: multi\.hardwareCost, systemPressureCost: multi\.systemPressureCost/);
  assert.match(policy, /cost > 1\.0 \{ return Plan\(dual: false, reason: "hardware-cost"\)/);
  assert.match(capture, /addInputWithNoConnections/);
  assert.match(capture, /AVCaptureConnection\(inputPorts: \[port\], output: output\)/);
  assert.match(capture, /configureSingle\(position: primaryPos, microphone: microphone\)/);
});

test('one microphone, only into the main movie', () => {
  assert.equal([...capture.matchAll(/AVCaptureConnection\(inputPorts: \[port\], output: mainOut\)/g)].length, 1);
  assert.doesNotMatch(capture, /output: insetOut\)[\s\S]{0,40}audio/);
  assert.match(capture, /audio: includesAudio \? "primary" : "none"/);
});

test('loss or pressure closes files, keeps bytes and continues with one camera', () => {
  assert.match(capture, /if reasonRaw == 5 \{/);
  assert.match(capture, /restartSession\(thenRecord: true\)/);
  assert.match(capture, /startRecording\(isContinuation: true\)/);
  // Only zero-byte files are removed.
  assert.equal([...capture.matchAll(/removeItem/g)].length, 2);
  assert.match(capture, /if insetStatus == \.empty \{ try\? FileManager\.default\.removeItem\(at: b\) \}/);
  assert.match(capture, /if mainStatus == \.empty \{ try\? FileManager\.default\.removeItem\(at: a\) \}/);
  assert.match(policy, /if bytes <= 0 \{ return \.empty \}/);
  for (const n of ['AVCaptureSessionWasInterruptedNotification', 'AVCaptureSessionRuntimeErrorNotification', 'AVCaptureSessionInterruptionEndedNotification']) {
    assert.match(screen, new RegExp(n));
  }
  assert.match(screen, /didEnterBackgroundNotification[\s\S]{0,40}capture\.stop\(\)/);
});

test('pair receipt carries the start offset for the editor PiP; geometry matches JS', () => {
  assert.match(policy, /schema = "wivra-multicam-take-v1"/);
  assert.match(capture, /offset = \(tb - ta\) \* 1000/);
  const o = toEditorOverlay(pipLayout({ corner: 'bottom-right' }));
  assert.match(smoke, new RegExp(`o\\.x == ${o.x} && o\\.y == ${o.y} && o\\.scale == ${o.scale}`));
  assert.match(workflow, /WivraMultiCamPolicySmoke\.swift/);
});

test('entry only after the iPhone camera released AVFoundation; files stay local', () => {
  assert.match(camScreen, /\.disabled\(!camera\.isReleasedForCameraHandoff\)\s*\.accessibilityIdentifier\("iphone_multicam_entry"\)/);
  assert.match(camScreen, /WivraMultiCamScreen\(\)/);
  assert.match(capture, /appendingPathComponent\("WivraIPhoneMedia", isDirectory: true\)/);
  assert.doesNotMatch(capture + screen, /URLSession|http:|https:|PHPhotoLibrary/);
});
