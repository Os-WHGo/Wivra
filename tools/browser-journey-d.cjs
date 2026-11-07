#!/usr/bin/env node
// Beta journey D (Claude), ONE session of the real editor in Chromium, nothing faked except the phone's
// native pieces: long video (> 10 min) imported as a capture → automatic subtitles in long mode (the phone's
// native PCM piece reader replaced by a stand-in that answers like it, as in browser-whisper-long.cjs) →
// multitrack (separate music through the «Audio» button path + a title) → the editor's own Export buttons
// with «Directo al teléfono, por partes»: the progressive sink streams to a native-protocol stand-in that
// writes each piece to disk (as Android's MediaStore writer) → ffprobe/ffmpeg on the file: duration, pictures
// at the start, middle and end, subtitle burned near its time, music at the start AND at the end.
// Chromium on Linux is not mobile evidence; the export runs in real time (as the stable engine does).
// Usage: node tools/browser-journey-d.cjs <video> <video/type> <sound16k.wav> <tiny|base> <lang> <word@second>
'use strict';
const { execFileSync } = require('node:child_process');
const { crc32 } = require('node:zlib');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/tmp/wivra-media-lab/node_modules/playwright')); }

const [, , video, type, wav, model, lang, expect = ''] = process.argv;
const html = 'file://' + path.join(path.resolve(__dirname, '..'), 'app/dist/agentcut.html') + '#new';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wivra-journey-d-'));
let failed = false;
const ok = (m) => console.log('ok - ' + m);
const fail = (m) => { failed = true; console.log('not ok - ' + m); };
const wavBytes = fs.readFileSync(wav), dataAt = wavBytes.indexOf(Buffer.from('data')) + 8;
const pcmB64 = wavBytes.subarray(dataAt).toString('base64');
const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString());
const musicFile = path.join(work, 'music.wav');      // 220 Hz, 8 kHz mono: small even for 11 min
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=220:duration=${(seconds - 1).toFixed(1)}`,
  '-af', 'volume=0.25', '-ar', '8000', '-ac', '1', musicFile]);

// Native writer stand-in with the Android protocol (binary WVX1 frames, order, CRC, publish on finish).
const sessions = new Map(); let nextToken = 100; let published = null;
function nativeHandle(msg) {
  if (msg.bin) {
    const buf = Buffer.from(msg.bin, 'base64');
    const magic = buf.readUInt32LE(0), rid = buf.readUInt32LE(4), token = buf.readUInt32LE(8), seq = buf.readUInt32LE(12);
    const s = sessions.get(token);
    if (magic !== 0x31585657 || !s || s.state !== 'open') return { rid, ok: false, error: 'bad frame' };
    if (seq !== s.seq) return { rid, ok: false, error: 'out of order' };
    const data = buf.subarray(16);
    fs.appendFileSync(s.file, data); s.seq++; s.bytes += data.length; s.crc = crc32(data, s.crc);
    return { rid, ok: true, seq, written: s.bytes };
  }
  const j = JSON.parse(msg.json); const { rid } = j;
  if (j.op === 'hello') return { rid, ok: true, arrayBuffer: true, protocol: 1 };
  if (j.op === 'begin') {
    const token = nextToken++, file = path.join(work, `Wivra_Export_${token}.${j.ext || 'webm'}.partial`);
    fs.writeFileSync(file, Buffer.alloc(0));
    sessions.set(token, { file, seq: 0, bytes: 0, crc: 0, state: 'open' });
    return { rid, ok: true, token };
  }
  const s = sessions.get(j.token); if (!s) return { rid, ok: false, error: 'unknown session' };
  if (j.op === 'abort') { s.state = 'aborted'; fs.rmSync(s.file, { force: true }); return { rid, ok: true }; }
  if (j.op === 'finish') {
    const disk = fs.readFileSync(s.file), diskCrc = crc32(disk) >>> 0;
    if (disk.length !== j.bytes || diskCrc !== j.crc32 || s.seq !== j.chunks) { fs.rmSync(s.file, { force: true }); return { rid, ok: false, error: 'verification failed' }; }
    const final = s.file.replace(/\.partial$/, ''); fs.renameSync(s.file, final); s.state = 'published'; published = final;
    return { rid, ok: true, token: j.token, bytes: disk.length, crc32: diskCrc, displayName: path.basename(final), location: 'simulated' };
  }
  return { rid, ok: false, error: 'op' };
}

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.exposeFunction('__wivraNativeBridge', (msg) => JSON.stringify(nativeHandle(msg)));
  await page.addInitScript(() => {
    const toB64 = (ab) => { const u = new Uint8Array(ab); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
    window.WivraExportNative = { onmessage: null, postMessage(m) {
      const msg = m instanceof ArrayBuffer ? { bin: toB64(m) } : { json: m };
      window.__wivraNativeBridge(msg).then((reply) => this.onmessage && this.onmessage({ data: reply }));
    } };
  });
  await page.goto(html);
  await page.waitForFunction(() => typeof wvGetPack === 'function' && window.WivraEditorImport && typeof addTrackFile === 'function');
  const setup = await page.evaluate(async ({ vid, type, pcmB64, model, lang }) => {
    /* global $, session, wvGetPack, totalDuration, openSheet */
    const bin = atob(pcmB64), all = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) all[i] = bin.charCodeAt(i);
    const st = window.__wvLong = { calls: 0, maxSpan: 0 };
    window.WivraAudioPcm = { extract: async (name, size, from, to) => {      // same answer as the phone's bridge
      st.calls++; st.maxSpan = Math.max(st.maxSpan, to - from); if (!(to - from <= 35)) return { ok: false, error: 'PIECE' };
      const a = Math.floor(from * 16000) * 2, b = Math.floor(to * 16000) * 2, piece = new Uint8Array(b - a); piece.set(all.subarray(a, Math.min(b, all.length)));
      let s = ''; for (let i = 0; i < piece.length; i += 0x8000) s += String.fromCharCode(...piece.subarray(i, i + 0x8000)); return { ok: true, rate: 16000, b64: btoa(s) };
    } };
    window.confirm = () => true;
    const bytes = Uint8Array.from(atob(vid), (c) => c.charCodeAt(0));
    const mf = JSON.stringify({ schemaVersion: 2, captureID: 'journey-d', cameraSource: 'iphone-avfoundation', audioSource: 'none', selectedInputName: null, originalVideoFile: 'Wivra_D.mov', originalAudioFile: null, muxedVideoFile: null, audioStartOffsetSeconds: null, createdAtISO8601: '2026-11-07T10:00:00Z', tracks: [], muxedFromTrackIDs: [] });
    await window.WivraEditorImport.importFiles([new File([mf], 'Wivra_D.wivra.json'), new File([bytes], 'Wivra_D.mov', { type })]);
    $('wvModel').value = model; $('wvLang').value = lang; await $('wvGet').onclick();
    if (!(await wvGetPack(model))) return { error: 'no voice pack' };
    for (const sel of ['#langList button[data-l="es"]', '#onbSkip']) { const b = document.querySelector(sel); if (b) b.click(); }
    openSheet('sText'); const t0 = performance.now(); await $('wvRun').onclick();
    return { duration: totalDuration(session.project), subtitleMs: Math.round(performance.now() - t0), calls: st.calls, maxSpan: st.maxSpan,
      texts: session.project.texts.map((x) => ({ start: x.start, end: x.end, text: x.text })) };
  }, { vid: fs.readFileSync(video).toString('base64'), type, pcmB64, model, lang });
  if (setup.error) { fail(setup.error); process.exit(1); }
  console.log(`  ${setup.duration.toFixed(0)} s project, ${setup.texts.length} subtitles in ${(setup.subtitleMs / 1000).toFixed(0)} s (${setup.calls} native pieces, longest ${setup.maxSpan.toFixed(1)} s)`);
  (setup.duration > 600 ? ok : fail)('project longer than the 10-minute single-decode limit');
  (setup.texts.length > 0 && setup.maxSpan <= 35 ? ok : fail)('long-mode subtitles from native-sized pieces');
  for (const e of expect.split(',').filter(Boolean)) {
    const [word, sec] = e.split('@'), hit = setup.texts.find((t) => t.text.toLowerCase().includes(word.toLowerCase()));
    (hit && Math.abs(hit.start - Number(sec)) < 12 ? ok : fail)(`«${word}» recognized near ${sec} s${hit ? ` (at ${hit.start.toFixed(1)} s)` : ' (missing)'}`);
  }

  const exp = await page.evaluate(async ({ music }) => {
    /* global edit, addTrackFile, tlTime, nativeExportAvailable */
    const bytes = Uint8Array.from(atob(music), (c) => c.charCodeAt(0));
    const before = totalDuration(session.project);
    tlTime = 0; await addTrackFile(new File([bytes], 'musica_larga.wav', { type: 'audio/wav' }), 'audio');
    const r = edit([{ op: 'add_text', text: 'WIVRA', start: 0.1, duration: 3 }], { ripple: false }); if (!r.ok) return { error: r.message };
    const lanes = { main: session.project.clips.length, audio: (session.project.audioClips || []).length, texts: session.project.texts.length };
    const native = nativeExportAvailable();
    $('bExp').onclick(); $('expSave').value = 'auto';
    const t0 = performance.now(); await $('expGo').onclick();
    return { before, after: totalDuration(session.project), lanes, native, ms: Math.round(performance.now() - t0),
      done: $('expDone').style.display === 'block' && $('expMsg').className !== 'bad', msg: $('expMsg').textContent.slice(0, 300) };
  }, { music: fs.readFileSync(musicFile).toString('base64') });
  await browser.close();
  if (exp.error) { fail(exp.error); process.exit(1); }
  console.log(`  multitrack ${JSON.stringify(exp.lanes)}; export ${(exp.ms / 1000).toFixed(0)} s: ${exp.msg}`);
  (exp.native ? ok : fail)('the editor offered the native progressive save');
  (Math.abs(exp.after - exp.before) < 0.05 && exp.lanes.audio >= 1 ? ok : fail)('separate music under the long clip (project length unchanged)');
  (exp.done && published ? ok : fail)('exported and published by the native-protocol writer (verified size + CRC)');
  if (!published) process.exit(1);

  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', published]).toString());
  let dur = Number(probe.format.duration);
  // MediaRecorder WebM declares no duration: take the last video packet time.
  if (!Number.isFinite(dur)) dur = Math.max(...execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v', '-show_entries', 'packet=pts_time', '-of', 'csv=p=0', published], { maxBuffer: 64 << 20 })
    .toString().split(/\s+/).map((x) => parseFloat(x)).filter(Number.isFinite));
  const v = probe.streams.find((s) => s.codec_type === 'video'), au = probe.streams.find((s) => s.codec_type === 'audio');
  console.log(`  file ${(fs.statSync(published).size / 1e6).toFixed(1)} MB, ${dur.toFixed(1)} s, video ${v && v.codec_name} ${v && v.width}x${v && v.height}, audio ${au && au.codec_name}`);
  (v && au ? ok : fail)('video and audio streams');
  (Math.abs(dur - setup.duration) < 2 ? ok : fail)(`duration ${dur.toFixed(1)} s ≈ project ${setup.duration.toFixed(1)} s`);
  const frameAt = (t) => execFileSync('ffmpeg', ['-v', 'error', '-ss', String(Math.max(0, t)), '-i', published, '-frames:v', '1', '-vf', 'scale=90:160', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 20 });
  const stats = (buf, y0) => { let lit = 0, bright = 0; for (let y = y0; y < 160; y++) for (let x = 0; x < 90; x++) { const p = buf[y * 90 + x]; if (p > 12) lit++; if (p > 170) bright++; } return { lit, bright }; };
  const marks = [1.5, setup.duration / 2, setup.duration - 1.5].map((t) => ({ t, ...stats(frameAt(t), 0) }));
  (marks.every((m) => m.lit > 1000) ? ok : fail)(`pictures at start, middle and end (${marks.map((m) => `${m.t.toFixed(0)} s: ${m.lit}`).join(' · ')})`);
  const late = setup.texts.filter((t) => t.start > 600).sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
  if (late) {
    const on = stats(frameAt((late.start + late.end) / 2), 80).bright, off = stats(frameAt(setup.duration / 2), 80).bright;
    (on > off + 20 ? ok : fail)(`late subtitle burned in the picture at ${((late.start + late.end) / 2).toFixed(0)} s (${on} bright vs ${off})`);
  } else fail('no subtitle after 10 min to check');
  const tone = (from) => {
    const pcm = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(from), '-t', '20', '-i', published, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], { maxBuffer: 8 << 20 });
    const n = Math.floor(pcm.length / 2), x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = pcm.readInt16LE(i * 2);
    const g = (f) => { const w = 2 * Math.PI * f / 8000, c = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = 0; i < n; i++) { const s = x[i] + c * s1 - s2; s2 = s1; s1 = s; } return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) / Math.max(1, n); };
    return g(220) / Math.max(1e-9, (g(200) + g(240)) / 2);
  };
  const first = tone(5), last = tone(Math.max(0, setup.duration - 30));
  (first > 3 && last > 3 ? ok : fail)(`music present at the start and at the end (tone ratio ${first.toFixed(1)} / ${last.toFixed(1)})`);
  if (errors.length) fail('page errors: ' + errors.join(' | '));
  if (!failed) fs.rmSync(work, { recursive: true, force: true }); else console.log('kept ' + work);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
