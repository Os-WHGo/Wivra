import test from 'node:test';
import assert from 'node:assert/strict';
import { createTranscriptionController } from '../ai/transcription-controller.mjs';
import { createProject } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';

const project = () => applyBatch(createProject({
  assets: [{ id: 'a1', duration: 5, name: 'clip.mp4' }]
}), [{ op: 'add_clip', asset_id: 'a1' }]).project;
const raw = { transcription: [{ offsets: { from: 0, to: 1000 }, text: 'Hola' }] };
const input = p => ({ project: p, audio: 'file:///clip.wav', duration: 5, timelineDuration: 5 });

test('controller rejects missing engine and missing model', async () => {
  const noEngine = createTranscriptionController({ host: {} });
  assert.equal((await noEngine.prepare(input(project()))).code, 'ENGINE_UNAVAILABLE');
  const noModel = createTranscriptionController({ host: { WivraNativeWhisper: {
    status: async () => ({ modelInstalled: false }), transcribe: async () => raw
  } } });
  assert.equal((await noModel.prepare(input(project()))).code, 'MODEL_NOT_INSTALLED');
});

test('controller prepares, requires approval, and discards without mutation', async () => {
  const host = { WivraNativeWhisper: { status: async () => ({ modelInstalled: true }), transcribe: async () => raw } };
  const ctrl = createTranscriptionController({ host });
  const p = project();
  const prepared = await ctrl.prepare(input(p));
  assert.equal(prepared.ok, true);
  assert.equal(ctrl.getState().hasProposal, true);
  assert.equal(p.texts.length, 0);
  assert.equal((await ctrl.prepare(input(p))).code, 'PROPOSAL_PENDING');
  assert.equal(ctrl.discard().ok, true);
  assert.equal(ctrl.getState().hasProposal, false);
  const second = await ctrl.prepare(input(p));
  assert.equal(second.ok, true);
  const approved = ctrl.approve(p);
  assert.equal(approved.ok, true);
  assert.equal(approved.project.texts[0].text, 'Hola');
  assert.equal(ctrl.getState().hasProposal, false);
});

test('controller rejects outdated proposal after project revision changes', async () => {
  const host = { WivraNativeWhisper: { status: async () => ({ modelInstalled: true }), transcribe: async () => raw } };
  const ctrl = createTranscriptionController({ host });
  const p = project();
  assert.equal((await ctrl.prepare(input(p))).ok, true);
  const changed = applyBatch(p, [{ op: 'add_text', text: 'Nuevo', start: 2, duration: 1 }]);
  assert.equal(ctrl.approve(changed.project).code, 'STALE_PROPOSAL');
  assert.equal(ctrl.discard().ok, true);
});

test('controller rejects overlapping requests and cancellation suppresses output', async () => {
  let resolve;
  const host = { WivraNativeWhisper: {
    status: async () => ({ modelInstalled: true }),
    transcribe: () => new Promise(r => { resolve = r; })
  } };
  const ctrl = createTranscriptionController({ host });
  const p = project();
  const pending = ctrl.prepare(input(p));
  await new Promise(r => setImmediate(r));
  assert.equal((await ctrl.prepare(input(p))).code, 'BUSY');
  assert.equal(ctrl.cancel().ok, true);
  resolve(raw);
  assert.equal((await pending).code, 'CANCELLED');
  assert.equal(ctrl.getState().hasProposal, false);
});
