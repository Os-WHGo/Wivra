// Subtítulos automáticos EN EL TELÉFONO: motor Whisper (OpenAI, licencia MIT) compilado a WebAssembly con whisper.cpp (MIT). — Claude
// Todo corre en un Web Worker: ni el audio ni el video salen del teléfono. Lo único que se baja es el MODELO de voz (una vez, con permiso, y queda guardado).
// El motor (app/vendor/whisper/libmain.mjs) lo empaqueta @timur00kh/whisper.wasm 0.1.1 (MIT), ver app/vendor/whisper/NOTICE.md.
// Aquí solo hay lógica de enlace: tabla de modelos, lectura de la salida, limpieza de segmentos y el worker. Lo de la pantalla está en app/template.html.

// Modelos de ggerganov/whisper.cpp en Hugging Face (formato ggml, cuantizados «q5_1»: pesan menos). `mb` = tamaño aproximado. NO se verificó el hash de estos archivos
// (el README de whisper.cpp solo publica hashes de los modelos sin cuantizar): se comprueba la cabecera «ggml» y que el tamaño sea razonable.
export const WHISPER_MODELS = {
  fast: { id: 'fast', mb: 31, url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin' },
  balanced: { id: 'balanced', mb: 57, url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin' },
};
export const WHISPER_LANGS = ['auto', 'es', 'en', 'pt', 'fr', 'de', 'ja', 'zh', 'it'];
const MAGIC_GGML = [0x6c, 0x6d, 0x67, 0x67];      // «lmgg» (0x67676d6c little-endian)

/** ¿Los bytes bajados parecen un modelo ggml de ese tamaño? (±40 % del tamaño esperado) → null si sí, o el motivo en español. */
export function modelProblem(bytes, model) {
  if (!bytes || bytes.byteLength < 1e6) return 'El archivo del modelo llegó incompleto.';
  const u = new Uint8Array(bytes, 0, 4);
  if (MAGIC_GGML.some((b, i) => u[i] !== b)) return 'El archivo no es un modelo de voz válido.';
  const mb = bytes.byteLength / 1e6;
  if (mb < model.mb * 0.6 || mb > model.mb * 1.4) return `El modelo pesa ${mb.toFixed(0)} MB y se esperaban unos ${model.mb} MB.`;
  return null;
}

/** «[00:00:03.520 --> 00:00:06.000]   texto» → { startMs, endMs, text } | null */
export function parseWhisperLine(line) {
  const m = /^\[(\d+):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d+):(\d{2}):(\d{2})[.,](\d{1,3})\]\s*(.*)$/.exec(String(line).trim());
  if (!m) return null;
  const ms = (h, mi, s, f) => ((Number(h) * 60 + Number(mi)) * 60 + Number(s)) * 1000 + Number(String(f).padEnd(3, '0'));
  return { startMs: ms(m[1], m[2], m[3], m[4]), endMs: ms(m[5], m[6], m[7], m[8]), text: m[9] };
}

// Whisper pone etiquetas como [BLANK_AUDIO], [Música], (music), ♪ cuando no hay voz; y a veces «alucina» créditos en los silencios. Esto no son subtítulos.
const TAGS = /\[[^\]]{0,40}\]|\([^)]{0,40}\)|[♪♫]+/g;
const HALLUCINATIONS = [/amara\.org/i];
export function cleanSegmentText(text) {
  const t = String(text || '').replace(TAGS, ' ').replace(/\s+/g, ' ').trim();
  if (!/[\p{L}\p{N}]/u.test(t) || HALLUCINATIONS.some((r) => r.test(t))) return '';
  return t;
}

/**
 * Segmentos (ms) → cues { start, end } en segundos, listos para add_text: sin etiquetas, sin solapes, y partidos en trozos de hasta `maxChars` (por palabras, con el tiempo repartido
 * en proporción al largo). Un segmento que apenas dura (< minSeconds) se pega al anterior si están pegados y caben juntos.
 */
export function segmentsToCues(segments, { maxChars = 80, minSeconds = 0.8 } = {}) {
  const raw = (segments || []).map((s) => ({ start: s.startMs / 1000, end: s.endMs / 1000, text: cleanSegmentText(s.text) }))
    .filter((s) => s.text && s.end > s.start).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const s of raw) {
    const l = merged[merged.length - 1];
    if (l && s.end - s.start < minSeconds && s.start - l.end < 0.3 && l.text.length + 1 + s.text.length <= maxChars) { l.end = Math.max(l.end, s.end); l.text += ' ' + s.text; } else merged.push({ ...s });
  }
  const out = [];
  for (const c of merged) {
    if (c.text.length <= maxChars) { out.push(c); continue; }
    const words = c.text.split(' '), parts = []; let cur = '';
    for (const w of words) { if (cur && (cur + ' ' + w).length > maxChars) { parts.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; }
    if (cur) parts.push(cur);
    const total = parts.reduce((a, p) => a + p.length, 0); let t = c.start;
    parts.forEach((p, i) => { const d = (c.end - c.start) * p.length / total, e = i === parts.length - 1 ? c.end : t + d; out.push({ start: t, end: e, text: p }); t = e; });
  }
  for (let i = 0; i < out.length - 1; i++) if (out[i].end > out[i + 1].start) out[i].end = Math.max(out[i].start + 0.05, out[i + 1].start);      // sin solapes
  return out.map((c) => ({ start: Math.round(c.start * 1000) / 1000, end: Math.round(c.end * 1000) / 1000, text: c.text }));
}

