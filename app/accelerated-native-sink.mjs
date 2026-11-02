// Wivra P0-W - protocol v2 random access storage adapter for Mediabunny.
// This is NOT the existing v1 sequential MediaRecorder protocol.
// No production native host advertises v2 yet: attempting to use it must fail.
// The caller owns the temporary v2 file, never any existing user's media.
//
// Only a native host that explicitly confirms protocol 2 + randomWrite may
// be used. The native implementation will hash/inspect the *final patched*
// container, not incrementally CRC chunks whose headers may be overwritten.
export const ACCELERATED_NATIVE_PROTOCOL = 2;
export const ACCELERATED_NATIVE_MAX_WRITE_BYTES = 1024 * 1024;

export function createAcceleratedNativeSink(host, { mime, expectedDurationMs = 0,
  expectAudio = false, estimatedBytes = 0 } = {}) {
  if (!host || typeof host.request !== 'function' || typeof host.sendWriteAt !== 'function') {
    throw new Error('No existe un puente nativo de escritura aleatoria v2.');
  }
  if (!['video/mp4', 'video/webm'].includes(mime)) throw new Error('Contenedor acelerado inválido.');
  if (!(expectedDurationMs > 0 && Number.isFinite(expectedDurationMs)) ||
      !(estimatedBytes >= 0 && Number.isFinite(estimatedBytes)))
    throw new Error('Duración/tamaño estimado inválido.');
  let state = 'idle', token = null, seq = 0, maxEnd = 0, writeBytes = 0;
  let pending = Promise.resolve(), failure = null, committing = false;
  // A large random write can leave an unwritten hole before the patched MP4
  // footer. Native MUST independently check this same invariant before rename.
  let covered = [];
  const markCovered = (start, end) => {
    const merged = [];
    for (const [a, b] of [...covered, [start, end]].sort((x, y) => x[0] - y[0])) {
      const last = merged[merged.length - 1];
      if (last && a <= last[1]) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    covered = merged;
  };
  const request = (op, data = {}) => host.request({ protocol: ACCELERATED_NATIVE_PROTOCOL, op, ...data });
  const abortToken = async (id) => {
    if (!Number.isSafeInteger(id) || id <= 0) return;
    await request('abortRandom', { token: id });
  };
  return {
    get state() { return state; },
    get maxEnd() { return maxEnd; },
    get writeBytes() { return writeBytes; },
    async begin() {
      if (state !== 'idle') throw new Error('La sesión acelerada ya se inició.');
      state = 'starting';
      try {
        const caps = await request('helloRandom');
        if (state === 'aborted') throw new Error('Inicio cancelado.');
        if (caps?.protocol !== ACCELERATED_NATIVE_PROTOCOL || caps?.randomWrite !== true)
          throw new Error('El puente no ofrece escritura aleatoria verificada.');
        const result = await request('beginRandom', { mime, estimatedBytes: Math.round(estimatedBytes) });
        if (!Number.isSafeInteger(result?.token) || result.token <= 0)
          throw new Error('Token de exportación acelerada inválido.');
        token = result.token;
        if (state === 'aborted') {
          await abortToken(token); token = null;
          throw new Error('Inicio cancelado.');
        }
        state = 'open';
        return { token };
      } catch (e) {
        if (state !== 'aborted') { state = 'failed'; failure = e; }
        throw e;
      }
    },
    async writeAt(position, bytes) {
      if (state !== 'open') throw failure || new Error('No hay sesión de escritura abierta.');
      if (!Number.isSafeInteger(position) || position < 0 ||
          !(bytes instanceof Uint8Array) || bytes.length === 0 ||
          bytes.length > ACCELERATED_NATIVE_MAX_WRITE_BYTES ||
          position + bytes.length > Number.MAX_SAFE_INTEGER)
        throw new Error('Desplazamiento o bloque acelerado inválido.');
      // Copy once, since Mediabunny may recycle the chunk buffer after write.
      const data = new Uint8Array(bytes);
      const id = seq++;
      const expectedEnd = position + data.byteLength;
      const action = pending.then(async () => {
        if ((state !== 'open' && state !== 'finishing') || failure)
          throw failure || new Error('Sesión cancelada antes de escribir.');
        const r = await host.sendWriteAt({ protocol: ACCELERATED_NATIVE_PROTOCOL,
          token, seq: id, position, bytes: data });
        if (r?.seq !== id || r?.writtenBytes !== data.byteLength ||
            r?.maxEnd !== Math.max(maxEnd, expectedEnd))
          throw new Error('El puente confirmó un bloque aleatorio diferente.');
        maxEnd = Math.max(maxEnd, expectedEnd);
        markCovered(position, expectedEnd);
        writeBytes += data.byteLength;
        return data.byteLength;
      });
      // Prevent unhandled rejection on next chained write, but still notify
      // this caller and make subsequent operations fail closed.
      pending = action.catch(e => { failure ||= e; });
      return action;
    },
    async finish() {
      if (state !== 'open') throw failure || new Error('La sesión no está abierta.');
      state = 'finishing';
      await pending;
      // Cancellation can land while the pending writes are draining. An abort
      // must NEVER be followed by a late finishRandom (which could publish).
      if (state !== 'finishing') throw failure || new Error('Exportación acelerada cancelada.');
      if (failure) { state = 'failed'; throw failure; }
      if (!writeBytes || !maxEnd) { state = 'failed'; throw new Error('Archivo acelerado vacío.'); }
      if (covered.length !== 1 || covered[0][0] !== 0 || covered[0][1] !== maxEnd) {
        state = 'failed';
        throw new Error('Archivo acelerado incompleto: existen rangos sin escribir.');
      }
      // From this point native may verify/rename. Abort must not race the
      // atomic publish: the caller may abort only after failure is reported.
      committing = true;
      let saved;
      try {
        saved = await request('finishRandom', { token, bytes: maxEnd, writes: seq,
          expectedDurationMs: Math.round(expectedDurationMs), expectAudio });
        // SHA-256 is computed by native from the ACTUAL final file after all
        // arbitrary header patches. A mere positive byte count is insufficient.
        if (saved?.verified !== true || saved?.bytes !== maxEnd ||
            !/^[0-9a-f]{64}$/i.test(saved?.sha256 || '') ||
            saved?.media?.video !== true ||
            !(saved.media.durationMs > 0) ||
            (expectAudio && saved.media.audio !== true)) {
          throw new Error('El archivo acelerado no superó integridad y decodificación.');
        }
        state = 'done'; token = null;
        return saved;
      } catch (e) { committing = false; state = 'failed'; failure ||= e; throw e; }
    },
    async abort() {
      if (state === 'done' || state === 'aborted' || committing) return;
      state = 'aborted';
      await pending;
      const id = token; token = null;
      if (id != null) {
        try { await abortToken(id); } catch { /* native orphan cleanup is mandatory */ }
      }
    }
  };
}
