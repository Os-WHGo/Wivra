import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const camera = readFileSync(new URL('../ios/B0/Sources/WivraIPhoneCamera.swift', import.meta.url), 'utf8');
const app = readFileSync(new URL('../ios/B0/Sources/WivraMetaB0App.swift', import.meta.url), 'utf8');
const library = readFileSync(new URL('../ios/B0/Sources/WivraNativeCaptureLibrary.swift', import.meta.url), 'utf8');

test('unified iOS app exposes an actual iPhone camera alongside Meta capture', () => {
  assert.match(app, /WivraIPhoneCameraScreen\(camera: iPhoneCamera\)/);
  assert.match(app, /requestCaptureTab\(/);
  assert.match(camera, /AVCaptureSession\(\)/);
  assert.match(camera, /AVCaptureMovieFileOutput\(\)/);
});

test('iPhone video only reports a saved take after a nonempty MOV and manifest', () => {
  assert.match(camera, /movieOutput\.startRecording\(to: url, recordingDelegate: self\)/);
  assert.match(camera, /movieOutput\.stopRecording\(\)/);
  assert.match(camera, /attributesOfItem\(atPath: url\.path\)\[\.size\]/);
  assert.match(camera, /lastCaptureManifestURL = try WivraCaptureManifest\.write\(/);
  assert.match(camera, /cameraSource: "iphone-avfoundation"/);
  assert.match(library, /m\.cameraSource == "iphone-avfoundation"/);
});

test('iPhone MOV does not claim to have an independent audio sidecar', () => {
  assert.match(camera, /videoURL: url, tracks: \[\], mergedURL: nil/);
});
