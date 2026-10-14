import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (name) => readFileSync(new URL('../ios/B0/'+name, import.meta.url), 'utf8');
test('B1B only uses explicitly selected active Bluetooth HFP input', () => {
  const route = read('Sources/WivraAudioRoute.swift');
  assert.match(route, /AVAudioApplication\.requestRecordPermission\(\)/);
  assert.match(route, /setPreferredInput\(input\)/);
  assert.match(route, /currentRoute\.inputs\.contains/);
  assert.match(route, /portType == \.bluetoothHFP/);
  assert.match(route, /throw WivraAudioRouteError\.routeRejected/);
});
test('B1B records user-consented audio to separate CAF track', () => {
  const audio = read('Sources/WivraAudioSidecar.swift');
  assert.match(audio, /AVAudioEngine/);
  assert.match(audio, /installTap\(onBus: 0/);
  assert.match(audio, /AVAudioFile\(forWriting:/);
  assert.match(audio, /file\.write\(from: buffer\)/);
  assert.match(audio, /"Wivra_Audio_"/);
  assert.match(audio, /firstSampleUptime/);
  assert.match(read('Info.plist'), /NSMicrophoneUsageDescription/);
});
test('B1B mux preserves originals, applies signed offset, and verifies export', () => {
  const mux = read('Sources/WivraLocalMux.swift');
  assert.match(mux, /AVMutableComposition/);
  assert.match(mux, /AVAssetExportPresetPassthrough/);
  assert.match(mux, /audioStartOffset/);
  assert.match(mux, /exportAsynchronously/);
  assert.match(mux, /attributesOfItem\(atPath:/);
});
test('Wivra persists a local manifest for eventual single editor import', () => {
  const manifest = read('Sources/WivraCaptureManifest.swift');
  const model = read('Sources/MetaB0Model.swift');
  assert.match(manifest, /originalVideoFile/);
  assert.match(manifest, /originalAudioFile/);
  assert.match(manifest, /muxedVideoFile/);
  assert.match(manifest, /audioStartOffsetSeconds/);
  assert.match(model, /WivraCaptureManifest\.write/);
  assert.match(model, /lastCombinedVideoURL = combined/);
});
test('UI keeps RAW preview plus explicit audio select and all export paths', () => {
  const view = read('Sources/WivraMetaB0App.swift');
  assert.match(view, /B0 · Vista previa/);
  assert.match(view, /Grabar audio desde las Ray-Ban/);
  assert.match(view, /Buscar micrófonos Bluetooth HFP/);
  assert.match(view, /Compartir pista de audio independiente/);
  assert.match(view, /Compartir MOV con audio integrado/);
  assert.match(view, /Compartir manifiesto del proyecto Wivra/);
});
