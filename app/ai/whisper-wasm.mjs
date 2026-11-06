// W86 (Claude): local automatic subtitles with whisper.cpp compiled to WebAssembly.
// Pure helpers (no DOM): voice-pack catalog, chunking, merging into the existing
// transcript contract. The engine runs in a Web Worker; the model is downloaded only
// after explicit consent, verified by SHA-256 and kept on the phone for offline use.
// Multilingual models only (no English-only variants). whisper.cpp: MIT.
import { splitText } from '../subtitles.mjs';

/** Voice packs (multilingual, Q5_1). Source pinned to one revision of the official repo. */
export const WV_REV = '5359861';
export const WV_MODELS = {
  // bytes and SHA-256 measured in CI (workflow «Wivra Whisper WASM», run 42132064790) at WV_REV.
  tiny: { id: 'tiny', file: 'ggml-tiny-q5_1.bin', name: 'Ligero', approxMB: 31, bytes: 32152673, sha256: '818710568da3ca15689e31a743197b520007872ff9576237bda97bd1b469c3d7' },
  base: { id: 'base', file: 'ggml-base-q5_1.bin', name: 'Preciso', approxMB: 57, bytes: 59707625, sha256: '422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898' },
};
/** SHA-256 of app/vendor/whisper/wivra-whisper.js (whisper.cpp 0c7be69, Emscripten 3.1.74), checked at build and before each use. */
export const WV_ENGINE_SHA256 = '2bf5f898fa61e4f3774ba45a2308b959170eb731b764fd58283cc4273f643213';
export const wvModelUrl = (m) => `https://huggingface.co/ggerganov/whisper.cpp/resolve/${WV_REV}/${m.file}`;
export const WV_LANGS = ['auto', 'es', 'en', 'pt', 'fr', 'de', 'it', 'ja', 'zh'];
export const WV_RATE = 16000;
export const WV_CHUNK_S = 30;          // whisper's own window; keeps memory small and progress visible
/** Temperature fallback: whisper re-decodes doubtful pieces (repetition loops, low confidence) at higher
 *  temperatures. On: protects against loops («de la parte de la parte…», seen with Tiny without it); costs
 *  time only on doubtful pieces. Measured in CI W86 (docs/WIVRA_W86_AUTO_SUBTITLES_WHISPER_2026-11-06.md). */
export const WV_FALLBACK = true;
/** Silence put before each piece: speech that starts right at 0.0 s loses its first word (measured in CI W86). */
export const WV_LEAD_S = 0.5;
export const WV_MAX_AUDIO_S = 10 * 60;  // one job: up to 10 min (decoding the video's sound is the memory peak; longer: by parts)

/** Which pack to suggest from what the device tells (Android exposes deviceMemory; iOS does not). */
export function wvSuggestModel(deviceMemoryGB) {
  return Number.isFinite(deviceMemoryGB) && deviceMemoryGB > 0 && deviceMemoryGB < 4 ? 'tiny' : 'base';
}

/**
 * Split [0, n) samples into ≈30 s pieces. With pcm, each cut moves to the quietest 0.25 s
 * inside the last 3 s of the window, so words are not cut in half. → [{ from, to }]
 */
export function wvChunks(n, pcm = null, rate = WV_RATE, chunkS = WV_CHUNK_S) {
  const out = [], win = Math.round(chunkS * rate), look = Math.round(3 * rate), step = Math.round(0.25 * rate);
  let from = 0;
  while (from < n) {
    let to = Math.min(n, from + win);
    if (pcm && to < n && to - look > from + step) {
      let best = to, bestE = Infinity;
      for (let s = to - look; s + step <= to; s += step) {
        let e = 0; for (let i = s; i < s + step; i++) e += pcm[i] * pcm[i];
        if (e < bestE) { bestE = e; best = s + (step >> 1); }
      }
      to = best;
    }
    out.push({ from, to });
    from = to;
  }
  return out;
}

const NOISE = /^\s*[\[(（【].*[\])）】]\s*$/u;   // [BLANK_AUDIO], (música), [Applause]…

/**
 * Merge whisper.cpp JSON results of each piece into one transcript for the contract.
 * pieces: [{ offset: seconds on the TIMELINE of the piece's sample 0, from: first valid second, limit: last valid second, json }]
 * → { version:1, engine:'whisper.cpp', language, segments:[{start,end,text}] }
 */
