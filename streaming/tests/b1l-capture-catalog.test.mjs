import test from 'node:test';
import assert from 'node:assert/strict';
import { indexCaptureBatches } from '../library/capture-catalog.mjs';

const iphone = (id, at, overrides = {}) => ({
  schemaVersion: 2, captureID: id, cameraSource: 'iphone-avfoundation',
  audioSource: 'none', originalVideoFile: id + '.mov', muxedVideoFile: null,
  createdAtISO8601: at, tracks: [], muxedFromTrackIDs: [], ...overrides
});
const meta = {
  ...iphone('walk', '2026-10-15T23:15:00Z'),
  cameraSource: 'meta-dat-hevc', audioSource: 'ios-bluetooth-hfp',
  originalVideoFile: 'walk-original.mov', muxedVideoFile: 'walk-synced.mov',
  tracks: [{ id: 'voice', kind: 'audio', role: 'voice_primary', source: 'ios-bluetooth-hfp', file: 'walk.caf', channelIndex: null }],
  muxedFromTrackIDs: ['voice']
};

test('B1L catalog: multiple days are grouped in an explicitly chosen timezone, not guessed from UTC', () => {
  const r = indexCaptureBatches([
    { manifest: iphone('a', '2026-10-15T02:30:00Z'), files: ['a.mov'] },
    { manifest: iphone('b', '2026-10-15T19:00:00Z'), files: ['b.mov'] },
    { manifest: iphone('c', '2026-10-16T18:30:00Z'), files: ['c.mov'] }
  ], { timeZone: 'America/Vancouver' });
  assert.deepEqual(r.days.map(x => [x.date, x.dayNumber, x.count]), [
    ['2026-10-14', 1, 1], ['2026-10-15', 2, 1], ['2026-10-16', 3, 1]
  ]);
  assert.deepEqual(r.rejected, []);
  assert.equal(r.captures[0].embeddedAudioInOriginal, 'unknown');
  assert.equal(r.captures[0].declaredAudioTracks, 0);
});
test('B1L catalog: manifests can use existing muxed MOV if original is missing without inventing CAF duplication', () => {
  const r = indexCaptureBatches([{ manifest: meta, files: ['walk-synced.mov', 'walk.caf'] }]);
  assert.equal(r.captures[0].availableVideo, 'walk-synced.mov');
  assert.deepEqual(r.captures[0].embeddedMuxedTrackIDs, ['voice']);
  assert.deepEqual(r.captures[0].missing, ['walk-original.mov']);
  assert.equal(r.captures[0].readyToInspect, true);
  assert.equal(r.captures[0].requiresAttention, true);
});
test('B1L catalog: same source audio file in two channels is counted once, never materialized twice', () => {
  const m = { ...meta, tracks: [
    { ...meta.tracks[0], id: 'left', channelIndex: 0 },
    { ...meta.tracks[0], id: 'right', channelIndex: 1 }
  ], muxedFromTrackIDs: ['left', 'right'] };
  const r = indexCaptureBatches([{ manifest: m, files: ['walk-original.mov', 'walk-synced.mov', 'walk.caf'] }]);
  assert.deepEqual(r.captures[0].sidecarAudioFiles, ['walk.caf']);
  assert.equal(r.captures[0].declaredAudioTracks, 2);
});
test('B1L catalog: invalid paths, duplicate IDs and timezone-free timestamps are rejected', () => {
  const r = indexCaptureBatches([
    { manifest: iphone('same', '2026-10-15T20:00:00Z'), files: ['same.mov'] },
    { manifest: iphone('same', '2026-10-15T20:00:01Z'), files: ['same.mov'] },
    { manifest: iphone('escape', '2026-10-15T20:00:00Z', { originalVideoFile: '../bad.mov' }), files: ['../bad.mov'] },
    { manifest: iphone('naive', '2026-10-15T20:00:00'), files: ['naive.mov'] }
  ]);
  assert.equal(r.captures.length, 1);
  assert.equal(r.rejected.length, 3);
  assert.throws(() => indexCaptureBatches([], { timeZone: 'Not/AZone' }), RangeError);
});
test('B1L catalog: missing all videos never shows ready, but never deletes metadata', () => {
  const r = indexCaptureBatches([{ manifest: meta, files: [] }]);
  assert.equal(r.captures.length, 1);
  assert.equal(r.captures[0].readyToInspect, false);
  assert.deepEqual(r.captures[0].missing, ['walk-original.mov', 'walk-synced.mov', 'walk.caf']);
});
