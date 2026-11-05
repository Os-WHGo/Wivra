// LIVE reconnection policy (numbers mirrored in Kotlin and Swift). — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { createReconnectState, onConnectionProblem, onConnected, RECONNECT_DELAYS_S, NEVER_RETRY, totalRetryWindowS } from '../live-reconnect.mjs';

test('a dropped LIVE is retried with growing pauses, then gives up', () => {
  let s = onConnected(createReconnectState());
  assert.equal(s.onAir, true);
  const delays = [];
  for (;;) {
    const r = onConnectionProblem(s, 'connection-lost');
    s = r.state;
    if (!r.decision.retry) { assert.equal(r.decision.why, 'attempts-exhausted'); break; }
    delays.push(r.decision.delayS);
    assert.equal(s.onAir, false);
  }
  assert.deepEqual(delays, [2, 4, 8, 15, 15, 15]);
  assert.equal(s.gaveUp, true);
  assert.equal(totalRetryWindowS(), 59);
});

test('a successful reconnection resets the budget', () => {
  let s = createReconnectState();
  s = onConnectionProblem(s, 'connection-failed').state;
  s = onConnectionProblem(s, 'network-change').state;
  assert.equal(s.attempt, 2);
  s = onConnected(s);
  assert.deepEqual(s, { attempt: 0, onAir: true, gaveUp: false });
  assert.equal(onConnectionProblem(s, 'connection-lost').decision.delayS, RECONNECT_DELAYS_S[0]);
});

test('rejected credentials, owner stop or critical storage are never retried', () => {
  for (const why of NEVER_RETRY) {
    const r = onConnectionProblem(createReconnectState(), why);
    assert.deepEqual(r.decision, { retry: false, why });
    assert.equal(r.state.gaveUp, true);
  }
});
