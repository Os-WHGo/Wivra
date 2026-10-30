import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTranscript, transcriptToCues, TRANSCRIPT_SCHEMA_VERSION } from '../ai/transcript-contract.mjs';
const make = (engine = 'whisper.cpp') => ({ version: TRANSCRIPT_SCHEMA_VERSION, engine, language: 'es', segments: [{ start: 0, end: 1.5, text: ' Hola mundo ', confidence: 0.93 }, { start: 1.5, end: 3, text: 'Sḵwx̱wú7mesh 👩‍💻' }] });
test('accepts Whisper and returns editor-compatible cues', () => {
  const result = transcriptToCues(make(), { duration: 3 });
  assert.equal(result.ok, true);
  assert.deepEqual(result.cues, [{ start: 0, end: 1.5, text: 'Hola mundo' }, { start: 1.5, end: 3, text: 'Sḵwx̱wú7mesh 👩‍💻' }]);
});
test('accepts alternative engines without changing editor contract', () => {
  for (const engine of ['whisper.cpp', 'sherpa-onnx', 'external', 'manual']) assert.equal(validateTranscript(make(engine)).ok, true);
});
test('rejects unsupported schema and engine', () => {
  assert.equal(validateTranscript({ ...make(), version: 2 }).code, 'UNSUPPORTED_VERSION');
  assert.equal(validateTranscript({ ...make(), engine: 'unknown' }).code, 'INVALID_ENGINE');
});
test('rejects invalid times, ordering and duration', () => {
  for (const segment of [{ start: -1, end: 2, text: 'a' }, { start: 2, end: 2, text: 'a' }, { start: NaN, end: 2, text: 'a' }, { start: 0, end: Infinity, text: 'a' }]) {
    assert.equal(validateTranscript({ ...make(), segments: [segment] }).code, 'INVALID_TIME');
  }
  assert.equal(validateTranscript(make(), { duration: 2 }).code, 'INVALID_TIME');
  assert.equal(validateTranscript({ ...make(), segments: [...make().segments].reverse() }).code, 'UNSORTED');
});
test('rejects empty text, invalid confidence and excessive segments', () => {
  assert.equal(validateTranscript({ ...make(), segments: [{ start: 0, end: 1, text: '  ' }] }).code, 'INVALID_TEXT');
  assert.equal(validateTranscript({ ...make(), segments: [{ start: 0, end: 1, text: 'x', confidence: 1.2 }] }).code, 'INVALID_CONFIDENCE');
  assert.equal(validateTranscript(make(), { maxSegments: 1 }).code, 'INVALID_SEGMENTS');
});
test('does not mutate input', () => {
  const source = make();
  const before = JSON.stringify(source);
  validateTranscript(source);
  assert.equal(JSON.stringify(source), before);
});
