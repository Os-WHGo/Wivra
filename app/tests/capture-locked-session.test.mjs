import test from 'node:test';
import assert from 'node:assert/strict';
import { createCaptureJournal, advanceCaptureJournal, recoverCaptureJournal } from '../capture-locked-session.mjs';

test('Ray-Ban journal records confirmed fragments and finalizes', () => {
  let j = createCaptureJournal({ id: 'capture-1', platform: 'ios', startedAt: 100 });
  j = advanceCaptureJournal(j, { state: 'recording', at: 101 });
  j = advanceCaptureJournal(j, { state: 'interrupted', at: 102, reason: 'connection lost', segment: { file: 'part-1.mp4', startMs: 0, endMs: 1000, confirmed: true } });
  assert.deepEqual(recoverCaptureJournal(j).recoverableFiles, ['part-1.mp4']);
  j = advanceCaptureJournal(j, { state: 'recording', at: 103 });
  j = advanceCaptureJournal(j, { state: 'stopping', at: 104, segment: { file: 'part-2.mp4', startMs: 1000, endMs: 2000, confirmed: true } });
  j = advanceCaptureJournal(j, { state: 'finalized', at: 105, finalFile: 'recording.mp4' });
  assert.equal(recoverCaptureJournal(j).requiresReview, false);
  assert.equal(j.interruptions.length, 1);
});
test('Ray-Ban journal rejects overlapping, duplicate and unconfirmed fragments', () => {
  let j = createCaptureJournal({ id: 'capture-2', platform: 'android', startedAt: 0 });
  j = advanceCaptureJournal(j, { state: 'recording', at: 1 });
  j = advanceCaptureJournal(j, { state: 'interrupted', at: 2, segment: { file: 'a.mp4', startMs: 0, endMs: 1000, confirmed: true } });
  assert.throws(() => advanceCaptureJournal(j, { state: 'recording', at: 3, segment: { file: 'b.mp4', startMs: 500, endMs: 1500, confirmed: true } }));
  assert.throws(() => advanceCaptureJournal(j, { state: 'recording', at: 3, segment: { file: 'a.mp4', startMs: 1000, endMs: 1500, confirmed: true } }));
  assert.throws(() => advanceCaptureJournal(j, { state: 'recording', at: 3, segment: { file: 'b.mp4', startMs: 1000, endMs: 1500, confirmed: false } }));
});
test('Ray-Ban journal never finalizes an empty capture', () => {
  let j = createCaptureJournal({ id: 'capture-3', platform: 'ios', startedAt: 0 });
  j = advanceCaptureJournal(j, { state: 'recording', at: 1 });
  j = advanceCaptureJournal(j, { state: 'stopping', at: 2 });
  assert.throws(() => advanceCaptureJournal(j, { state: 'finalized', at: 3, finalFile: 'empty.mp4' }));
});
