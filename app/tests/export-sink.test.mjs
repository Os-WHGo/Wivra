// Exportación progresiva: protocolo, integridad CRC-32, cola acotada y limpieza. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { crc32 as zlibCrc } from 'node:zlib';
import {
  crc32Update, bytesToBase64, encodeExportFrame, EXPORT_FRAME_MAGIC, EXPORT_FRAME_HEADER,
  createProgressiveExportSink, androidExportHost, iosExportHost, detectExportHost, nativeExportAvailable,
  EXPORT_SINK_MAX_QUEUED_BYTES,
} from '../export-sink.mjs';
import { exportMemoryRisk, exportEstimatedBytes } from '../export.mjs';

const blobOf = (bytes) => new Blob([bytes]);
const rand = (n, seed = 1) => { const a = new Uint8Array(n); let x = seed; for (let i = 0; i < n; i++) { x = (x * 1103515245 + 12345) >>> 0; a[i] = x >>> 24; } return a; };
const tick = () => new Promise((r) => setTimeout(r, 0));

/** Nativo simulado con las mismas reglas que Android/iOS: orden, tamaño y CRC. */
function fakeNative({ failAtSeq = -1, delayMs = 0, corruptCrc = false, beginError = null } = {}) {
  const files = new Map(); let next = 0;
  const log = [];
  return {
    files, log,
    platform: 'fake', binary: true,
    async hello() { return { ok: true, arrayBuffer: true }; },
    async request(msg) {
      log.push(msg.op);
      if (msg.op === 'begin') { if (beginError) throw new Error(beginError); const token = ++next; files.set(token, { parts: [], state: 'open', mime: msg.mime }); return { ok: true, token }; }
      const f = files.get(msg.token); if (!f) throw new Error('sesión desconocida');
      if (msg.op === 'abort') { f.state = 'deleted'; f.parts = []; return { ok: true }; }
      if (msg.op === 'finish') {
        const all = Buffer.concat(f.parts.map((p) => Buffer.from(p)));
        const crc = corruptCrc ? 1 : zlibCrc(all) >>> 0;
        if (all.length !== msg.bytes || crc !== msg.crc32 || f.parts.length !== msg.chunks) throw new Error('verificación fallida');
        f.state = 'published'; return { ok: true, bytes: all.length, crc32: crc, displayName: 'Wivra_Export_test.webm', token: msg.token };
      }
      throw new Error('op desconocida');
    },
    async sendChunk({ token, seq, bytes }) {
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      const f = files.get(token);
      if (seq === failAtSeq) throw new Error('disco lleno');
      if (seq !== f.parts.length) throw new Error('fuera de orden');
      f.parts.push(bytes.slice());
      return { ok: true, seq, written: f.parts.reduce((n, p) => n + p.length, 0) };
    },
  };
}

test('crc32Update equals zlib CRC-32 incrementally and for empty input', () => {
  const data = rand(300000, 7);
  assert.equal(crc32Update(0, new Uint8Array(0)), 0);
  assert.equal(crc32Update(0, new TextEncoder().encode('123456789')), 0xCBF43926);
  let c = 0; for (let i = 0; i < data.length; i += 4096) c = crc32Update(c, data.subarray(i, i + 4096));
  assert.equal(c, zlibCrc(data) >>> 0);
});

test('base64 and Android binary frame layout are exact', () => {
  const bytes = rand(70000, 3);
  assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString('base64'));
  const frame = new DataView(encodeExportFrame(9, 77, 5, bytes));
  assert.equal(frame.byteLength, EXPORT_FRAME_HEADER + bytes.length);
  assert.equal(frame.getUint32(0, true), EXPORT_FRAME_MAGIC);
  assert.equal(String.fromCharCode(...new Uint8Array(frame.buffer, 0, 4)), 'WVX1');
  assert.deepEqual([frame.getUint32(4, true), frame.getUint32(8, true), frame.getUint32(12, true)], [9, 77, 5]);
  assert.deepEqual(new Uint8Array(frame.buffer, EXPORT_FRAME_HEADER), bytes);
});