// ---- Worker (se arma como texto y se crea desde un Blob: la app es UN solo archivo) ----
// Mensajes: {type:'init', libText, model} → {type:'ready'} | {type:'run', id, audio, lang} → {type:'segment', id, line}* → {type:'done', id} | {type:'error', message}
export const WORKER_SOURCE = `
let mod = null, inst = null, runId = null;
const post = (m) => self.postMessage(m);
self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      const url = URL.createObjectURL(new Blob([m.libText], { type: 'text/javascript' }));
      const factory = (await import(url)).default; URL.revokeObjectURL(url);
      mod = await factory({ print: (t) => { if (runId !== null && typeof t === 'string' && t.charAt(0) === '[') post({ type: 'segment', id: runId, line: t }); }, printErr: (t) => post({ type: 'log', text: String(t) }) });
      mod.FS_createDataFile('/', 'whisper.bin', new Uint8Array(m.model), true, true, true);
      inst = mod.init('whisper.bin');
      if (!inst) throw new Error('No se pudo abrir el modelo de voz.');
      post({ type: 'ready' });
    } else if (m.type === 'run') {
      runId = m.id; mod.full_default(inst, m.audio, m.lang || 'auto', 1, false); runId = null; post({ type: 'done', id: m.id });
    }
  } catch (err) { runId = null; post({ type: 'error', message: String((err && err.message) || err) }); }
};`;

/**
 * createWhisperEngine({ libText, model: ArrayBuffer }) → { ready: Promise, run(audio16kMono, { lang, onSegment }) → Promise<{ segments, ms }>, dispose() }
 * Un trabajo a la vez. `dispose()` mata el worker (cancela lo que esté corriendo).
 */
export function createWhisperEngine({ libText, model, WorkerImpl = (typeof Worker !== 'undefined' ? Worker : null) }) {
  if (!WorkerImpl) throw new Error('Este navegador no puede crear procesos en segundo plano (Worker).');
  const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' })), w = new WorkerImpl(url);
  let seq = 0, pending = null, fail = null, dead = false, logs = [];
  const ready = new Promise((res, rej) => { fail = rej; w.addEventListener('message', (e) => { if (e.data.type === 'ready') res(); }); });
  ready.catch(() => {});
  w.addEventListener('message', (e) => {
    const m = e.data;
    if (m.type === 'log') { logs.push(m.text); if (logs.length > 20) logs.shift(); }
    else if (m.type === 'error') { const err = new Error(m.message); if (pending) { pending.rej(err); pending = null; } fail(err); }
    else if (m.type === 'segment' && pending && m.id === pending.id) { const s = parseWhisperLine(m.line); if (s) { pending.segments.push(s); if (pending.onSegment) pending.onSegment(s); } }
    else if (m.type === 'done' && pending && m.id === pending.id) { const p = pending; pending = null; p.res({ segments: p.segments, ms: Math.round(performance.now() - p.t0) }); }
  });
  w.addEventListener('error', (e) => { const err = new Error(e.message || 'Falló el proceso de voz.'); if (pending) { pending.rej(err); pending = null; } fail(err); });
  w.postMessage({ type: 'init', libText, model }, [model]);
  return {
    ready,
    logs: () => logs.slice(),
    run(audio, { lang = 'auto', onSegment } = {}) {
      if (dead) return Promise.reject(new Error('El motor de voz se cerró.'));
      if (pending) return Promise.reject(new Error('Ya hay una transcripción en curso.'));
      return ready.then(() => new Promise((res, rej) => { pending = { id: ++seq, segments: [], onSegment, res, rej, t0: performance.now() }; w.postMessage({ type: 'run', id: pending.id, audio, lang }, [audio.buffer]); }));
    },
    dispose() { dead = true; try { w.terminate(); } catch { /* ya cerrado */ } URL.revokeObjectURL(url); fail(new Error('Cancelado.')); if (pending) { pending.rej(new Error('Cancelado.')); pending = null; } },      // también corta la espera de «ready» (si se cancela mientras arranca)
  };
}

// ---- Modelo bajado: se guarda en IndexedDB para no volver a bajarlo ----
const DB = 'wivra-whisper', STORE = 'models';
const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const tx = async (mode, f) => { const db = await idb(); try { return await new Promise((res, rej) => { const t = db.transaction(STORE, mode), q = f(t.objectStore(STORE)); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); } finally { db.close(); } };
export const modelCacheGet = (id) => tx('readonly', (s) => s.get(id)).catch(() => undefined);
export const modelCachePut = (id, bytes) => tx('readwrite', (s) => s.put(bytes, id));
export const modelCacheDelete = (id) => tx('readwrite', (s) => s.delete(id));
export const modelCacheHas = (id) => tx('readonly', (s) => s.count(id)).then((n) => n > 0).catch(() => false);

/** Baja el modelo con progreso y lo guarda. onProgress(0..1). signal: AbortSignal. → ArrayBuffer */
export async function downloadModel(model, { onProgress = () => {}, signal, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(model.url, { signal });
  if (!res.ok) throw new Error(`No se pudo bajar el modelo (${res.status}).`);
  const total = Number(res.headers.get('content-length')) || model.mb * 1e6, reader = res.body && res.body.getReader();
  let bytes;
  if (!reader) { bytes = await res.arrayBuffer(); }
  else {
    const chunks = []; let got = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; onProgress(Math.min(1, got / total)); }
    const all = new Uint8Array(got); let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; } bytes = all.buffer;
  }
  const bad = modelProblem(bytes, model); if (bad) throw new Error(bad);
  try { await modelCachePut(model.id, bytes.slice(0)); } catch { /* sin espacio para guardarlo: se usa esta vez y se baja de nuevo la próxima */ }
  onProgress(1); return bytes;
}
