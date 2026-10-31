import test from 'node:test';
import assert from 'node:assert/strict';
import { detectNativeCaptureFileVerifier } from '../capture-native-verifier.mjs';
const id = 'a'.repeat(32), file = `wivra_rayban_${id}_part0001.mp4`;

test('Android native verifier correlates concurrent replies and refuses unsafe references before sending', async () => {
  const messages = [];
  const native = { postMessage: text => messages.push(JSON.parse(text)) };
  const verify = detectNativeCaptureFileVerifier({ WivraCaptureNative: native }, { timeoutMs: 100 });
  assert.equal(verify, detectNativeCaptureFileVerifier({ WivraCaptureNative: native }));
  assert.equal(await verify({ id, file: '../secret.mp4' }), false);
  assert.equal(await verify({ id: 'b'.repeat(32), file }), false);
  assert.equal(messages.length, 0);
  const one = verify({ id, file }), two = verify({ id, file });
  native.onmessage({ data: JSON.stringify({ rid: messages[1].rid, verified: true }) });
  native.onmessage({ data: JSON.stringify({ rid: messages[0].rid, verified: false }) });
  assert.deepEqual(await Promise.all([one, two]), [false, true]);
  const timedOut = verify({ id, file });
  assert.equal(await timedOut, false);
  native.onmessage({ data: JSON.stringify({ rid: messages[2].rid, verified: true }) });
});

test('iOS verifier requires explicit true and bounds native reply waits', async () => {
  for (const result of [{ verified: true }, { verified: 1 }, null]) {
    const verify = detectNativeCaptureFileVerifier({ WivraHost: { verifyFile: async () => result } });
    assert.equal(await verify({ id, file: `Wivra_Meta_${id}_part0001.mov` }), result?.verified === true);
  }
  const verify = detectNativeCaptureFileVerifier({ WivraHost: { verifyFile: () => new Promise(() => {}) } }, { timeoutMs: 5 });
  assert.equal(await verify({ id, file }), false);
  assert.equal(detectNativeCaptureFileVerifier({}), null);
});