test('progressive sink writes chunks in order and the native file is byte-identical', async () => {
  const native = fakeNative({ delayMs: 2 });
  const sink = createProgressiveExportSink(native, { mime: 'video/webm', ext: 'webm', estimatedBytes: 1e6 });
  await sink.begin();
  const parts = Array.from({ length: 25 }, (_, i) => rand(1000 + i * 37, i + 1));
  for (const p of parts) sink.push(blobOf(p));    // como ondataavailable: sin esperar
  const r = await sink.finish();
  const expected = Buffer.concat(parts.map((p) => Buffer.from(p)));
  const written = Buffer.concat(native.files.get(sink.token).parts.map((p) => Buffer.from(p)));
  assert.equal(createHash('sha256').update(written).digest('hex'), createHash('sha256').update(expected).digest('hex'));
  assert.equal(r.bytes, expected.length);
  assert.equal(r.crc32, zlibCrc(expected) >>> 0);
  assert.equal(r.chunks, 25);
  assert.equal(native.files.get(sink.token).state, 'published');
  assert.equal(sink.stats().queuedBytes, 0);
});

test('memory stays bounded: a slow disk fails closed instead of growing the queue forever', async () => {
  const native = fakeNative({ delayMs: 50 });
  const sink = createProgressiveExportSink(native, { maxQueuedBytes: 5000 });
  await sink.begin();
  for (let i = 0; i < 10; i++) sink.push(blobOf(rand(1000, i + 1)));
  assert.match(sink.error.message, /no sigue el ritmo/);
  assert.ok(sink.stats().peakQueuedBytes <= 6000);
  await assert.rejects(sink.finish(), /no sigue el ritmo/);
  await sink.abort('test');
  assert.equal(native.files.get(sink.token).state, 'deleted');
  assert.ok(EXPORT_SINK_MAX_QUEUED_BYTES <= 64 * 1024 * 1024);
});

test('a native write failure stops further sends and abort deletes the partial file', async () => {
  const native = fakeNative({ failAtSeq: 3 });
  const sink = createProgressiveExportSink(native);
  await sink.begin();
  for (let i = 0; i < 8; i++) sink.push(blobOf(rand(500, i + 1)));
  await assert.rejects(sink.finish(), /disco lleno/);
  assert.equal(native.files.get(sink.token).parts.length, 3);
  await sink.abort('error'); await sink.abort('again');   // idempotente
  assert.equal(native.files.get(sink.token).state, 'deleted');
  assert.equal(native.log.filter((o) => o === 'abort').length, 1);
});

test('native verification mismatch is reported as failure, never as a saved video', async () => {
  const native = fakeNative({ corruptCrc: true });
  const sink = createProgressiveExportSink(native);
  await sink.begin(); sink.push(blobOf(rand(4000)));
  await assert.rejects(sink.finish(), /verificación fallida/);
  assert.equal(sink.state, 'failed');
});

test('begin failure (no storage) exposes the reason and creates no session', async () => {
  const native = fakeNative({ beginError: 'Espacio insuficiente' });
  const sink = createProgressiveExportSink(native);
  await assert.rejects(sink.begin(), /Espacio insuficiente/);
  await sink.abort();
  assert.equal(native.files.size, 0);
});

test('android adapter: JSON control, binary frames, matched replies and base64 fallback', async () => {
  for (const binary of [true, false]) {
    const sent = []; const obj = { postMessage(m) { sent.push(m); queueMicrotask(() => reply(m)); } };
    const reply = (m) => {
      let rid, out;
      if (m instanceof ArrayBuffer) { const v = new DataView(m); rid = v.getUint32(4, true); out = { ok: true, seq: v.getUint32(12, true), written: m.byteLength - EXPORT_FRAME_HEADER }; }
      else { const j = JSON.parse(m); rid = j.rid;
        out = j.op === 'hello' ? { ok: true, arrayBuffer: binary } : j.op === 'begin' ? { ok: true, token: 41 } : j.op === 'chunk' ? { ok: true, seq: j.seq, written: Buffer.from(j.b64, 'base64').length } : { ok: false, error: 'no' }; }
      obj.onmessage({ data: JSON.stringify({ rid, ...out }) });
    };
    const host = androidExportHost(obj);
    await host.hello();
    assert.equal(host.binary, binary);
    const begin = await host.request({ op: 'begin', mime: 'video/webm' });
    assert.equal(begin.token, 41);
    const r = await host.sendChunk({ token: 41, seq: 0, bytes: rand(1234) });
    assert.deepEqual([r.seq, r.written], [0, 1234]);
    assert.equal(sent[2] instanceof ArrayBuffer, binary);
    await assert.rejects(host.request({ op: 'nope' }), /no/);
  }
});

