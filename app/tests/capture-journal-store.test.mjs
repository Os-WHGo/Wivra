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

test('simultaneous mutations cannot silently overwrite a confirmed fragment', async () => {
  const { store } = storage();
  await store.start({ id: 'parallel', platform: 'android', startedAt: 1 });
  await store.transition('parallel', { state: 'recording', at: 2 });
  const first = store.appendConfirmedSegment('parallel', { file: 'first.mp4', startMs: 0, endMs: 1000, confirmed: true }, 3);
  const second = store.appendConfirmedSegment('parallel', { file: 'second.mp4', startMs: 1000, endMs: 2000, confirmed: true }, 4);
  const outcomes = await Promise.allSettled([first, second]);
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(outcomes.filter(x => x.status === 'rejected').length, 1);
  assert.equal((await store.load('parallel')).segments.length, 1);
});

test('corrupted persisted capture remains untouched and cannot be mutated', async () => {
  const { store, files } = storage();
  await store.start({ id: 'damaged', platform: 'android', startedAt: 1 });
  await store.transition('damaged', { state: 'recording', at: 2 });
  await store.appendConfirmedSegment('damaged', { file: 'valid.mp4', startMs: 0, endMs: 1000, confirmed: true }, 3);
  const key = 'wivra-capture-damaged.json';
  const damaged = JSON.parse(files.get(key));
  damaged.segments.push({ file: 'overlap.mp4', startMs: 500, endMs: 1500, confirmed: true });
  const original = JSON.stringify(damaged);
  files.set(key, original);
  await assert.rejects(store.transition('damaged', { state: 'stopping', at: 4 }), /Corrupted stored capture segments/);
  await assert.rejects(store.appendConfirmedSegment('damaged', { file: 'another.mp4', startMs: 1000, endMs: 2000, confirmed: true }, 4), /Corrupted stored capture segments/);
  assert.equal(files.get(key), original);
});

test('corrupted journals remain visible for review without exposing unverified media', async () => {
  const { store, files } = storage();
  files.set('wivra-capture-broken.json', '{bad json');
  files.set('wivra-capture-overlap.json', JSON.stringify({ id: 'overlap', schema: 1, state: 'recording', segments: [
    { file: 'a.mp4', startMs: 0, endMs: 1000, confirmed: true },
    { file: 'b.mp4', startMs: 500, endMs: 1500, confirmed: true }
  ], interruptions: [] }));
  const pending = await store.recoverPending();
  assert.deepEqual(pending, [
    { id: 'broken', state: 'corrupted', files: [] },
    { id: 'overlap', state: 'corrupted', files: [] }
  ]);
  assert.equal(files.get('wivra-capture-broken.json'), '{bad json');
});

test('save refuses corrupt segment suffix without replacing durable journal', async () => {
  const { store, files } = storage();
  const journal = await store.start({ id: 'safe-write', platform: 'android', startedAt: 1 });
  const key = 'wivra-capture-safe-write.json';
  const original = files.get(key);
  const corrupted = { ...journal, segments: [
    { file: 'valid.mp4', startMs: 0, endMs: 1000, confirmed: true },
    { file: 'overlap.mp4', startMs: 500, endMs: 1500, confirmed: true }
  ] };
  await assert.rejects(store.save(corrupted), /Corrupted capture segments cannot be saved/);
  assert.equal(files.get(key), original);
});

test('two stores sharing the native atomic writer cannot race the same session', async () => {
  const files = new Map();
  const backend = { writeAtomic: async (n,v) => files.set(n,v), read: async n => files.get(n) ?? null, list: async () => [...files.keys()] };
  const first = createCaptureJournalStore(backend), second = createCaptureJournalStore(backend);
  await first.start({ id: 'shared', platform: 'android', startedAt: 1 });
  await first.transition('shared', { state: 'recording', at: 2 });
  const stale = await first.load('shared');
  const outcomes = await Promise.allSettled([
    first.appendConfirmedSegment('shared', { file: 'one.mp4', startMs: 0, endMs: 1000, confirmed: true }, 3),
    second.appendConfirmedSegment('shared', { file: 'two.mp4', startMs: 0, endMs: 1000, confirmed: true }, 3)
  ]);
  assert.equal(outcomes.filter(r => r.status === 'fulfilled').length, 1);
  const saved = files.get('wivra-capture-shared.json');
  await assert.rejects(second.save(stale), /Stale capture snapshot/);
  assert.equal(files.get('wivra-capture-shared.json'), saved);
});

