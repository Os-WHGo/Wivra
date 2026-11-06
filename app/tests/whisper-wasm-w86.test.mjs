// W86 (Claude): pure helpers for local whisper.cpp subtitles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WV_MODELS, WV_LANGS, wvModelUrl, wvSuggestModel, wvChunks, wvMerge, wvSha256Hex } from '../ai/whisper-wasm.mjs';
import { validateTranscript } from '../ai/transcript-contract.mjs';

test('only multilingual Q5_1 packs, pinned to one revision of the official repository', () => {
  for (const m of Object.values(WV_MODELS)) {
    assert.match(m.file, /^ggml-(tiny|base)-q5_1\.bin$/); assert.doesNotMatch(m.file, /\.en[.-]/);
    assert.match(wvModelUrl(m), /^https:\/\/huggingface\.co\/ggerganov\/whisper\.cpp\/resolve\/[0-9a-f]{7,40}\/ggml-/);
  }
  assert.deepEqual(WV_LANGS.slice(0, 3), ['auto', 'es', 'en']);
  assert.equal(wvSuggestModel(2), 'tiny'); assert.equal(wvSuggestModel(8), 'base'); assert.equal(wvSuggestModel(undefined), 'base');
});

test('chunks of ≈30 s cut at the quietest moment near the end, covering everything once', () => {
  const rate = 1000, n = 70 * rate, pcm = new Float32Array(n).fill(0.5);
  for (let i = 28.5 * rate; i < 28.8 * rate; i++) pcm[i] = 0;          // a pause at 28.5–28.8 s
  const c = wvChunks(n, pcm, rate, 30);
  assert.equal(c[0].from, 0); assert.equal(c[c.length - 1].to, n);
  for (let i = 1; i < c.length; i++) assert.equal(c[i].from, c[i - 1].to);
  assert.ok(c[0].to >= 28.5 * rate && c[0].to <= 28.8 * rate, String(c[0].to));
  assert.deepEqual(wvChunks(10, null, 1, 30), [{ from: 0, to: 10 }]);
});

test('merge: timeline offsets, noise tags dropped, no overlaps, valid for the transcript contract', () => {
  const a = JSON.stringify({ result: { language: 'es' }, transcription: [
    { offsets: { from: 0, to: 2000 }, text: ' Hola a todos.' }, { offsets: { from: 1800, to: 4000 }, text: ' Bienvenidos.' },
    { offsets: { from: 4000, to: 5000 }, text: ' [BLANK_AUDIO]' }] });
  const b = JSON.stringify({ result: { language: 'es' }, transcription: [{ offsets: { from: 0, to: 3000 }, text: ' Hoy grabamos.' }] });
  const t = wvMerge([{ offset: 10, limit: 40, json: a }, { offset: 40, limit: 42, json: b }, { offset: 50, json: '{"error":"CANCELLED"}' }]);
  assert.equal(t.language, 'es');
  assert.deepEqual(t.segments, [{ start: 10, end: 11.8, text: 'Hola a todos.' }, { start: 11.8, end: 14, text: 'Bienvenidos.' }, { start: 40, end: 42, text: 'Hoy grabamos.' }]);
  assert.ok(validateTranscript(t, { duration: 60 }).ok);
});