test('android adapter times out instead of hanging when the native side never replies', async () => {
  const host = androidExportHost({ postMessage() {} }, { requestMs: 30 });
  await assert.rejects(host.request({ op: 'hello' }), /no respondió a tiempo/);
});

test('ios adapter sends version 1 base64 chunks and rejects error replies', async () => {
  const seen = [];
  const handler = { postMessage: async (m) => { seen.push(m); if (m.op === 'chunk') return { ok: true, seq: m.seq, written: Buffer.from(m.b64, 'base64').length }; return { ok: false, error: 'Método no permitido.' }; } };
  const host = iosExportHost(handler);
  const r = await host.sendChunk({ token: 3, seq: 0, bytes: rand(999) });
  assert.equal(r.written, 999); assert.equal(seen[0].version, 1); assert.equal(seen[0].size, 999);
  await assert.rejects(host.request({ op: 'x' }), /Método no permitido/);
});

test('host detection prefers iOS handler, caches one adapter per channel, and is null in plain browsers', () => {
  assert.equal(detectExportHost({}), null);
  assert.equal(nativeExportAvailable({}), false);
  const android = { postMessage() {} }, g = { WivraExportNative: android };
  assert.equal(detectExportHost(g).platform, 'android');
  assert.equal(detectExportHost(g), detectExportHost(g));
  const ios = { webkit: { messageHandlers: { wivraExport: { postMessage() {} } } }, WivraExportNative: android };
  assert.equal(detectExportHost(ios).platform, 'ios');
});

test('progressive mode reports storage instead of RAM risk and keeps the old estimator unchanged', () => {
  assert.deepEqual(exportMemoryRisk(3600), { estimatedMB: 1350, level: 'critical', bufferedUntilComplete: true });
  const p = exportMemoryRisk(3600, { progressive: true });
  assert.equal(p.bufferedUntilComplete, false); assert.equal(p.level, 'normal'); assert.equal(p.storageMB, 1350);
  assert.equal(exportEstimatedBytes(10), Math.round((8_000_000 + 128_000) * 10 / 8));
});

test('recordProject keeps memory export as fallback and deletes partial files on every failure path', () => {
  const code = readFileSync(new URL('../export.mjs', import.meta.url), 'utf8');
  assert.match(code, /saveMode === 'memory' \? null : \(exportHost === undefined \? detectExportHost\(\) : exportHost\)/);
  assert.match(code, /if \(sink\) sink\.push\(e\.data\); else chunks\.push\(e\.data\);/);
  assert.match(code, /if \(sink && \(!completed \|\| !recorderClosed \|\| stopNow\(\)\)\) await sink\.abort/);
  assert.match(code, /if \(sink\) await sink\.abort\('recorder'\);/);
  assert.match(code, /catch \(error\) \{ await sink\.abort\('finish'\);/);
  // A storage failure must never be reported as a user cancellation.
  assert.ok(code.indexOf("if (sink && sink.error) throw") < code.indexOf('if (cancelled || isCancelled()) return { cancelled: true }'));
  const html = readFileSync(new URL('../dist/agentcut.html', import.meta.url), 'utf8');
  assert.match(html, /function createProgressiveExportSink/);
  assert.match(html, /<option value="memory">En memoria \(anterior\)<\/option>/);
  assert.ok(html.indexOf('function createProgressiveExportSink') < html.indexOf('async function recordProject'));
});