test('newer direct snapshots cannot erase or rewrite verified capture history', async () => {
  const { store, files } = storage();
  await store.start({ id: 'history', platform: 'android', startedAt: 1 });
  await store.transition('history', { state: 'recording', at: 2 });
  await store.appendConfirmedSegment('history', { file: 'first.mp4', startMs: 0, endMs: 1000, confirmed: true }, 3);
  await store.transition('history', { state: 'interrupted', at: 4, reason: 'link lost' });
  const current = await store.load('history');
  const snapshot = files.get('wivra-capture-history.json');
  const newer = changes => ({ ...current, updatedAt: 100, ...changes });

  for (const invalid of [
    newer({ segments: [] }),
    newer({ segments: [{ ...current.segments[0], file: 'replacement.mp4' }] }),
    newer({ interruptions: [] }),
    newer({ platform: 'ios' }),
    newer({ startedAt: 2 }),
    newer({ state: 'connecting' })
  ]) {
    await assert.rejects(store.save(invalid), /discard confirmed history/);
    assert.equal(files.get('wivra-capture-history.json'), snapshot);
  }
  // Identical retry is safe, and the ordinary state machine can still resume.
  assert.deepEqual(await store.save(current), current);
  await store.transition('history', { state: 'recording', at: 5 });
  await store.appendConfirmedSegment('history', { file: 'second.mp4', startMs: 1000, endMs: 2000, confirmed: true }, 6);
  assert.deepEqual((await store.load('history')).segments.map(s => s.file), ['first.mp4', 'second.mp4']);
});

test('direct save cannot reopen or replace a terminal capture snapshot', async () => {
  const { store, files } = storage();
  await store.start({ id: 'sealed', platform: 'ios', startedAt: 1 });
  await store.transition('sealed', { state: 'recording', at: 2 });
  await store.appendConfirmedSegment('sealed', { file: 'verified.mov', startMs: 0, endMs: 5000, confirmed: true }, 3);
  await store.transition('sealed', { state: 'stopping', at: 4 });
  await store.transition('sealed', { state: 'finalized', at: 5, finalFile: 'finished.mov' });
  const saved = await store.load('sealed');
  const original = files.get('wivra-capture-sealed.json');
  for (const change of [
    { state: 'failed' },
    { state: 'recording', finalFile: null },
    { state: 'finalized', finalFile: 'different.mov' }
  ]) {
    await assert.rejects(store.save({ ...saved, updatedAt: 100, ...change }), /discard confirmed history/);
    assert.equal(files.get('wivra-capture-sealed.json'), original);
  }
  assert.deepEqual(await store.save(saved), saved);
});

test('recoverable capture cannot advertise a final output before finalization', async () => {
  const { store, files } = storage();
  await store.start({ id: 'premature', platform: 'android', startedAt: 1 });
  await store.transition('premature', { state: 'recording', at: 2 });
  const key = 'wivra-capture-premature.json';
  const original = files.get(key);
  const current = await store.load('premature');
  await assert.rejects(store.save({ ...current, updatedAt: 3, finalFile: 'fake.mp4' }),
    /Invalid capture journal envelope/);
  assert.equal(files.get(key), original);
  const corrupted = JSON.stringify({ ...current, finalFile: 'fake.mp4' });
  files.set(key, corrupted);
  await assert.rejects(store.load('premature'), /Invalid capture journal envelope/);
  assert.deepEqual(await store.recoverPending(), [
    { id: 'premature', state: 'corrupted', files: [] }
  ]);
  assert.equal(files.get(key), corrupted);
});
