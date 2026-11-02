// Read-only native host.verifyFile adapter. Does not start cameras or grant
// background capability. A session ID is the native 32-hex checkpoint session.
// No URIs, media bytes or sandbox paths cross this channel. — ChatGPT
const captureVerificationHosts = new WeakMap();
const captureVerificationScope = ({ id, file } = {}) =>
  typeof id === 'string' && /^[0-9a-f]{32}$/.test(id) && typeof file === 'string' &&
  new RegExp(`^(?:wivra_rayban_${id}_part[0-9]{4}\\.mp4|Wivra_Meta_${id}_part[0-9]{4}\\.mov)$`).test(file);

export function detectNativeCaptureFileVerifier(g = globalThis, { timeoutMs = 30000 } = {}) {
  const ios = g?.WivraHost;
  if (typeof ios?.verifyFile === 'function') {
    return async args => {
      if (!captureVerificationScope(args)) return false;
      let timer;
      try {
        const reply = await Promise.race([ios.verifyFile(args), new Promise(resolve => { timer = setTimeout(() => resolve(null), timeoutMs); })]);
        return reply?.verified === true;
      } catch { return false; } finally { clearTimeout(timer); }
    };
  }
  const native = g?.WivraCaptureNative;
  if (typeof native?.postMessage !== 'function') return null;
  if (captureVerificationHosts.has(native)) return captureVerificationHosts.get(native);
  let rid = 0;
  const waiting = new Map();
  const onMessage = event => {
    let reply; try { reply = JSON.parse(event.data); } catch { return; }
    const pending = waiting.get(reply?.rid);
    if (!pending) return;
    waiting.delete(reply.rid); clearTimeout(pending.timer);
    pending.resolve(reply.verified === true);
  };
  if (typeof native.addEventListener === 'function') native.addEventListener('message', onMessage);
  else native.onmessage = onMessage;
  const verify = args => {
    if (!captureVerificationScope(args)) return Promise.resolve(false);
    return new Promise(resolve => {
      const request = ++rid;
      const timer = setTimeout(() => { waiting.delete(request); resolve(false); }, timeoutMs);
      waiting.set(request, { resolve, timer });
      try { native.postMessage(JSON.stringify({ v: 1, rid: request, op: 'verifyFile', id: args.id, file: args.file })); }
      catch { clearTimeout(timer); waiting.delete(request); resolve(false); }
    });
  };
  captureVerificationHosts.set(native, verify);
  return verify;
}
