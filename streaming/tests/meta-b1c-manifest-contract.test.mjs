import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const here = new URL('../contracts/', import.meta.url);
const spec = JSON.parse(readFileSync(new URL('wivra-manifest-v2.schema.json', here), 'utf8'));
const examples = JSON.parse(readFileSync(new URL('manifest-v2-fixtures.json', here), 'utf8'));
const swift = readFileSync(new URL('../ios/B0/Sources/WivraCaptureManifest.swift', import.meta.url), 'utf8');

const simple = s => typeof s === 'string' && s.length > 0 && s !== '.' && s !== '..' &&
  !(/[\\/\x00\r\n]/.test(s)) && s.length <= 255;
const good = n => typeof n === 'number' && Number.isFinite(n);
function checkManifest(m) {
  assert.equal(m.schemaVersion, 2);
  assert.equal(typeof m.captureID, 'string');
  assert.ok(simple(m.originalVideoFile));
  assert.ok(m.muxedVideoFile == null || simple(m.muxedVideoFile));
  assert.ok(Array.isArray(m.tracks));
  assert.ok(Array.isArray(m.muxedFromTrackIDs));
  const ids = new Set(), channels = new Map();
  for (const t of m.tracks) {
    assert.equal(t.kind, 'audio');
    assert.ok(spec.$defs.track.properties.role.enum.includes(t.role), 'canonical role: '+t.role);
    assert.ok(simple(t.file));
    assert.ok(!ids.has(t.id), 'duplicate track id');
    ids.add(t.id);
    if(t.channelIndex != null) {
      assert.ok(Number.isInteger(t.channelIndex) && t.channelIndex >= 0);
      if(t.channelCount != null) assert.ok(t.channelIndex < t.channelCount);
    }
    if (t.sampleRateHz != null) assert.ok(good(t.sampleRateHz) && t.sampleRateHz > 0);
    if (t.channelCount != null) assert.ok(Number.isInteger(t.channelCount) && t.channelCount > 0);
    if (t.startOffsetSeconds != null) assert.ok(good(t.startOffsetSeconds));
    const prior = channels.get(t.file) ?? [];
    assert.ok(!prior.includes(null) && (t.channelIndex !== null && t.channelIndex !== undefined || prior.length === 0),
       'full-file track must not overlap channel tracks');
    assert.ok(!prior.includes(t.channelIndex ?? null), 'duplicate source file channel');
    prior.push(t.channelIndex ?? null);
    channels.set(t.file, prior);
  }
  assert.ok(m.muxedVideoFile != null || m.muxedFromTrackIDs.length === 0);
  for (const id of m.muxedFromTrackIDs) assert.ok(ids.has(id), 'mux references nonexistent track');
  assert.equal(new Set(m.muxedFromTrackIDs).size,m.muxedFromTrackIDs.length);
}

test('canonical JSON schema parses and describes Swift v2 fields', () => {
  assert.equal(spec.properties.schemaVersion.const, 2);
  assert.match(swift, /schemaVersion:\s*2/);
  for(const key of ['channelIndex','sampleRateHz','channelCount','startOffsetSeconds','muxedFromTrackIDs']) {
    assert.ok(spec.$defs.track.properties[key] || spec.properties[key]);
    assert.ok(swift.includes('let '+key+': '),'Swift missing wire field '+key);
  }
});

for (const entry of examples.cases) {
  test('synthetic v2 fixture: '+entry.name, () => checkManifest(entry.manifest));
}

test('canonical examples reject imaginary duplicate file/channel', () => {
  const m = structuredClone(examples.cases[1].manifest);
  m.tracks[1].channelIndex = 0;
  assert.throws(()=>checkManifest(m), /duplicate source file channel/);
});

test('canonical examples reject mux referencing missing audio', () => {
  const m=structuredClone(examples.cases[2].manifest);
  m.muxedFromTrackIDs=['phantom'];
  assert.throws(()=>checkManifest(m));
});

test('canonical examples reject path traversal', () => {
  const m=structuredClone(examples.cases[0].manifest);
  m.tracks[0].file='../elsewhere.wav';
  assert.throws(()=>checkManifest(m));
});
