import test from 'node:test';
import assert from 'node:assert/strict';
import { transcriptToEditorOps } from '../ai/transcript-editor.mjs';
import { applyBatch } from '../../core/operations.mjs';
import { createProject } from '../../core/project.mjs';

const transcript = segments => ({ version: 1, engine: 'whisper.cpp', language: 'es', segments });
test('ASR generates add_text operations accepted by the real editor', () => {
  const r = transcriptToEditorOps(transcript([{ start: 1, end: 3, text: 'Hola mundo' }, { start: 3, end: 5, text: 'Segundo texto' }]), 10);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ops.map(o => o.op), ['add_text', 'add_text']);
  const project = applyBatch(createProject({ assets: [{ id: 'a1', duration: 10, name: 'video.mp4' }] }), [{ op: 'add_clip', asset_id: 'a1' }]);
  assert.equal(project.ok, true);
  const result = applyBatch(project.project, r.ops);
  assert.equal(result.ok, true, result.message);
  assert.deepEqual(result.project.texts.map(t => t.text), ['Hola mundo', 'Segundo texto']);
});
test('long ASR segment respects editor text limit and keeps continuity', () => {
  const r = transcriptToEditorOps(transcript([{ start: 0, end: 10, text: 'palabra '.repeat(80).trim() }]), 10);
  assert.equal(r.ok, true);
  assert.ok(r.ops.length > 1);
  assert.ok(r.ops.every(o => o.text.length <= 120));
  assert.ok(Math.abs(r.ops[0].start) < 1e-9);
});
test('rejects invalid ASR and invalid video duration', () => {
  assert.equal(transcriptToEditorOps({}, 10).ok, false);
  assert.equal(transcriptToEditorOps(transcript([]), 0).code, 'INVALID_DURATION');
  assert.equal(transcriptToEditorOps(transcript([]), 10, { offset: NaN }).code, 'INVALID_OFFSET');
});
test('drops segments that begin beyond video end', () => {
  const r = transcriptToEditorOps(transcript([{ start: 12, end: 14, text: 'Tarde' }]), 10);
  assert.equal(r.ok, true);
  assert.equal(r.late, 1);
  assert.equal(r.ops.length, 0);
});
