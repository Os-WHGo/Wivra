import test from 'node:test';
import assert from 'node:assert/strict';
import { parseManifest } from '../capture-manifest.mjs';

const v1 = { schemaVersion: 1, captureID: 'abc', cameraSource: 'meta-dat-hevc', audioSource: 'ios-bluetooth-hfp', selectedInputName: 'Ray-Ban', originalVideoFile: 'a.hevc', originalAudioFile: 'a.caf', muxedVideoFile: 'a.mov', audioStartOffsetSeconds: 0.12, createdAtISO8601: '2026-10-13T00:00:00Z' };
const v2 = { schemaVersion: 2, captureID: 'x', cameraSource: 'meta-dat-hevc', originalVideoFile: 'a.hevc', tracks: [
  { id: 't1', role: 'voice-host', file: 'host.wav', source: 'dji-mic', sampleRate: 48000, channels: 1, offsetSeconds: 0.1 },
  { id: 't2', role: 'voice-guest', file: 'guest.wav', sampleRate: 48000 },
  { id: 't3', role: 'scratch', file: 'a.caf', sampleRate: 8000 }] };

test('v1 real del PR #48 se normaliza a una pista scratch', () => {
  const r = parseManifest(v1); assert.ok(r.ok);
  assert.equal(r.manifest.tracks.length, 1); assert.equal(r.manifest.tracks[0].role, 'scratch'); assert.equal(r.manifest.tracks[0].offsetSeconds, 0.12);
  assert.equal(r.manifest.sourceVersion, 1); assert.equal(r.manifest.muxedVideoFile, 'a.mov');
});
test('v1 sin audio da cero pistas', () => { const r = parseManifest({ ...v1, originalAudioFile: null, audioStartOffsetSeconds: null }); assert.ok(r.ok); assert.equal(r.manifest.tracks.length, 0); });
test('v2 con 3 pistas es válido y acepta texto JSON', () => { const r = parseManifest(JSON.stringify(v2)); assert.ok(r.ok); assert.deepEqual(r.manifest.tracks.map((t) => t.role), ['voice-host', 'voice-guest', 'scratch']); });
test('rechaza rutas con carpetas o ..', () => {
  assert.equal(parseManifest({ ...v1, originalVideoFile: '../x.hevc' }).ok, false);
  assert.equal(parseManifest({ ...v2, tracks: [{ id: 't', role: 'music', file: 'a/b.wav' }] }).ok, false);
});
test('rechaza ids repetidos, rol inválido, sampleRate raro y versión desconocida', () => {
  assert.equal(parseManifest({ ...v2, tracks: [{ id: 't', role: 'music', file: 'a.wav' }, { id: 't', role: 'music', file: 'b.wav' }] }).ok, false);
  assert.equal(parseManifest({ ...v2, tracks: [{ id: 't', role: 'dj', file: 'a.wav' }] }).ok, false);
  assert.equal(parseManifest({ ...v2, tracks: [{ id: 't', role: 'music', file: 'a.wav', sampleRate: 5 }] }).ok, false);
  assert.equal(parseManifest({ ...v1, schemaVersion: 9 }).ok, false);
  assert.equal(parseManifest('{no json').ok, false);
});