test('SHA-256 hex matches a known vector', async () => {
  assert.equal(await wvSha256Hex(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('the engine is vendored, pinned by SHA-256, embedded compressed in the editor and checked again before use', async () => {
  const { readFileSync } = await import('node:fs'); const { createHash } = await import('node:crypto'); const { gunzipSync } = await import('node:zlib');
  const { WV_ENGINE_SHA256 } = await import('../ai/whisper-wasm.mjs');
  const js = readFileSync(new URL('../vendor/whisper/wivra-whisper.js', import.meta.url));
  assert.equal(createHash('sha256').update(js).digest('hex'), WV_ENGINE_SHA256);
  assert.match(readFileSync(new URL('../vendor/whisper/LICENSE-whisper.cpp.txt', import.meta.url), 'utf8'), /MIT License/);
  const html = readFileSync(new URL('../dist/agentcut.html', import.meta.url), 'utf8');
  const m = /<script type="text\/plain" id="wvEngine" data-notr>([A-Za-z0-9+/=]+)<\/script>/.exec(html); assert.ok(m, 'engine tag in dist');
  assert.equal(createHash('sha256').update(gunzipSync(Buffer.from(m[1], 'base64'))).digest('hex'), WV_ENGINE_SHA256);
  const tpl = readFileSync(new URL('../template.html', import.meta.url), 'utf8');
  assert.match(tpl, /wvSha256Hex\(src\) !== WV_ENGINE_SHA256/);                 // runtime re-check
  assert.match(tpl, /confirm\(aiT\('Se descargará el paquete de voz/);           // download only after consent
  assert.doesNotMatch(tpl.slice(tpl.indexOf('let wvWorker'), tpl.indexOf("$('subFile').addEventListener")), /wvGet\.click\(|\.onclick\(\)/);  // never auto-downloads
});

test('every voice-pack text is translated into the 7 other languages', async () => {
  const { readFileSync } = await import('node:fs'); const { loadI18n } = await import('../i18n-parse.mjs');
  const tpl = readFileSync(new URL('../template.html', import.meta.url), 'utf8'), data = loadI18n();
  const block = tpl.slice(tpl.indexOf('let wvWorker'), tpl.indexOf("$('subFile').addEventListener"));
  const box = tpl.slice(tpl.indexOf('<div id="wvBox"'), tpl.indexOf('<div class="row"><button id="subSrt"'));
  const keys = new Set([...block.matchAll(/aiT\('((?:[^'\\]|\\.)+)'/g)].map((x) => x[1]));
  for (const t of box.replace(/<option[^>]*data-notr[^>]*>[^<]*<\/option>/g, '').matchAll(/>([^<>]*[A-Za-zÁ-ú][^<>]*)</g)) keys.add(t[1].trim());
  for (const t of box.matchAll(/aria-label="([^"]+)"/g)) keys.add(t[1]);
  for (const m of Object.values(WV_MODELS)) keys.add(m.name);
  assert.ok(keys.size > 30, String(keys.size));
  for (const lang of ['en', 'pt', 'fr', 'de', 'ja', 'zh', 'it']) for (const k of keys) assert.ok(data[lang][k], `${lang}: ${k}`);
});

test('time left from the measured pace; nothing before the first piece', async () => {
  const { wvEtaMinutes } = await import('../ai/whisper-wasm.mjs');
  assert.equal(wvEtaMinutes(0, 100, 0), null);
  assert.equal(wvEtaMinutes(30, 90, 60000), 2);          // 30 s of audio took 1 min → 60 s left ≈ 2 min
  assert.equal(wvEtaMinutes(30, 31, 1000), 1);           // never «0 min»
  assert.equal(wvEtaMinutes(90, 90, 60000), null);
});

test('chat requests for automatic subtitles in 8 languages; import, save or remove are not', async () => {
  const { wvWantsAutoSubtitles: w } = await import('../ai/whisper-wasm.mjs');
  for (const t of ['Ponle subtítulos', 'subtitula el video', 'add captions', 'Add subtitles please', 'coloca legendas', 'ajoute des sous-titres', 'Untertitel hinzufügen', 'aggiungi i sottotitoli', '字幕をつけて', '加字幕', 'transcribe el audio'])
    assert.equal(w(t), true, t);
  for (const t of ['guarda los subtítulos como srt', 'importa subtítulos .vtt', 'quita los subtítulos', 'remove the captions', 'pon un texto «Hola»', 'recorta el video 1 de 2 a 5', ''])
    assert.equal(w(t), false, t);
});
