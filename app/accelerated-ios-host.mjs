import {bytesToBase64} from './export-sink.mjs';
import {ACCELERATED_NATIVE_MAX_WRITE_BYTES} from './accelerated-native-sink.mjs';

// Dedicated iOS WKScriptMessageHandlerWithReply transport (protocol 2).
// No ad-hoc JavascriptInterface, network upload or v1 chunk coercion.
// The native WK handler independently enforces origin, byte and owner limits.
const CACHE = new WeakMap();
export const ACCELERATED_IOS_REQUEST_MS = 30000;
export const ACCELERATED_IOS_FINALIZE_MS = 20 * 60 * 1000;

export function acceleratedIOSHost(handler, {
  requestMs = ACCELERATED_IOS_REQUEST_MS,
  finalizeMs = ACCELERATED_IOS_FINALIZE_MS
} = {}) {
  if (!handler || typeof handler.postMessage !== 'function')
    throw new Error('No existe el canal acelerado de iPhone.');
  if (!(Number.isFinite(requestMs) && requestMs > 0 &&
        Number.isFinite(finalizeMs) && finalizeMs > 0))
    throw new Error('Tiempo de respuesta acelerada inválido.');
  const call = (message, ms) => {
    let timer;
    const native = Promise.resolve().then(() => handler.postMessage({
      version: 2, protocol: 2, ...message
    }));
    return Promise.race([native, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('iPhone no confirmó el bloque acelerado.')), ms);
    })]).finally(() => clearTimeout(timer)).then(response => {
      if (response?.ok !== true) throw new Error(response?.error || 'iPhone rechazó la exportación acelerada.');
      return response;
    });
  };
  return {
    platform: 'ios',
    request: message => call(message, message?.op === 'finishRandom' ? finalizeMs : requestMs),
    sendWriteAt: ({token, seq, position, bytes}) => {
      if (!Number.isSafeInteger(token) || token <= 0 ||
          !Number.isSafeInteger(seq) || seq < 0 ||
          !Number.isSafeInteger(position) || position < 0 ||
          !(bytes instanceof Uint8Array) || !bytes.length ||
          bytes.length > ACCELERATED_NATIVE_MAX_WRITE_BYTES)
        return Promise.reject(new Error('Fragmento aleatorio iOS inválido.'));
      return call({op:'writeAt',token,seq,position,size:bytes.byteLength,
        b64:bytesToBase64(bytes)},requestMs);
    }
  };
}

export function detectAcceleratedIOSHost(g = globalThis) {
  const handler = g?.webkit?.messageHandlers?.wivraAcceleratedExport;
  if (!handler || typeof handler.postMessage !== 'function') return null;
  if (!CACHE.has(handler)) CACHE.set(handler, acceleratedIOSHost(handler));
  return CACHE.get(handler);
}
