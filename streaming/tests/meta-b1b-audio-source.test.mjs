import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = (name) => readFileSync(new URL('../ios/B0/'+name, import.meta.url), 'utf8');
test('B1D only uses explicitly selected active audio input', () => {
  const route = read('Sources/WivraAudioRoute.swift');
  assert.match(route, /AVAudioApplication\.requestRecordPermission\(\)/);
  assert.match(route, /setPreferredInput\(input\)/);
  assert.match(route, /currentRoute\.inputs\.contains/);
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
  assert.match(view, /Grabar pista de audio independiente/);
  assert.match(view, /Detectar entradas de audio/);
  assert.match(view, /Preparar micrófono seleccionado/);
  assert.match(view, /Compartir pista de audio independiente/);
  assert.match(view, /Compartir MOV con audio integrado/);
  assert.match(view, /Compartir manifiesto del proyecto Wivra/);
});

test('B1C writes schemaVersion 2 with measured audio properties and only recorded tracks', () => {
  const manifest = read('Sources/WivraCaptureManifest.swift');
  const sidecar = read('Sources/WivraAudioSidecar.swift');
  const model = read('Sources/MetaB0Model.swift');
  assert.match(manifest, /schemaVersion: 2/);
  assert.match(manifest, /let tracks: \[WivraCaptureTrack\]/);
  assert.match(manifest, /muxedFromTrackIDs/);
  assert.match(manifest, /if let audioURL/);
  assert.match(manifest, /channelIndex: Int\?/);
  assert.match(manifest, /sampleRateHz: Double\?/);
  assert.match(sidecar, /channelCount: Int/);
  assert.match(model, /audioSampleRateHz: sound\?\.sampleRate/);
  assert.match(model, /audioChannelCount: sound\?\.channelCount/);
});

test('B1D stores the exact selected source, never a pretend DJI track', () => {
  const model = read('Sources/MetaB0Model.swift');
  const manifest = read('Sources/WivraCaptureManifest.swift');
  const ui = read('Sources/WivraMetaB0App.swift');
  assert.match(model, /selectedAudioSourceKind = audioRoute.selectedSource/);
  assert.match(model, /audioSource: selectedAudioSourceKind/);
  assert.match(manifest, /source: audioSource, file: audioURL.lastPathComponent/);
  assert.match(ui, /ForEach\(model.audioRoute.ports\)/);
  assert.match(model, /!audioRoute.hasSelectedRoute/);
  assert.match(read('Sources/WivraAudioRoute.swift'), /if hasSelectedRoute/);
});

test('B1D two real USB PCM channels are represented as separate logical tracks', () => {
  const m = read('Sources/WivraCaptureManifest.swift');
  assert.match(m, /audioSource == "ios-usb-audio" && audioChannelCount == 2/);
  assert.match(m, /tracks = \(0\.\.<2\)\.map/);
  assert.match(m, /channelIndex: channel/);
  assert.match(m, /role: "other"/);
});

test('B1E captures first saved PCM sample hostTime and keeps unknown sync unknown', () => {
  const sidecar = read('Sources/WivraAudioSidecar.swift');
  const video = read('Sources/WivraHEVCRecorder.swift');
  const model = read('Sources/MetaB0Model.swift');
  const mux = read('Sources/WivraLocalMux.swift');
  assert.match(sidecar, /input\.installTap\(onBus: 0, bufferSize: 1024, format: format\) \{ buffer, time in/);
  assert.match(sidecar, /time\.isHostTimeValid/);
  assert.match(sidecar, /AVAudioTime\.seconds\(forHostTime: time\.hostTime\)/);
  assert.match(sidecar, /if !firstBufferWritten/);
  assert.doesNotMatch(sidecar, /startTime = CACurrentMediaTime\(\)/);
  assert.match(video, /let receivedAtUptime = CACurrentMediaTime\(\)/);
  assert.match(video, /if input\.append\(adjusted\) \{[\s\S]*?if appendedCount == 0 \{ videoStartUptime = receivedAtUptime \}/);
  assert.match(model, /if let firstVideoClock, let firstAudioClock = sound\.firstSampleUptime/);
  assert.match(model, /let offset = firstAudioClock - firstVideoClock/);
  assert.match(model, /no se combinó automáticamente/);
  assert.match(mux, /let trimSeconds = max\(0, -safeOffset\)/);
  assert.match(mux, /let insertSeconds = max\(0, safeOffset\)/);
});

test('B1E signed timing convention is consistent with schema and offset arithmetic', () => {
  const spec = JSON.parse(readFileSync(new URL('../contracts/wivra-manifest-v2.schema.json', import.meta.url), 'utf8'));
  const top = spec.properties.audioStartOffsetSeconds.description;
  const track = spec.$defs.track.properties.startOffsetSeconds.description;
  assert.match(top, /positive.*later/i);
  assert.match(top, /negative.*earlier/i);
  assert.match(track, /positive.*later/i);
  assert.match(track, /negative.*earlier/i);
  const offset = (audio, video) => audio - video;
  assert.equal(offset(105.25, 105.00), 0.25, 'audio delayed');
  assert.ok(Math.abs(offset(104.75, 105.00) + 0.25) < 1e-9, 'audio early');
});
