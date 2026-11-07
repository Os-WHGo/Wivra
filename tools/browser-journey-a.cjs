#!/usr/bin/env node
// Beta journey A (Claude), ONE session of the real editor in Chromium, no step faked:
// capture import (manifest + video with a voice) → edit (9:16 + title) → add a separate music track →
// automatic subtitles (whisper.cpp, pinned pack, network blocked while listening) → export with the
// STABLE engine (MediaRecorder) → ffprobe/ffmpeg on the file: duration, video + audio, seek, pictures,
// subtitles burned in the picture, voice + music in the sound.
// «Guardar en galería» is native (Android MediaStore / iPhone Photos) and is NOT covered here.
// Chromium on Linux is not mobile evidence.
// Usage: node tools/browser-journey-a.cjs <video.webm> <video/type> <tiny|base> <lang>
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/tmp/wivra-media-lab/node_modules/playwright')); }

const [, , video, type, model, lang] = process.argv;
const root = path.resolve(__dirname, '..');
const html = 'file://' + path.join(root, 'app/dist/agentcut.html') + '#new';
const driver = fs.readFileSync(path.join(__dirname, 'whisper-wasm/e2e-driver.js'), 'utf8');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wivra-journey-a-'));
let failed = false;
const ok = (m) => console.log('ok - ' + m);
const fail = (m) => { failed = true; console.log('not ok - ' + m); };

