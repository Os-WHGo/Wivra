// Reparación de contenedores de exportación con grabaciones REALES de MediaRecorder (Chromium)
// y un MP4 fragmentado H.264/AAC tipo Safari. Sin recodificar: los bloques se comparan byte a byte. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseWebm, webmMakeSeekable, parseMp4, fmp4AddDurationAndIndex, inspectExport, finalizeExportBytes } from '../media-container.mjs';
import { verifyExportedMedia, pickMime, MIME_CANDIDATES, MIME_CANDIDATES_IOS } from '../export.mjs';

const fx = (name) => new Uint8Array(readFileSync(new URL('./fixtures/mediarecorder/' + name, import.meta.url)));
const WEBM = 'chromium-vp8-opus.webm', MP4_CHROMIUM = 'chromium-avc1-opus-fragmented.mp4', MP4_AAC = 'ffmpeg-h264-aac-fragmented.mp4';

/** Concatenación de todos los bloques (SimpleBlock/BlockGroup) en orden: el contenido real del video. */
function webmBlocks(bytes) {
  const w = parseWebm(bytes), parts = [];
  for (const cl of w.clusters) for (const c of cl.children) if (c.id === 0xA3 || c.id === 0xA0) parts.push(bytes.subarray(c.start, c.end));
  return Buffer.concat(parts.map((p) => Buffer.from(p)));
}

test('MediaRecorder WebM arrives without duration or seek index (the real problem)', () => {
  const info = inspectExport(fx(WEBM));
  assert.equal(info.container, 'webm');
  assert.equal(info.declaresDuration, false);
  assert.equal(info.seekIndex, false);
  assert.ok(info.video && info.audio);
  assert.ok(info.durationMs > 1800 && info.durationMs < 2600, String(info.durationMs));
});

test('WebM repair adds Duration and Cues and keeps every audio/video block byte-identical', () => {
  const src = fx(WEBM), r = webmMakeSeekable(src), info = inspectExport(r.bytes);
  assert.equal(info.declaresDuration, true);
  assert.equal(info.seekIndex, true);
  assert.ok(r.cues >= 1 && r.cues <= r.clusters);
  assert.equal(Math.round(info.durationMs), Math.round(inspectExport(src).durationMs));
  assert.ok(webmBlocks(src).equals(webmBlocks(r.bytes)), 'blocks must be copied untouched');
  // Idempotent: repairing a repaired file keeps the same media and duration.
  const again = webmMakeSeekable(r.bytes);
  assert.ok(webmBlocks(again.bytes).equals(webmBlocks(src)));
  assert.equal(Math.round(again.durationMs), Math.round(r.durationMs));
});

test('WebM repair drops only an incomplete trailing block and never invents data', () => {
  const src = fx(WEBM), cut = src.subarray(0, src.length - 777);
  const r = webmMakeSeekable(cut), before = webmBlocks(src);
  const after = webmBlocks(r.bytes);
  assert.ok(after.length < before.length && before.subarray(0, after.length).equals(after));
});

test('fragmented MP4 from Chromium declares duration 0; repair writes the measured duration (mehd only) and an mfra index', () => {
  const src = fx(MP4_CHROMIUM), before = inspectExport(src);
  assert.equal(before.fragmented, true);
  assert.equal(before.declaresDuration, false);
  assert.equal(before.seekIndex, false);
  const r = fmp4AddDurationAndIndex(src), after = inspectExport(r.bytes);
  assert.equal(r.changed, true); assert.equal(r.indexAdded, true);
  assert.equal(after.declaresDuration, true); assert.equal(after.seekIndex, true);
  assert.ok(Math.abs(after.durationMs - before.durationMs) < 1);
  // Every moof/mdat after the moov keeps its bytes; only moov grew by the 16-byte mehd.
  const a = parseMp4(src), b = parseMp4(r.bytes);
  assert.equal(b.moofs.length, a.moofs.length);
  a.moofs.forEach((m, i) => assert.ok(Buffer.from(src.subarray(m.start, m.end)).equals(Buffer.from(r.bytes.subarray(b.moofs[i].start, b.moofs[i].end)))));
  assert.equal(b.moofs[0].start - a.moofs[0].start, 16);
  // mvhd stays 0 (spec): AVFoundation otherwise counted the duration twice.
  assert.equal(new DataView(r.bytes.buffer).getUint32(b.mvhd.body + (r.bytes[b.mvhd.body] === 1 ? 24 : 16)), 0);
});

