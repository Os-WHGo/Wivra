import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTranscript, transcriptToCues } from '../ai/transcript-contract.mjs';

const segment = (start, end, text) => ({ start, end, text });
const sample = segments => ({ version: 1, engine: 'whisper.cpp', language: 'es', segments });

test('reject overlapping transcript segments before editor cue handoff', () => {
  const value = sample([segment(0, 1.5, 'Hola'), segment(1.2, 2, 'mundo')]);
  assert.equal(validateTranscript(value).code, 'OVERLAPPING_SEGMENTS');
  assert.equal(transcriptToCues(value).code, 'OVERLAPPING_SEGMENTS');
});

test('allow adjacent non-overlapping segments and preserve timestamps', () => {
  const value = sample([segment(0, 1.5, ' Hola '), segment(1.5, 2, 'mundo')]);
  const result = transcriptToCues(value, { duration: 2 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.cues, [segment(0, 1.5, 'Hola'), segment(1.5, 2, 'mundo')]);
});

test('reject out-of-order and out-of-range timestamps', () => {
  assert.equal(validateTranscript(sample([segment(2, 3, 'uno'), segment(1, 1.5, 'dos')])).code, 'UNSORTED');
  assert.equal(validateTranscript(sample([segment(0, 3, 'uno')]), { duration: 2 }).code, 'INVALID_TIME');
});
