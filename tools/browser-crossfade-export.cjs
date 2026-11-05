#!/usr/bin/env node
// W85 end-to-end: two vertical clips (red, then blue) in the real editor →
// «Fundido cruzado» of 1 s → export with the stable engine (recordProject) →
// frames read back with ffmpeg: red before, a red+blue MIX inside the dissolve,
// blue after; duration shortened by exactly the dissolve. Chromium, not a phone. — Claude
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/tmp/wivra-media-lab/node_modules/playwright')); }

const root = path.resolve(__dirname, '..');
const html = path.join(root, 'app/dist/agentcut.html');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wivra-xfade-'));
const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
function solid(name, color) {
  const out = path.join(work, name);
  ff(['-f', 'lavfi', '-i', `color=c=${color}:size=360x640:rate=24:duration=4`, '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
    '-c:v', 'libvpx', '-b:v', '200k', '-deadline', 'realtime', '-c:a', 'libopus', '-shortest', '-f', 'webm', out]);
  return fs.readFileSync(out).toString('base64');
}
const manifest = (id, file) => JSON.stringify({ schemaVersion: 2, captureID: id, cameraSource: 'iphone-avfoundation', audioSource: 'none',
  selectedInputName: null, originalVideoFile: file, originalAudioFile: null, muxedVideoFile: null, audioStartOffsetSeconds: null,
  createdAtISO8601: '2026-11-05T10:00:00Z', tracks: [], muxedFromTrackIDs: [] });
let failed = 0;
const fail = (m) => { console.log('not ok - ' + m); failed++; };
const ok = (m) => console.log('ok - ' + m);

(async () => {
  const red = solid('red.webm', 'red'), blue = solid('blue.webm', 'blue');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + html);
  if (process.env.NOXFADE) await page.evaluate(() => { window.__noXfade = true; });
  await page.waitForFunction(() => !!window.WivraEditorImport);
  const out = await page.evaluate(async ({ red, blue, mA, mB }) => {
    const bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    await window.WivraEditorImport.importFiles([new File([mA], 'Wivra_A.wivra.json', { type: 'application/json' }), new File([bytes(red)], 'Wivra_A.mov', { type: 'video/webm' })]);
    await window.WivraEditorImport.importFiles([new File([mB], 'Wivra_B.wivra.json', { type: 'application/json' }), new File([bytes(blue)], 'Wivra_B.mov', { type: 'video/webm' })]);
    /* global session, media, recordProject, planCrossfades, edit */
    edit([{ op: 'set_format', aspect: '9:16', fit: 'cover' }], { ripple: false });
    if (window.__noXfade) { const p0 = session.project; const r0 = await recordProject({ project: p0, media, onProgress: () => {} }); const b0 = new Uint8Array(await r0.blob.arrayBuffer()); let s0=''; for (let i = 0; i < b0.length; i += 0x8000) s0 += String.fromCharCode(...b0.subarray(i, i + 0x8000)); return { clips: p0.clips.length, layers: 1, ext: r0.ext, b64: btoa(s0), dbg: 'baseline' }; }
    const xp = planCrossfades(session.project, 1, (id) => (media[id] && media[id].w > 0 ? { w: media[id].w, h: media[id].h } : null));
    if (!xp.ok) return { error: xp.error };
    const r = edit(xp.ops, { ripple: false }); if (!r.ok) return { error: r.message };
    const p = session.project;
    const res = await recordProject({ project: p, media, onProgress: () => {} });
    if (!res?.blob) return { error: 'no export blob' };
    const buf = new Uint8Array(await res.blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { clips: p.clips.length, layers: p.overlayClips.length, ext: res.ext, b64: btoa(bin), dbg: JSON.stringify({ clips: p.clips, layers: p.overlayClips }) };
  }, { red, blue, mA: manifest('cap-red', 'Wivra_A.mov'), mB: manifest('cap-blue', 'Wivra_B.mov') });
  await browser.close();
  if (out.error) { fail(out.error); process.exit(1); }
  if (out.clips === 2 && out.layers === 1) ok('two clips on the main line + one dissolve layer'); else fail(`clips ${out.clips}, layers ${out.layers}`);
  const file = path.join(work, 'export.' + (out.ext || 'webm'));
  fs.writeFileSync(file, Buffer.from(out.b64, 'base64'));
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]).toString());
  const v = probe.streams.find(s => s.codec_type === 'video'), dur = Number(probe.format.duration);
  if (Math.abs(dur - 7) < 0.5) ok(`duration ${dur.toFixed(2)} s (8 s minus the 1 s dissolve)`); else fail(`duration ${dur} s, expected about 7 s`);
  // Canvas recordings only add a frame when the picture changes, so seek-free decoding at a fixed
  // 10 fps (each sample repeats the last real frame) is the reliable way to read a moment.
  const all = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'fps=10,scale=36:64', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 * 1024 * 1024 });
  const frame = (t) => { const k = Math.round(t * 10), i = k * 36 * 64 * 3 + (32 * 36 + 18) * 3; return i + 2 < all.length ? [all[i], all[i + 1], all[i + 2]] : []; };
  const before = frame(1.5), after = frame(4.6);
  // Inside the 1 s dissolve (3.0–4.0 s): some moment shows red and blue at once, and blue grows over time.
  const window = [3.1, 3.3, 3.5, 3.7, 3.9].map(frame), mixed = window.filter((p) => p[0] > 40 && p[2] > 40), mid = mixed[0] || window[2];
  const grows = window[4][2] >= window[0][2];
  if (before[0] > 180 && before[2] < 70) ok(`before the cut: red ${before}`); else fail(`before the cut not red: ${before}`);
  if (mixed.length && grows) ok(`inside the dissolve: red and blue mixed (${window.map((p) => p.join('/')).join(' → ')})`); else fail(`inside the dissolve not mixed: ${window.map((p) => p.join('/')).join(' → ')}`);
  if (after[2] > 180 && after[0] < 70) ok(`after the cut: blue ${after}`); else fail(`after the cut not blue: ${after}`);
  if (errors.length) fail('page errors: ' + errors.join(' | '));
  if (!failed) fs.rmSync(work, { recursive: true, force: true }); else console.log('kept ' + file);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