export function wvMerge(pieces) {
  const segs = []; let language = 'und';
  for (const p of pieces) {
    let r; try { r = typeof p.json === 'string' ? JSON.parse(p.json) : p.json; } catch { continue; }
    if (!r || r.error || !Array.isArray(r.transcription)) continue;
    if (r.result && typeof r.result.language === 'string' && language === 'und') language = r.result.language;
    for (const t of r.transcription) {
      const text = String(t.text || '').replace(/\s+/g, ' ').trim();
      if (!text || NOISE.test(text)) continue;
      let start = Math.round((p.offset + t.offsets.from / 1000) * 1000) / 1000;
      if (Number.isFinite(p.from)) start = Math.max(start, p.from);      // never inside the added lead silence
      let end = Math.round((p.offset + t.offsets.to / 1000) * 1000) / 1000;
      if (Number.isFinite(p.limit)) end = Math.min(end, p.limit);
      if (!(end > start)) continue;
      segs.push({ start, end, text });
    }
  }
  segs.sort((a, b) => a.start - b.start);
  const clean = [];
  for (const s of segs) {      // the contract forbids overlaps: trim the previous cue
    const prev = clean[clean.length - 1];
    if (prev && s.start < prev.end) { prev.end = s.start; if (!(prev.end > prev.start)) clean.pop(); }
    clean.push({ ...s });
  }
  return { version: 1, engine: 'whisper.cpp', language, segments: clean.filter((s) => s.end > s.start) };
}

/** No message from the engine for this long while Wivra is on screen = the engine was lost (e.g. the system closed it). */
export const WV_STALL_MS = 10 * 60 * 1000;

/** Minutes left (rounded up, ≥ 1) after some pieces, from the measured pace; null before the first piece or at the end. */
export function wvEtaMinutes(doneSamples, totalSamples, elapsedMs) {
  if (!(doneSamples > 0) || !(elapsedMs > 0) || !(totalSamples > doneSamples)) return null;
  return Math.max(1, Math.ceil((elapsedMs / doneSamples) * (totalSamples - doneSamples) / 60000));
}

/** A chat request for automatic subtitles (8 languages), not to import, save or remove them. */
const WV_ASK = /(subt[ií]tul|subtitl|legenda|sous-titr|untertitel|sottotitol|\bcaptions?\b|transcrib|transcrev|transkrib|trascriv|字幕)/iu;
const WV_NOT = /(\.srt|\.vtt|\bsrt\b|\bvtt\b|import|guard|export|quita|borra|elimina|remove|delete|apaga|entfern|lösch|supprim|rimuov|cancella|apag|削除|删除)/iu;
export const wvWantsAutoSubtitles = (text) => { const t = String(text || ''); return t.length <= 200 && WV_ASK.test(t) && !WV_NOT.test(t); };

/** Characters per automatic caption: short enough for a vertical video, never words lost. */
export const WV_CAPTION_CHARS = 42;

/**
 * whisper segments (can be a long sentence, up to the 120-char text limit and beyond) → short captions:
 * first at sentence ends, then at spaces (≤ max chars); time shared by length, with no gaps or overlaps.
 */
export function wvCaptionCues(segments, max = WV_CAPTION_CHARS) {
  const out = [];
  for (const s of segments) {
    const parts = String(s.text).split(/(?<=[.!?…。！？])\s+/u).flatMap((p) => splitText(p.trim(), max)).filter(Boolean);
    const total = parts.reduce((n, p) => n + p.length, 0) || 1; let t = s.start;
    parts.forEach((p, i) => {
      const e = i === parts.length - 1 ? s.end : Math.round((t + ((s.end - s.start) * p.length) / total) * 1000) / 1000;
      if (e > t) out.push({ start: t, end: e, text: p }); t = e;
    });
  }
  return out;
}

/** SHA-256 as lowercase hex (WebCrypto; available in WebView/WKWebView and Node 18+). */
export async function wvSha256Hex(buf, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error('WebCrypto no disponible');
  const d = new Uint8Array(await subtle.digest('SHA-256', buf));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Worker body: loads the single-file engine (given as source text before this) and serves jobs. */
export const WV_WORKER_GLUE = `
let wvMod = null;
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      wvMod = await createWivraWhisper({ onWivraProgress: (p) => postMessage({ type: 'progress', p }) });
      const bytes = new Uint8Array(m.model), mp = wvMod._malloc(bytes.length);
      if (!mp) { postMessage({ type: 'ready', ok: false, why: 'MEMORY' }); return; }
      wvMod.HEAPU8.set(bytes, mp); const ok = wvMod.load(mp, bytes.length); wvMod._free(mp);
      postMessage({ type: 'ready', ok: !!ok, info: String(wvMod.systemInfo() || '') });
    } else if (m.type === 'run') {
      const pcm = m.pcm, sp = wvMod._malloc(pcm.length * 4);
      if (!sp) { postMessage({ type: 'result', id: m.id, json: '{"error":"MEMORY"}' }); return; }
      wvMod.HEAPF32.set(pcm, sp >> 2); const json = wvMod.transcribe(sp, pcm.length, m.lang, m.fallback ? 1 : 0); wvMod._free(sp);
      postMessage({ type: 'result', id: m.id, json });
    }
  } catch (err) { postMessage({ type: 'error', message: String((err && err.message) || err) }); }
};`;
