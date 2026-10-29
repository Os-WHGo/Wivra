import test from 'node:test';
import assert from 'node:assert/strict';
import { proposeTranscribedTextEdits } from '../ai/transcription-editor-bridge.mjs';
import { applyBatch } from '../../core/operations.mjs';
import { createProject } from '../../core/project.mjs';

const whisper = { result: { language: 'es' }, transcription: [
  { offsets: { from: 1000, to: 3000 }, text: ' Hola desde Whistler ' },
  { offsets: { from: 4000, to: 6000 }, text: 'Segunda frase' }
] };
const options = { runWhisper: async () => whisper, audio: 'local-file', duration: 6, timelineDuration: 8 };

test('Whisper to editor operations to validated timeline without automatic application', async () => {
  const r = await proposeTranscribedTextEdits(options);
  assert.equal(r.ok, true);
  assert.equal(r.requiresApproval, true);
  assert.deepEqual(r.ops.map(x => [x.op, x.text, x.start, x.duration]), [
    ['add_text', 'Hola desde Whistler', 1, 2], ['add_text', 'Segunda frase', 4, 2]
  ]);
  const base = createProject({ assets: [{ id: 'a1', duration: 8, name: 'clip.mp4' }] });
  const clip = applyBatch(base, [{ op: 'add_clip', asset_id: 'a1' }]);
  assert.equal(clip.ok, true);
  const edit = applyBatch(clip.project, r.ops);
  assert.equal(edit.ok, true, edit.message);
  assert.equal(edit.project.texts.length, 2);
  assert.equal(clip.project.texts.length, 0, 'the bridge does not mutate the project');
});

test('long Whisper phrases split to safe editor text lengths', async () => {
  const long = { transcription: [{ offsets: { from: 0, to: 5000 }, text: Array(35).fill('palabra').join(' ') }] };
  const r = await proposeTranscribedTextEdits({ ...options, runWhisper: async () => long });
  assert.equal(r.ok, true);
  assert.ok(r.ops.length > 1);
  assert.ok(r.ops.every(x => x.text.length <= 120));
});

test('rejects invalid timeline and empty transcription', async () => {
  assert.equal((await proposeTranscribedTextEdits({ ...options, timelineDuration: 0 })).code, 'INVALID_TIMELINE');
  assert.equal((await proposeTranscribedTextEdits({ ...options, offset: Infinity })).code, 'INVALID_OFFSET');
  assert.equal((await proposeTranscribedTextEdits({ ...options, maxChars: 121 })).code, 'INVALID_TEXT_LIMIT');
  assert.equal((await proposeTranscribedTextEdits({ ...options, runWhisper: async () => ({ transcription: [] }) })).code, 'EMPTY_TRANSCRIPT');
});

test('returns no visible cues when all captions fall after timeline', async () => {
  const r = await proposeTranscribedTextEdits({ ...options, timelineDuration: 0.5 });
  assert.equal(r.code, 'NO_VISIBLE_CUES');
});
