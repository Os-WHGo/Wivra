import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeCaptureSession } from '../capture-native-session.mjs';

function fixture({ lockedScreen = true } = {}) {
  const files = new Map();
  let writeFailureState = null;
  let t = 0;
  const host = {
    capabilities: async () => ({ rayban: true, lockedScreen, backgroundVerified: false }),
    start: async () => {},
    stop: async () => ({ finalFile: 'full.mp4', segments: [{ file: 'a.mp4', startMs: 0, endMs: 5000, confirmed: true }] }),
    verifyFile: async () => true
  };
  const storage = {
    writeAtomic: async (n,v) => {
      if (writeFailureState && JSON.parse(v).state === writeFailureState) throw new Error('storage unavailable');
      files.set(n,v);
    },
    read: async n => files.get(n) ?? null,
    list: async prefix => [...files.keys()].filter(n => n.startsWith(prefix))
  };
  return { host, storage, failWritesForState: state => { writeFailureState = state; }, session: createNativeCaptureSession({ host, storage, now: () => ++t }) };
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

test('unsafe native media references never reach the file verifier or Director', async () => {
  for (const output of [
    { finalFile: '../secret.mp4', segments: [{ file: 'safe.mp4', startMs: 0, endMs: 2, confirmed: true }] },
    { finalFile: 'safe.mp4', segments: [{ file: 'content://media/1', startMs: 0, endMs: 2, confirmed: true }] },
    { finalFile: 'safe.mp4', segments: [null] }
  ]) {
    const { host, session } = fixture();
    let verified = 0;
    host.verifyFile = async () => { verified++; return true; };
    host.stop = async () => output;
    await session.start({ id: 'unsafe', platform: 'android' });
    await assert.rejects(session.stop('unsafe'));
    assert.equal(verified, 0);
    assert.equal((await session.snapshot('unsafe')).state, 'failed');
  }
});

test('Director handoff requires finalized journal and native file verification', async () => {
  const { host, session } = fixture();
  await session.start({ id: 'handoff', platform: 'android' });
  await assert.rejects(session.directorHandoff('handoff'), /not finalized/);
  await session.stop('handoff');
  host.verifyFile = undefined;
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

test('finalization fails closed when a native fragment is missing', async () => {
  const { host, session } = fixture();
  host.verifyFile = async ({ file }) => file !== 'a.mp4';
  await session.start({ id: 'missing', platform: 'android' });
  await assert.rejects(session.stop('missing'), /verification required for finalization/);
  assert.equal((await session.snapshot('missing')).state, 'failed');
  assert.equal((await session.pending()).length, 1);
});

test('finalization requires a native verification callback', async () => {
  const { host, session } = fixture();
  host.verifyFile = undefined;
  await session.start({ id: 'unverified', platform: 'ios' });
  await assert.rejects(session.stop('unverified'), /verification required for finalization/);
  assert.equal((await session.snapshot('unverified')).state, 'failed');
});

test('finalization rechecks earlier interrupted fragments as well as new output', async () => {
  const { host, session } = fixture();
  await session.start({ id: 'interrupted', platform: 'android' });
  await session.interrupted('interrupted', 'connection lost', { file: 'earlier.mp4', startMs: 0, endMs: 1000, confirmed: true });
  await session.resumed('interrupted');
  host.stop = async () => ({ finalFile: 'full.mp4', segments: [{ file: 'later.mp4', startMs: 1000, endMs: 2000, confirmed: true }] });
  const checked = [];
  host.verifyFile = async ({ file }) => { checked.push(file); return file !== 'earlier.mp4'; };
  await assert.rejects(session.stop('interrupted'), /verification required for finalization/);
  assert.deepEqual(checked, ['full.mp4', 'earlier.mp4']);
  assert.equal((await session.snapshot('interrupted')).state, 'failed');
});

test('failed journal write during stop does not strand the active capture lock', async () => {
  const { host, failWritesForState, session } = fixture();
  await session.start({ id: 'broken-write', platform: 'android' });
  host.stop = async () => { throw new Error('native recorder failed'); };
  failWritesForState('failed');
  await assert.rejects(session.stop('broken-write'), /native recorder failed/);
  await session.start({ id: 'next-session', platform: 'android' });
  assert.equal((await session.snapshot('next-session')).state, 'recording');
});

test('failed journal write during native start preserves recorder error and releases session', async () => {
  const { host, failWritesForState, session } = fixture();
  host.start = async () => { throw new Error('native start unavailable'); };
  failWritesForState('failed');
  await assert.rejects(session.start({ id: 'bad-start', platform: 'ios' }), /native start unavailable/);
  host.start = async () => {};
  await session.start({ id: 'after-start-failure', platform: 'ios' });
  assert.equal((await session.snapshot('after-start-failure')).state, 'recording');
});

test('pending recovery scan does not race native stop and journal finalization', async () => {
  const { host, session } = fixture();
  await session.start({ id: 'scan-lock', platform: 'android' });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  host.stop = async () => { entered(); await gate; return { finalFile: 'full.mp4', segments: [{ file: 'a.mp4', startMs: 0, endMs: 5000, confirmed: true }] }; };
  const stopping = session.stop('scan-lock');
  await started;
  await assert.rejects(session.pending(), /operation in progress/);
  release();
  await stopping;
  assert.deepEqual(await session.pending(), []);
});
