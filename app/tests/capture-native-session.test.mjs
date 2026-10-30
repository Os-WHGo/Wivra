import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeCaptureSession } from '../capture-native-session.mjs';

function fixture({ lockedScreen = true } = {}) {
  const files = new Map();
  let t = 0;
  const host = {
    capabilities: async () => ({ rayban: true, lockedScreen, backgroundVerified: false }),
    start: async () => {},
    stop: async () => ({ finalFile: 'full.mp4', segments: [{ file: 'a.mp4', startMs: 0, endMs: 5000, confirmed: true }] })
  };
  const storage = {
    writeAtomic: async (n,v) => files.set(n,v),
    read: async n => files.get(n) ?? null,
    list: async prefix => [...files.keys()].filter(n => n.startsWith(prefix))
  };
  return { host, storage, session: createNativeCaptureSession({ host, storage, now: () => ++t }) };
}
test('native session rejects unavailable locked-screen capability', async () => {
  const { session } = fixture({ lockedScreen: false });
  await assert.rejects(session.start({ id: 'one', platform: 'ios' }), /Locked-screen/);
  assert.deepEqual(await session.pending(), []);
});
test('native session durably finalizes verified segments', async () => {
  const { session } = fixture();
  await session.start({ id: 'ski', platform: 'android' });
  const result = await session.stop('ski');
  assert.equal(result.ok, true);
  assert.equal(result.journal.state, 'finalized');
  assert.equal(result.journal.segments[0].file, 'a.mp4');
  assert.deepEqual(await session.pending(), []);
});
test('native session keeps failed recording recoverable', async () => {
  const { host, session } = fixture();
  host.stop = async () => ({ finalFile: 'bad.mp4', segments: [] });
  await session.start({ id: 'ski2', platform: 'ios' });
  await assert.rejects(session.stop('ski2'), /No confirmed/);
  assert.equal((await session.snapshot('ski2')).state, 'failed');
  assert.equal((await session.pending()).length, 1);
});

test('Director handoff requires finalized journal and native file verification', async () => {
  const { host, session } = fixture();
  await session.start({ id: 'handoff', platform: 'android' });
  await assert.rejects(session.directorHandoff('handoff'), /not finalized/);
  await session.stop('handoff');
  await assert.rejects(session.directorHandoff('handoff'), /verification required/);
  host.verifyFile = async ({ file }) => ['full.mp4', 'a.mp4'].includes(file);
  assert.deepEqual(await session.directorHandoff('handoff'), {
    sessionId: 'handoff', platform: 'android', file: 'full.mp4',
    segments: [{ file: 'a.mp4', startMs: 0, endMs: 5000 }]
  });
  host.verifyFile = async () => false;
  await assert.rejects(session.directorHandoff('handoff'), /verification required/);
});

test('Director refuses a finalized take when a source fragment is missing', async () => {
  const { host, session } = fixture();
  await session.start({ id: 'partial', platform: 'ios' });
  await session.stop('partial');
  const checked = [];
  host.verifyFile = async ({ file }) => { checked.push(file); return file !== 'a.mp4'; };
  await assert.rejects(session.directorHandoff('partial'), /verification required/);
  assert.deepEqual(checked, ['full.mp4', 'a.mp4']);
});

test('Director handoff rejects concurrent capture state mutations while verifying media', async () => {
  const { host, session } = fixture();
  await session.start({ id: 'locked', platform: 'android' });
  await session.stop('locked');
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  host.verifyFile = async () => { entered(); await gate; return true; };
  const handoff = session.directorHandoff('locked');
  await started;
  await assert.rejects(session.start({ id: 'other', platform: 'android' }), /operation in progress/);
  release();
  assert.equal((await handoff).sessionId, 'locked');
});