// Separate music: a quiet 220 Hz tone, a little shorter than the clip (it plays under it).
const clipSeconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString()) || 6;
const musicFile = path.join(work, 'music.wav');
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `sine=frequency=220:duration=${Math.max(1, clipSeconds - 0.5).toFixed(2)}`,
  '-af', 'volume=0.25', '-ar', '48000', '-ac', '1', musicFile]);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(html);
  // 1–2. Capture import + subtitles: the shared driver presses the same buttons as a person.
  await page.evaluate((i) => { window.__wvE2EIn = i; }, { phase: 'full', cancel: false, videoB64: fs.readFileSync(video).toString('base64'),
    videoName: 'Wivra_JourneyA.mov', videoType: type, model, lang, words: [] });
  // Whisper listens to the imported clip's own voice, so subtitles come right after the import; the edit and
  // the music follow in the same session, before the export (every journey step runs once, nothing skipped).
  await page.addScriptTag({ content: driver });
  await page.waitForFunction(() => window.__wvE2EOut !== 'running', null, { timeout: 15 * 60 * 1000, polling: 500 });
  const sub = JSON.parse(await page.evaluate(() => window.__wvE2EOut));
  const recognized = sub.steps.find((s) => s.name === 'recognized');
  (sub.ok ? ok : fail)(`capture imported and subtitled (${recognized ? recognized.count : 0} texts${sub.error ? ', ' + sub.error.split('\n')[0] : ''})`);

  // 3–5. Edit, add music, export with the stable engine.
  const out = await page.evaluate(async ({ music }) => {
    /* global session, media, edit, addTrackFile, totalDuration, recordProject, tlTime */
    const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const step = (ops) => { const r = edit(ops, { ripple: false }); if (!r.ok) throw new Error(JSON.stringify(ops) + ' → ' + r.message); };
    step([{ op: 'set_format', aspect: '9:16', fit: 'cover' }]);
    const total = totalDuration(session.project);
    step([{ op: 'add_text', text: 'WIVRA', start: 0.1, duration: Math.min(1.5, total - 0.2) }]);
    const audioBefore = (session.project.audioClips || []).length;
    // The editor's «Audio» button path: the track goes where the play head is (moved to 0 first).
    tlTime = 0;
    await addTrackFile(new File([bytes(music)], 'musica.wav', { type: 'audio/wav' }), 'audio');
    const audioAfter = (session.project.audioClips || []).length;
    const p = session.project;
    const subs = p.texts.filter((t) => t.text !== 'WIVRA').map((t) => ({ start: t.start, end: t.end }));
    const res = await recordProject({ project: p, media, onProgress: () => {} });
    if (!res?.blob) return { error: 'no export blob' };
    const buf = new Uint8Array(await res.blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { totalBefore: total, total: totalDuration(p), ext: res.ext, mime: res.mime, musicAdded: audioAfter > audioBefore, texts: p.texts.length, subs, b64: btoa(bin) };
  }, { music: fs.readFileSync(musicFile).toString('base64') });
  await browser.close();
  if (out.error) { fail(out.error); process.exit(1); }
  console.log(`  project ${out.total.toFixed(2)} s, ${out.texts} texts (title + subtitles), music ${out.musicAdded}, export ${out.mime}`);
  (out.musicAdded ? ok : fail)('separate music track added');
  (Math.abs(out.total - out.totalBefore) < 0.05 ? ok : fail)(`the music plays under the clip (project ${out.totalBefore.toFixed(2)} → ${out.total.toFixed(2)} s)`);
  (out.subs.length > 0 ? ok : fail)('subtitles present in the project at export');

  const file = path.join(work, 'journey-a.' + (out.ext || 'webm'));
  fs.writeFileSync(file, Buffer.from(out.b64, 'base64'));
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]).toString());
  const v = probe.streams.find((s) => s.codec_type === 'video'), au = probe.streams.find((s) => s.codec_type === 'audio');
  let dur = Number(probe.format.duration);
  if (!Number.isFinite(dur)) dur = Number(execFileSync('ffprobe', ['-v', 'error', '-count_packets', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());
  console.log(`  file ${probe.format.format_name}, ${dur.toFixed(2)} s, video ${v && v.codec_name} ${v && v.width}x${v && v.height}, audio ${au && au.codec_name}`);
  (v && au ? ok : fail)('video and audio streams');
  (Math.abs(dur - out.total) < 0.6 ? ok : fail)(`duration ${dur.toFixed(2)} s ≈ project ${out.total.toFixed(2)} s`);
  (v && Math.abs(v.width / v.height - 9 / 16) < 0.01 ? ok : fail)('9:16 portrait');
  try { execFileSync('ffmpeg', ['-v', 'error', '-ss', String(out.total / 2), '-i', file, '-frames:v', '1', '-f', 'null', '-']); ok('seek to the middle decodes'); } catch (e) { fail('seek failed'); }

  // Subtitles burned in: bright pixels in the lower half while a subtitle is on, fewer before/after.
  const W = 90, H = 160, raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `fps=10,scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 64 << 20 });
  const frames = Math.floor(raw.length / (W * H));
  const brightLow = (t) => { const k = Math.max(0, Math.min(frames - 1, Math.round(t * 10))); let n = 0; for (let y = H / 2; y < H; y++) for (let x = 0; x < W; x++) if (raw[k * W * H + y * W + x] > 170) n++; return n; };
  // A subtitle away from the title (0.1–1.6 s), so the bright pixels are the subtitle's.
  const s0 = out.subs.filter((s) => (s.start + s.end) / 2 > 1.9).sort((a, b) => (b.end - b.start) - (a.end - a.start))[0] ||
    out.subs.slice().sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
  const during = s0 ? brightLow((s0.start + s0.end) / 2) : 0;
  const quiet = [0.05, out.total - 0.05].filter((t) => !out.subs.some((s) => t >= s.start - 0.2 && t <= s.end + 0.2));
  const outside = quiet.length ? Math.min(...quiet.map(brightLow)) : 0;
  (during > outside + 20 ? ok : fail)(`subtitle burned in the picture (bright pixels low half: ${during} with subtitle vs ${outside} without)`);

  // Sound: voice band (speech, 300–3000 Hz) and the 220 Hz music both present.
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], { maxBuffer: 64 << 20 });
  const n = Math.floor(pcm.length / 2), x = new Float64Array(n); for (let i = 0; i < n; i++) x[i] = pcm.readInt16LE(i * 2);
  const goertzel = (f) => { const w = 2 * Math.PI * f / 16000, c = 2 * Math.cos(w); let s1 = 0, s2 = 0; for (let i = 0; i < n; i++) { const s = x[i] + c * s1 - s2; s2 = s1; s1 = s; } return Math.sqrt(s1 * s1 + s2 * s2 - c * s1 * s2) / n; };
  // A pure tone is a narrow peak; speech spreads over nearby frequencies.
  const music = goertzel(220), off = (goertzel(200) + goertzel(240)) / 2;
  let rms = 0; for (let i = 0; i < n; i++) rms += x[i] * x[i]; rms = Math.sqrt(rms / Math.max(1, n));
  console.log(`  sound RMS ${rms.toFixed(0)}, 220 Hz ${music.toFixed(1)}, 200/240 Hz ${off.toFixed(1)}`);
  (rms > 300 ? ok : fail)('sound present');
  (music > 3 * off ? ok : fail)('the separate music (220 Hz) is in the export');
  console.log('# not covered here: «Guardar en galería» (native, Android/iPhone)');
  if (errors.length) fail('page errors: ' + errors.join(' | '));
  if (!failed) fs.rmSync(work, { recursive: true, force: true }); else console.log('kept ' + work);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
