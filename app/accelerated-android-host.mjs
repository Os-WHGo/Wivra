import {bytesToBase64} from './export-sink.mjs';
import {ACCELERATED_NATIVE_MAX_WRITE_BYTES} from './accelerated-native-sink.mjs';

// Experimental Android-only transport for the separate WivraAcceleratedExportNative
// WebMessageListener. The production MediaRecorder bridge remains protocol v1.
// JSON/base64 is deliberately bounded; native must enforce every limit again.
export const ACCELERATED_ANDROID_REQUEST_MS = 30000;
export const ACCELERATED_ANDROID_FINALIZE_MS = 20 * 60 * 1000;
const CACHE = new WeakMap();

export function acceleratedAndroidHost(obj, {
  requestMs = ACCELERATED_ANDROID_REQUEST_MS,
  finalizeMs = ACCELERATED_ANDROID_FINALIZE_MS
} = {}) {
  if (!obj || typeof obj.postMessage !== 'function')
    throw new Error('No hay puente acelerado Android.');
  if (!(Number.isFinite(requestMs) && requestMs > 0 &&
        Number.isFinite(finalizeMs) && finalizeMs > 0))
    throw new Error('Tiempo de espera nativo inválido.');
  let rid = 0;
  const waiting = new Map();
  const onReply = (event) => {
    let answer;
    try { answer = JSON.parse(event?.data); } catch { return; }
    if (!answer || !Number.isSafeInteger(answer.rid)) return;
    const pending = waiting.get(answer.rid);
    if (!pending) return;
    waiting.delete(answer.rid);
    clearTimeout(pending.timer);
    if (answer.ok === true) pending.resolve(answer);
    else pending.reject(new Error(answer.error || 'Error del puente acelerado.'));
  };
  if (typeof obj.addEventListener === 'function')
    obj.addEventListener('message', onReply);
  else obj.onmessage = onReply;
  const send = (payload, timeoutMs = requestMs) => new Promise((resolve, reject) => {
    // v2 Kotlin accepts signed positive 32-bit rid, not arbitrary JS integers.
    rid = rid >= 2147483646 ? 1 : rid + 1;
    if (waiting.has(rid)) return reject(new Error('Identificador de petición ocupado.'));
    const id = rid;
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error('El puente acelerado no respondió a tiempo.'));
    }, timeoutMs);
    waiting.set(id, {resolve, reject, timer});
    try {
      obj.postMessage(JSON.stringify({v: 2, protocol: 2, rid: id, ...payload}));
    } catch (error) {
      waiting.delete(id);
      clearTimeout(timer);
      reject(error);
    }
  });
  return {
    platform: 'android',
    request: (payload) => send(payload,
      payload?.op === 'finishRandom' ? finalizeMs : requestMs),
    sendWriteAt: ({token, seq, position, bytes}) => {
      if (!Number.isSafeInteger(token) || token <= 0 ||
          !Number.isSafeInteger(seq) || seq < 0 ||
          !Number.isSafeInteger(position) || position < 0 ||
          !(bytes instanceof Uint8Array) || !bytes.byteLength ||
          bytes.byteLength > ACCELERATED_NATIVE_MAX_WRITE_BYTES)
        return Promise.reject(new Error('Bloque acelerado inválido.'));
      return send({op: 'writeAt', token, seq, position,
        size: bytes.byteLength, b64: bytesToBase64(bytes)});
    }
  };
}

/** A v2 bridge is only installed in the full bundled Android Editor. */
export function detectAcceleratedAndroidHost(g = globalThis) {
  const obj = g?.WivraAcceleratedExportNative;
  if (!obj || typeof obj.postMessage !== 'function') return null;
  if (!CACHE.has(obj)) CACHE.set(obj, acceleratedAndroidHost(obj));
  return CACHE.get(obj);
}
