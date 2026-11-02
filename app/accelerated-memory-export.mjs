import { acceleratedCutEligibility, renderAcceleratedCuts } from './accelerated-cut-renderer.mjs';

// Wivra P0-W: bounded in-memory random access adapter ONLY for controlled QA.
// Not the native long-video exporter. No offline Mediabunny SDK without an
// explicitly pinned build, and no automatic switch from MediaRecorder.
export const ACCELERATED_QA_MAX_BYTES = 96 * 1024 * 1024;

export function createBoundedRandomMemoryWriter({ maximumBytes = ACCELERATED_QA_MAX_BYTES } = {}) {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1024)
    throw new Error('Límite de memoria acelerada inválido.');
  let data = new Uint8Array(0), highest = 0, covered = [];
  const addInterval = (start, end) => {
    const merged = [];
    for (const [s,e] of [...covered, [start,end]].sort((a,b)=>a[0]-b[0])) {
      const prev = merged[merged.length-1];
      if (prev && s <= prev[1]) prev[1] = Math.max(prev[1],e);
      else merged.push([s,e]);
    }
    covered = merged;
  };
  return {
    get highWaterBytes() { return highest; },
    async writeAt(position, bytes) {
      if (!Number.isSafeInteger(position) || position < 0 ||
          !(bytes instanceof Uint8Array) || !bytes.length ||
          position + bytes.length > maximumBytes) throw new Error('Límite de exportación rápida en memoria excedido.');
      const end = position + bytes.length;
      if (end > data.length) {
        let size = Math.max(1024, data.length || 1024);
        while (size < end) size = Math.min(maximumBytes, size * 2);
        if (size < end) throw new Error('Memoria insuficiente para exportación acelerada.');
        const enlarged = new Uint8Array(size); enlarged.set(data); data = enlarged;
      }
      data.set(bytes,position); highest = Math.max(highest,end);
      addInterval(position,end);
      return bytes.length;
    },
    finalize() {
      // Patches are legal. Holes are not: an all-zero missing MP4 region could
      // otherwise pass as a valid-looking Blob without ever being written.
      if (!highest || covered.length !== 1 || covered[0][0] !== 0 || covered[0][1] !== highest)
        throw new Error('Exportación acelerada incompleta: faltan bytes.');
      return data.slice(0,highest);
    }
  };
}

/** Executable cut-only QA path; unsupported edits FAIL before opening output. */
export async function recordExperimentalAcceleratedProject({
  project, media, M, isCancelled = () => false, loudnessGainDb = 0,
  maxOutputBytes = ACCELERATED_QA_MAX_BYTES, onProgress = () => {}
}) {
  const selected = acceleratedCutEligibility(project,media,{loudnessGainDb});
  if (!selected.eligible) throw new Error('Montaje no compatible con aceleración experimental: '+selected.reason);
  if (!M || !M.Output) throw new Error('Mediabunny no está incorporado en esta compilación offline.');
  const writer = createBoundedRandomMemoryWriter({maximumBytes:maxOutputBytes});
  const t0 = typeof performance === 'object' ? performance.now() : Date.now();
  const stats = await renderAcceleratedCuts({
    M, sourceUrl:selected.sourceUrl,cuts:selected.cuts,width:selected.width,
    height:selected.height,writeAt:(pos,bytes)=>writer.writeAt(pos,bytes),
    expectedAudio:null,isCancelled
  });
  if (isCancelled()) throw new Error('Exportación acelerada cancelada.');
  const bytes = writer.finalize();
  if (bytes.length < 1000) throw new Error('Salida acelerada vacía o incompleta.');
  const mime = stats.container === 'mp4' ? 'video/mp4' : 'video/webm';
  onProgress({t:selected.totalSeconds,total:selected.totalSeconds,pct:1});
  return {
    blob:new Blob([bytes],{type:mime}),mime,ext:stats.container,
    w:selected.width,h:selected.height,
    seconds:((typeof performance === 'object' ? performance.now() : Date.now())-t0)/1000,
    hasAudio:!!stats.audioCodec,skippedAudio:[],skippedOverlay:[],
    textBeyondEnd:false,
    // Never let a QA-only output claim the native verified/gallery status.
    experimental:true,verifiedOnDevice:false,
    acceleration:stats
  };
}
