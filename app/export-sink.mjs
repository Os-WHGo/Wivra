// Wivra · exportación progresiva. Cada fragmento de MediaRecorder (≈1 s) sale del
// WebView hacia un archivo nativo en cuanto existe, en orden y con CRC-32 de extremo
// a extremo. La memoria queda acotada por la cola (no por la duración del video).
// Sin puente nativo (navegador normal) se usa la exportación en memoria de siempre.
// Protocolo v1: begin → chunk(seq 0..n) → finish(bytes, crc32, chunks) | abort. — Claude

export const EXPORT_SINK_PROTOCOL = 1;
const MiB = 1024 * 1024;
// Cola máxima pendiente de confirmar por el almacenamiento: a 8 Mbps son ~48 s de
// video. Si el disco no sigue el ritmo se corta con un error claro, nunca crece sin fin.
export const EXPORT_SINK_MAX_QUEUED_BYTES = 48 * MiB;
// Un fragmento de 1 s nunca debería pasar de unos MB; 32 MiB descarta datos absurdos.
export const EXPORT_SINK_MAX_CHUNK_BYTES = 32 * MiB;
export const EXPORT_SINK_REQUEST_MS = 30000;
// Android usa este prefijo binario antes de cada fragmento: 'WVX1', rid, token, seq (u32 LE).
export const EXPORT_FRAME_MAGIC = 0x31585657;
export const EXPORT_FRAME_HEADER = 16;

const EXPORT_CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
/** CRC-32 IEEE (el mismo que zlib, java.util.zip.CRC32 y el de iOS en Wivra). Incremental. */
export function crc32Update(crc, bytes) {
  let c = (crc ^ 0xFFFFFFFF) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = EXPORT_CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

export function bytesToBase64(bytes) {
  if (typeof bytes.toBase64 === 'function') return bytes.toBase64();
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Marco binario para Android: cabecera de 16 bytes + datos, en un único ArrayBuffer. */
export function encodeExportFrame(rid, token, seq, bytes) {
  const buf = new ArrayBuffer(EXPORT_FRAME_HEADER + bytes.length), view = new DataView(buf);
  view.setUint32(0, EXPORT_FRAME_MAGIC, true); view.setUint32(4, rid >>> 0, true);
  view.setUint32(8, token >>> 0, true); view.setUint32(12, seq >>> 0, true);
  new Uint8Array(buf, EXPORT_FRAME_HEADER).set(bytes);
  return buf;
}

const withTimeout = (promise, ms, what) => {
  let timer;
  return Promise.race([promise, new Promise((_, no) => { timer = setTimeout(() => no(new Error(what + ' no respondió a tiempo.')), ms); })])
    .finally(() => clearTimeout(timer));
};

/** iOS: WKScriptMessageHandlerWithReply → postMessage devuelve una promesa. Sin canal
 * binario en WebKit: el fragmento viaja en base64 (≈33 % extra, solo 1 fragmento a la vez). */
export function iosExportHost(handler, { requestMs = EXPORT_SINK_REQUEST_MS } = {}) {
  const call = (msg, ms = requestMs) => withTimeout(Promise.resolve(handler.postMessage({ version: EXPORT_SINK_PROTOCOL, ...msg })), ms, 'El guardado del teléfono')
    .then((r) => { if (!r || r.ok !== true) throw new Error((r && r.error) || 'Respuesta nativa inválida.'); return r; },
      (e) => { throw e instanceof Error ? e : new Error(String(e)); });
  return {
    platform: 'ios', binary: false,
    request: (msg, ms) => call(msg, ms),
    sendChunk: ({ token, seq, bytes }) => call({ op: 'chunk', token, seq, size: bytes.length, b64: bytesToBase64(bytes) }),
  };
}

/** Android: objeto inyectado por WebViewCompat.addWebMessageListener (solo en el HTML del APK).
 * Peticiones en JSON; fragmentos como ArrayBuffer si el WebView lo admite (si no, base64).
 * Las respuestas llegan por onmessage con el mismo rid. */
export function androidExportHost(obj, { requestMs = EXPORT_SINK_REQUEST_MS } = {}) {
  let rid = 0, binary = false;
  const pending = new Map();
  const onReply = (event) => {
    let r; try { r = JSON.parse(event && event.data); } catch { return; }
    const p = r && pending.get(r.rid); if (!p) return;
    pending.delete(r.rid); clearTimeout(p.timer);
    if (r.ok === true) p.resolve(r); else p.reject(new Error(r.error || 'Error del guardado nativo.'));
  };
  if (typeof obj.addEventListener === 'function') obj.addEventListener('message', onReply); else obj.onmessage = onReply;
  const send = (build, ms = requestMs) => new Promise((resolve, reject) => {
    const id = ++rid;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('El guardado del teléfono no respondió a tiempo.')); }, ms);
    pending.set(id, { resolve, reject, timer });
    try { obj.postMessage(build(id)); } catch (e) { pending.delete(id); clearTimeout(timer); reject(e); }
  });
  const host = {
    platform: 'android',
    get binary() { return binary; },
    request: (msg, ms) => send((id) => JSON.stringify({ v: EXPORT_SINK_PROTOCOL, rid: id, ...msg }), ms),
    sendChunk: ({ token, seq, bytes }) => binary
      ? send((id) => encodeExportFrame(id, token, seq, bytes))
      : send((id) => JSON.stringify({ v: EXPORT_SINK_PROTOCOL, rid: id, op: 'chunk', token, seq, size: bytes.length, b64: bytesToBase64(bytes) })),
    async hello() { const r = await host.request({ op: 'hello' }); binary = r.arrayBuffer === true; return r; },
  };
  return host;
}

