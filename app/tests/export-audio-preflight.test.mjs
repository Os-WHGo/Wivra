import test from 'node:test';
import assert from 'node:assert/strict';
import { preflightExportMedia } from '../export.mjs';

const video = { asset_id: 'v', start: 0, in: 0, out: 9 };
const voice = { asset_id: 'voice', start: 0, in: 0, out: 9, volume: 1 };
const project = (extra = {}) => ({ clips: [], audioClips: [], overlayClips: [], ...extra });

test('missing active audio file stops export rather than silently dropping the track', () => {
  assert.throws(() => preflightExportMedia(project({ audioClips: [voice] }), {}), /audio original/);
});

test('missing main picture or overlay original stops export', () => {
  assert.throws(() => preflightExportMedia(project({ clips: [video] }), {}), /visual original/);
  assert.throws(() => preflightExportMedia(project({ overlayClips: [video] }), {}), /visual original/);
});

test('AudioContext unavailable stops audible video or separate audio', () => {
  assert.throws(() => preflightExportMedia(project({ clips: [video] }), { v: { kind: 'video' } }, false), /motor de audio/);
  assert.throws(() => preflightExportMedia(project({ audioClips: [voice] }), { voice: { kind: 'audio' } }, false), /motor de audio/);
});

test('explicitly muted or zero-volume video may export without AudioContext', () => {
  assert.deepEqual(preflightExportMedia(project({ clips: [{ ...video, muted: true }] }), { v: { kind: 'video' } }, false), { needsAudio: false });
  assert.deepEqual(preflightExportMedia(project({ clips: [{ ...video, volume: 0 }] }), { v: { kind: 'video' } }, false), { needsAudio: false });
  assert.deepEqual(preflightExportMedia(project({ clips: [{ ...video, muted: true }], audioClips: [{ ...voice, muted: true }] }), { v: { kind: 'video' } }, false), { needsAudio: false });
});

test('silent photo and available audio retain normal export path', () => {
  assert.deepEqual(preflightExportMedia(project({ clips: [video] }), { v: { kind: 'image' } }, false), { needsAudio: false });
  assert.deepEqual(preflightExportMedia(project({ audioClips: [voice] }), { voice: { kind: 'audio' } }, true), { needsAudio: true });
});
