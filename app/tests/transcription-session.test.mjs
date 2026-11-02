import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareTranscriptionEdit, applyApprovedTranscriptionEdit } from '../ai/transcription-session.mjs';
import { createProject } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';

const raw = { transcription: [{ offsets: { from: 0, to: 1500 }, text: 'Hola Wivra' }] };
const initial = () => {
  const p = createProject({ assets: [{ id: 'a1', duration: 5, name: 'clip.mp4' }] });
  const result = applyBatch(p, [{ op: 'add_clip', asset_id: 'a1' }]);
  assert.equal(result.ok, true);
  return result.project;
};
const prepare = project => prepareTranscriptionEdit({
  project, runWhisper: async () => raw, audio: 'file', duration: 5, timelineDuration: 5
});

test('prepare previews subtitles without modifying source and approval applies atomically', async () => {
  const project = initial();
  const result = await prepare(project);
  assert.equal(result.ok, true);
  assert.equal(result.requiresApproval, true);
  assert.equal(project.texts.length, 0);
  assert.equal(result.preview.texts.length, 1);
  assert.equal(applyApprovedTranscriptionEdit({ project, proposal: result.proposal }).code, 'APPROVAL_REQUIRED');
  const applied = applyApprovedTranscriptionEdit({ project, proposal: result.proposal, approved: true });
  assert.equal(applied.ok, true);
  assert.equal(applied.project.texts[0].text, 'Hola Wivra');
  assert.equal(project.texts.length, 0);
});

test('rejects stale revision after another edit', async () => {
  const project = initial();
  const prepared = await prepare(project);
  const changed = applyBatch(project, [{ op: 'add_text', text: 'Nuevo', start: 2, duration: 1 }]);
  assert.equal(changed.ok, true);
  assert.equal(applyApprovedTranscriptionEdit({ project: changed.project, proposal: prepared.proposal, approved: true }).code, 'STALE_PROPOSAL');
});

test('does not allow arbitrary operations injected into a subtitle proposal', async () => {
  const project = initial();
  const prepared = await prepare(project);
  const forged = { ...prepared.proposal, ops: [{ op: 'delete_clip', clip_id: 'c1' }] };
  assert.equal(applyApprovedTranscriptionEdit({ project, proposal: forged, approved: true }).code, 'INVALID_PROPOSAL');
});