const nativeExportObject = (g) => {
  const ios = g && g.webkit && g.webkit.messageHandlers && g.webkit.messageHandlers.wivraExport;
  if (ios && typeof ios.postMessage === 'function') return { kind: 'ios', obj: ios };
  const android = g && g.WivraExportNative;
  if (android && typeof android.postMessage === 'function') return { kind: 'android', obj: android };
  return null;
};
/** ¿Hay puente nativo de guardado? No crea nada (sirve para mostrar u ocultar opciones). */
export const nativeExportAvailable = (g = globalThis) => !!nativeExportObject(g);
// Un único adaptador por objeto nativo: dos adaptadores sobre el mismo canal Android
// repetirían números de petición y una respuesta podría resolver la petición ajena.
const EXPORT_HOST_CACHE = new WeakMap();
/** Puente nativo disponible, o null (navegador normal: exportación en memoria). */
export function detectExportHost(g = globalThis) {
  const found = nativeExportObject(g);
  if (!found) return null;
  if (!EXPORT_HOST_CACHE.has(found.obj)) EXPORT_HOST_CACHE.set(found.obj, found.kind === 'ios' ? iosExportHost(found.obj) : androidExportHost(found.obj));
  return EXPORT_HOST_CACHE.get(found.obj);
}

/**
 * Sumidero progresivo. push(blob) nunca bloquea a MediaRecorder: encola y envía en
 * orden; cada fragmento se libera cuando el nativo confirma haberlo escrito.
 * `error` se activa ante cualquier fallo (cola llena, escritura, integridad) y la
 * exportación debe detenerse y llamar a abort(), que borra el archivo parcial.
 */
