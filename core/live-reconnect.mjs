// Wivra LIVE reconnection policy (canonical; mirrored in Kotlin and Swift).
// A dropped connection is retried a few times with growing pauses while the
// local MP4 copy keeps recording. Credentials are never stored by Wivra: the
// RTMP library reconnects with the address it already holds in memory for
// this session. Rejected keys or apps, an owner stop and critical storage are
// never retried. Nothing here proves that a real server accepts the stream. — Claude

export const RECONNECT_DELAYS_S = Object.freeze([2, 4, 8, 15, 15, 15]);
export const NEVER_RETRY = Object.freeze(['auth-rejected', 'app-invalid', 'owner-stopped', 'storage-critical', 'bad-stream-name']);

export function createReconnectState() {
  return { attempt: 0, onAir: false, gaveUp: false };
}

/**
 * reason: 'connection-lost' | 'connection-failed' | 'network-change' | one of NEVER_RETRY.
 * Returns the next state and the decision: { retry: true, delayS } or
 * { retry: false, why }. The local copy is never touched by this decision.
 */
export function onConnectionProblem(state, reason) {
  const s = { ...state, onAir: false };
  if (NEVER_RETRY.includes(reason)) {
    return { state: { ...s, gaveUp: true }, decision: { retry: false, why: reason } };
  }
  if (s.attempt >= RECONNECT_DELAYS_S.length) {
    return { state: { ...s, gaveUp: true }, decision: { retry: false, why: 'attempts-exhausted' } };
  }
  const delayS = RECONNECT_DELAYS_S[s.attempt];
  return { state: { ...s, attempt: s.attempt + 1, gaveUp: false }, decision: { retry: true, delayS, attempt: s.attempt + 1 } };
}

/** A confirmed (re)connection resets the budget for the next drop. */
export function onConnected(state) {
  return { ...state, attempt: 0, onAir: true, gaveUp: false };
}

export const totalRetryWindowS = () => RECONNECT_DELAYS_S.reduce((a, b) => a + b, 0);
