import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static contract only: hardware exposure requires a supported iPhone.
const read = file => readFileSync(new URL('../ios/B0/' + file, import.meta.url), 'utf8');

test('B1I derives slow shutter from actual per-lens AVCaptureDevice format', () => {
  const camera = read('Sources/WivraIPhoneCamera.swift');
  assert.match(camera, /activeFormat\.maxExposureDuration/);
  assert.match(camera, /hardwareMaximum\.isFinite/);
  assert.match(camera, /min\(8\.0, max\(1\.0 \/ 30\.0, hardwareMaximum\)\)/);
  assert.match(camera, /supportsNightPhoto = supportsManualExposure && maxNightPhotoExposureSeconds/);
  assert.match(camera, /setExposureModeCustom/);
});

test('B1I gates slow shutter to Pro stills and blocks movie recording', () => {
  const camera = read('Sources/WivraIPhoneCamera.swift');
  const ui = read('Sources/WivraIPhoneCameraScreen.swift');
  assert.match(camera, /func setNightPhotoMode\(_ enabled: Bool\)/);
  assert.match(camera, /guard isRunning && !isRecording && !isFinishing && !photoBusy/);
  assert.match(camera, /proMode && supportsManualExposure/);
  assert.match(camera, /let limit = nightPhotoMode \? maxNightPhotoExposureSeconds : 1\.0 \/ 30\.0/);
  assert.match(camera, /guard !nightPhotoMode else \{/);
  assert.match(ui, /iphone_night_photo_mode/);
  assert.match(ui, /\.disabled\(!camera\.isRunning \|\| camera\.isFinishing \|\| camera\.photoBusy \|\| camera\.nightPhotoMode\)/);
  assert.match(camera, /nightPhotoMode = false/);
});

test('B1I preserves original JPEG and makes no Ray-Ban manual exposure claims', () => {
  const camera = read('Sources/WivraIPhoneCamera.swift');
  const ui = read('Sources/WivraIPhoneCameraScreen.swift');
  assert.match(camera, /bytes\.write\(to: url, options: \.atomic\)/);
  assert.match(camera, /lastPhotoURL = url/);
  assert.match(ui, /No es Night mode computacional, RAW ni apilado de estrellas/);
  assert.match(ui, /solo en Pro y sin MOV/);
  assert.doesNotMatch(camera, /MetaB0Model|MWDATCamera|Wearables/);
});

test.todo('DEVICE: exposure metadata matches 0.5–8 s on supported iPhone');
test.todo('DEVICE: video is blocked during slow still; normal MOV plus photos works after exit');
test.todo('DEVICE: change lenses, permissions, background, thermal/battery limits');
