import test from 'node:test';
import assert from 'node:assert/strict';
import { exportSubtitles } from '../ai/subtitle-export.mjs';

const transcript = {
  version: 1, engine: 'whisper.cpp', language: 'es',
  segments: [
    { start: 0, end: 1.25, text: '¡Hola, Whistler!' },
    { start: 61.2, end: 62.345, text: 'Segunda escena' }
  ]
};

test('exports valid numbered SRT cues offline with millisecond timestamps', () => {
  const result = exportSubtitles(transcript, { format: 'srt', duration: 65 });
  assert.equal(result.ok, true);
  assert.equal(result.mimeType, 'application/x-subrip');
  assert.match(result.content, /^1\n00:00:00,000 --> 00:00:01,250\n¡Hola, Whistler!/);
  assert.match(result.content, /2\n00:01:01,200 --> 00:01:02,345\nSegunda escena\n$/);
});

test('exports WebVTT with header and dot timestamps', () => {
  const result = exportSubtitles(transcript, { format: 'vtt' });
  assert.equal(result.ok, true);
  assert.match(result.content, /^WEBVTT\n\n00:00:00\.000 --> 00:00:01\.250/);
  assert.doesNotMatch(result.content, /\n1\n/);
});

test('rejects unsupported format, overlaps and duration overflow', () => {
  assert.equal(exportSubtitles(transcript, { format: 'ass' }).code, 'INVALID_FORMAT');
  assert.equal(exportSubtitles(transcript, { duration: 60 }).code, 'INVALID_TIME');
  const overlap = { ...transcript, segments: [{ start: 0, end: 2, text: 'a' }, { start: 1, end: 3, text: 'b' }] };
  assert.equal(exportSubtitles(overlap).code, 'OVERLAPPING_SEGMENTS');
});

test('empty transcript emits valid VTT header and empty SRT', () => {
  const empty = { ...transcript, segments: [] };
  assert.equal(exportSubtitles(empty, { format: 'vtt' }).content, 'WEBVTT\n\n');
  assert.equal(exportSubtitles(empty, { format: 'srt' }).content, '');
});
