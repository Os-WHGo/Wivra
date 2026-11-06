// Wivra · is this the SAME file? (W97/W102 integrity fix, Claude)
// Name, size and modification date do not prove two files are equal. The bytes are compared in
// pieces (bounded memory: two pieces at a time), stopping at the first difference. If the
// comparison cannot be completed, the answer is "not proven the same" (false): the caller then
// treats the file as new, never as a copy of something else.

export const IDENTITY_CHUNK = 8 * 1024 * 1024;

async function piece(blob, from, to) {
  return new Uint8Array(await blob.slice(from, to).arrayBuffer());
}

/**
 * a, b: Blob/File. Resolves true only when both have exactly the same bytes.
 * opts.onProgress(fraction 0..1) for long comparisons; opts.alive() may throw to cancel.
 */
export async function sameBytes(a, b, { chunk = IDENTITY_CHUNK, onProgress = null, alive = null } = {}) {
  if (!a || !b || typeof a.size !== 'number' || a.size !== b.size) return false;
  if (a === b) return true;
  try {
    for (let at = 0; at < a.size; at += chunk) {
      if (alive) alive();
      const to = Math.min(a.size, at + chunk);
      const [x, y] = await Promise.all([piece(a, at, to), piece(b, at, to)]);
      if (x.length !== y.length) return false;
      for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
      if (onProgress) onProgress(to / a.size);
    }
    return true;
  } catch (e) {
    if (e && e.code === 'CANCELLED') throw e;
    return false;      // unreadable: not proven the same
  }
}
