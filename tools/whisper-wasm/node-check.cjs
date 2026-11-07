#!/usr/bin/env node
// W86 (Claude): run the SAME single-file whisper.cpp WASM the editor uses, in Node
// (Linux CI). Measures time and checks words for an English and a Spanish sample with a
// multilingual model. This is NOT mobile evidence: WebView/WKWebView tests are separate.
// Usage: node node-check.cjs <wivra-whisper.js> <model.bin> <label> <wav16k> <lang> "<reference sentence>" [...]
// Prints the share of reference words recognized (accents and punctuation ignored). With
// WV_MIN_RECALL=0.7 a sample below 70 % fails the step; without it the step only reports.
'use strict';
const fs = require('node:fs');
const [, , engineJs, modelPath, label, ...rest] = process.argv;
const minRecall = Number(process.env.WV_MIN_RECALL || 0), fallback = process.env.WV_FALLBACK === '0' ? 0 : 1, shortCtx = process.env.WV_AUDIO_CTX === 'auto';
const audioCtx = (n) => { const s = n / 16000; return !shortCtx || s >= 29 ? 0 : Math.min(1500, Math.ceil(s * 50) + 128); };

function readWav16kMono(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV: ' + file);
  let off = 12, fmt = null, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(off + 10), rate: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    if (id === 'data') data = b.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size & 1);
  }
  if (!fmt || !data || fmt.ch !== 1 || fmt.rate !== 16000 || fmt.bits !== 16) throw new Error('need 16 kHz mono s16: ' + file);
  const out = new Float32Array(data.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = data.readInt16LE(i * 2) / 32768;
  return out;
}

(async () => {
  const factory = require(require('node:path').resolve(engineJs));
  const t0 = Date.now();
  const mod = await factory();
  const model = fs.readFileSync(modelPath);
  const mp = mod._malloc(model.length); mod.HEAPU8.set(model, mp);
  const loaded = mod.load(mp, model.length); mod._free(mp);
  if (!loaded) throw new Error('model did not load');
  console.log(`${label}: model ${(model.length / 1048576).toFixed(1)} MiB loaded in ${Date.now() - t0} ms; ${mod.systemInfo().trim()}`);
  let failed = 0;
  for (let i = 0; i + 2 < rest.length; i += 3) {
    const [wav, lang, reference] = [rest[i], rest[i + 1], rest[i + 2]];
    const pcm = readWav16kMono(wav), sp = mod._malloc(pcm.length * 4);
    mod.HEAPF32.set(pcm, sp >> 2);
    const s = Date.now(), json = mod.transcribe(sp, pcm.length, lang, fallback, audioCtx(pcm.length)), ms = Date.now() - s; mod._free(sp);
    const r = JSON.parse(json); if (r.error) { console.log(`not ok - ${label} ${wav}: ${r.error}`); failed++; continue; }
    const text = r.transcription.map((x) => x.text).join(' ').trim();
    const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    const said = new Set(norm(text)), ref = norm(reference), hit = ref.filter((w) => said.has(w)), recall = ref.length ? hit.length / ref.length : 0;
    const rtf = ms / 1000 / (pcm.length / 16000), bad = recall < minRecall;
    console.log(`${bad ? 'not ok' : 'ok'} - ${label}${fallback ? '' : ' no-fallback'}${shortCtx ? ' short-ctx=' + audioCtx(pcm.length) : ''} ${lang} ${(pcm.length / 16000).toFixed(1)} s audio in ${(ms / 1000).toFixed(1)} s (x${rtf.toFixed(2)} real time), detected ${r.result.language}, words right ${hit.length}/${ref.length} (${Math.round(recall * 100)} %): «${text}» missing: ${ref.filter((w) => !said.has(w)).join(',') || '—'}`);
    if (bad) failed++;
  }
  mod.free();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