test('an MP4 that already has an index is not given a second one', () => {
  const src = fx(MP4_AAC), r = fmp4AddDurationAndIndex(src);
  assert.equal(r.indexAdded, false);
  assert.equal(inspectExport(r.bytes).declaresDuration, true);
  assert.equal(r.bytes.length, src.length + 16);
});

test('finalize never makes things worse: unknown or broken input comes back unchanged with a reason', () => {
  const junk = new Uint8Array(4000).fill(7);
  const r = finalizeExportBytes(junk);
  assert.equal(r.fixed, false); assert.equal(r.bytes, junk); assert.match(r.reason, /desconocido/);
  const truncatedMp4 = fx(MP4_CHROMIUM).subarray(0, 600);
  const t = finalizeExportBytes(truncatedMp4);
  assert.equal(t.fixed, false); assert.equal(t.bytes, truncatedMp4);
  const big = finalizeExportBytes(fx(WEBM), { maxBytes: 10 });
  assert.equal(big.fixed, false); assert.match(big.reason, /demasiado grande/);
});

test('verification separates broken files (errors) from honest warnings', () => {
  const ok = verifyExportedMedia({ video: true, audio: true, durationMs: 10050, declaresDuration: true, seekIndex: true }, { plannedSeconds: 10, expectAudio: true });
  assert.deepEqual([ok.ok, ok.errors.length, ok.warnings.length], [true, 0, 0]);
  const drift = verifyExportedMedia({ video: true, audio: true, durationMs: 9000, declaresDuration: true, seekIndex: true }, { plannedSeconds: 10, expectAudio: true });
  assert.equal(drift.ok, true); assert.match(drift.warnings[0], /9 s frente a 10 s/);
  const noAudio = verifyExportedMedia({ video: true, audio: false, durationMs: 10000 }, { plannedSeconds: 10, expectAudio: true });
  assert.match(noAudio.warnings.join(' '), /sin pista de audio|no tiene pista de audio/);
  const broken = verifyExportedMedia({ video: false, audio: true, durationMs: 2000 }, { plannedSeconds: 10 });
  assert.equal(broken.ok, false); assert.equal(broken.errors.length, 2);
});

test('format choice: H.264+AAC MP4 first everywhere; iOS never prefers WebM; elsewhere WebM beats H.264+Opus MP4', () => {
  const chromiumLinux = (t) => ['video/mp4;codecs=avc1', 'video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm', 'video/mp4'].includes(t);
  assert.equal(pickMime(chromiumLinux), 'video/webm;codecs=vp8,opus');
  assert.equal(pickMime(chromiumLinux, { platform: 'ios' }), 'video/mp4;codecs=avc1');
  const withAac = (t) => t === 'video/mp4;codecs=avc1,mp4a.40.2' || t.startsWith('video/webm');
  assert.equal(pickMime(withAac), 'video/mp4;codecs=avc1,mp4a.40.2');
  const safariWebmToo = (t) => t === 'video/mp4' || t.startsWith('video/webm');
  assert.equal(pickMime(safariWebmToo, { platform: 'ios' }), 'video/mp4');
  assert.equal(MIME_CANDIDATES[0], MIME_CANDIDATES_IOS[0]);
  assert.ok(MIME_CANDIDATES_IOS.indexOf('video/webm') > MIME_CANDIDATES_IOS.indexOf('video/mp4'));
});

test('memory export repairs and verifies the container before handing the Blob out', () => {
  const code = readFileSync(new URL('../export.mjs', import.meta.url), 'utf8');
  assert.match(code, /const fixed = finalizeExportBytes\(new Uint8Array\(await raw\.arrayBuffer\(\)\)\);/);
  assert.match(code, /if \(verification && !verification\.ok\) throw new Error\('El video exportado no es válido: '/);
  assert.match(code, /sink\.finish\(\{ expectedDurationMs: Math\.round\(plan\.total \* 1000\), expectAudio: hasAudio \}\)/);
  const html = readFileSync(new URL('../dist/agentcut.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('function webmMakeSeekable') > 0 && html.indexOf('function webmMakeSeekable') < html.indexOf('async function recordProject'));
});
