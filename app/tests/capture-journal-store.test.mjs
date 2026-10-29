import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptureJournalStore } from '../capture-journal-store.mjs';

function storage() {
  const files = new Map();
  const store = createCaptureJournalStore({
    writeAtomic: async (name, value) => { files.set(name, value); },
    read: async name => files.get(name) ?? null,
    list: async prefix => [...files.keys()].filter(k => k.startsWith(prefix))
  });
  return { store, files };
}
test('capture session persists and recovers after store recreation', async () => {
  const { store, files } = storage();
  await store.start({ id: 'ski-01', platform: 'ios', startedAt: 1 });
  await store.transition('ski-01', { state: 'recording', at: 2 });
  await store.transition('ski-01', { state: 'interrupted', at: 3, reason: 'link lost', segment: { file: 'segment-1.mp4', startMs: 0, endMs: 1000, confirmed: true } });
  const restored = createCaptureJournalStore({
    writeAtomic: async (n,v) => files.set(n,v),
    read: async n => files.get(n) ?? null,
    list: async prefix => [...files.keys()].filter(n => n.startsWith(prefix))
  });
  assert.deepEqual(await restored.recoverPending(), [{ id: 'ski-01', state: 'interrupted', files: ['segment-1.mp4'] }]);
  await restored.transition('ski-01', { state: 'recording', at: 4 });
  await restored.transition('ski-01', { state: 'stopping', at: 5 });
  await restored.transition('ski-01', { state: 'finalized', at: 6, finalFile: 'complete.mp4' });
  assert.deepEqual(await restored.recoverPending(), []);
});
test('store rejects unsafe session identifiers and duplicates', async () => {
  const { store } = storage();
  await assert.rejects(store.start({ id: '../escape', platform: 'ios' }));
  await store.start({ id: 'safe', platform: 'android', startedAt: 1 });
  await assert.rejects(store.start({ id: 'safe', platform: 'android', startedAt: 1 }));
});