export function createProgressiveExportSink(host, { mime = '', ext = '', estimatedBytes = 0,
  maxQueuedBytes = EXPORT_SINK_MAX_QUEUED_BYTES, maxChunkBytes = EXPORT_SINK_MAX_CHUNK_BYTES } = {}) {
  let state = 'idle', token = 0, seq = 0, crc = 0, sentBytes = 0, receivedBytes = 0,
    queuedBytes = 0, peakQueuedBytes = 0, error = null, chain = Promise.resolve(), info = null;
  const fail = (e) => {
    if (error) return;
    error = e instanceof Error ? e : new Error(String(e));
    if (state === 'open') state = 'failed';
  };
  const sink = {
    get error() { return error; },
    get state() { return state; },
    get token() { return token; },
    get platform() { return host.platform; },
    async begin() {
      if (state !== 'idle') throw new Error('El guardado ya empezó.');
      if (typeof host.hello === 'function') await host.hello();
      const r = await host.request({ op: 'begin', mime, ext, estimatedBytes: Math.max(0, Math.round(estimatedBytes || 0)) });
      if (!Number.isInteger(r.token) || r.token <= 0) throw new Error('El guardado nativo no devolvió una sesión válida.');
      token = r.token; info = r; state = 'open';
      return r;
    },
    push(blob) {
      const size = blob && blob.size;
      if (state !== 'open' || error || !size) return;
      if (size > maxChunkBytes) return fail(new Error('Fragmento de video anormalmente grande (' + size + ' bytes).'));
      receivedBytes += size; queuedBytes += size; peakQueuedBytes = Math.max(peakQueuedBytes, queuedBytes);
      if (queuedBytes > maxQueuedBytes) return fail(new Error('El almacenamiento del teléfono no sigue el ritmo de la grabación. Libera espacio o cierra otras apps.'));
      chain = chain.then(async () => {
        if (error) return;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (bytes.length !== size) throw new Error('Un fragmento cambió de tamaño al leerlo.');
        const next = crc32Update(crc, bytes);
        const r = await host.sendChunk({ token, seq, bytes });
        if (r.seq !== seq || r.written !== sentBytes + size) throw new Error('El teléfono confirmó otros datos de los enviados.');
        crc = next; seq++; sentBytes += size; queuedBytes -= size;
      }).catch(fail);
    },
    /** Espera a que todo esté escrito y pide al nativo cerrar, sincronizar y verificar. */
    async finish({ timeoutMs, expectedDurationMs = 0, expectAudio = false } = {}) {
      if (state !== 'open') throw error || new Error('El guardado no está abierto.');
      await chain;
      if (error) throw error;
      if (sentBytes !== receivedBytes) throw new Error('No se escribieron todos los fragmentos grabados.');
      state = 'finishing';
      // Cerrar incluye releer el archivo del disco para comprobar el CRC y reparar el contenedor
      // (duración + índice para avanzar/retroceder): puede tardar en archivos grandes.
      const ms = timeoutMs || Math.max(EXPORT_SINK_REQUEST_MS, 60000 + Math.ceil(sentBytes / (4 * MiB)) * 1000);
      let r;
      try { r = await host.request({ op: 'finish', token, bytes: sentBytes, crc32: crc, chunks: seq, expectedDurationMs, expectAudio }, ms); }
      catch (e) { state = 'failed'; fail(e); throw error; }
      // The native side reports the VERIFIED recording (recordedBytes/recordedCrc32) and, when it
      // repaired the container, the size of the final file in `bytes`. Older natives only send bytes/crc32.
      const verifiedBytes = r.recordedBytes ?? r.bytes, verifiedCrc = (r.recordedCrc32 ?? r.crc32) >>> 0;
      if (verifiedBytes !== sentBytes || verifiedCrc !== crc) { state = 'failed'; fail(new Error('El archivo guardado no coincide con lo grabado.')); throw error; }
      state = 'done';
      return { ...r, recordedBytes: sentBytes, bytes: r.bytes ?? sentBytes, crc32: crc, chunks: seq, peakQueuedBytes, platform: host.platform };
    },
    /** Idempotente. Borra el archivo parcial en el nativo; nunca lanza. */
    async abort(reason = 'cancelled') {
      if (state === 'idle' || state === 'done' || state === 'aborted') { if (state === 'idle') state = 'aborted'; return; }
      const hadToken = token > 0; state = 'aborted';
      if (!hadToken) return;
      try { await host.request({ op: 'abort', token, reason: String(reason).slice(0, 120) }); } catch { /* el nativo limpia huérfanos al iniciar */ }
    },
    stats: () => ({ state, seq, sentBytes, receivedBytes, queuedBytes, peakQueuedBytes, crc32: crc, info }),
  };
  return sink;
}

/** Pide al nativo abrir el menú de compartir/guardar del archivo ya verificado. */
export function shareSavedExport(host, token) {
  return host.request({ op: 'share', token });
}
