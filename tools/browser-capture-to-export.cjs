#!/usr/bin/env node
// W75 end-to-end: two-camera capture bundle → real editor import → export with
// the stable engine (recordProject) → ffprobe/ffmpeg checks on the file.
// Main camera = red with a 440 Hz tone, second camera = blue without audio,
// PiP declared top-left. Synthetic media in Chromium Linux; not a phone. — Claude
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/tmp/wivra-media-lab/node_modules/playwright')); }

const root = path.resolve(__dirname, '..');
const html = path.join(root, 'app/dist/agentcut.html');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wivra-cap-export-'));
const ff = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);

function solid(name, color, seconds, withTone) {
  const out = path.join(work, name);
  const args = ['-f', 'lavfi', '-i', `color=c=${color}:size=360x640:rate=24:duration=${seconds}`];
  if (withTone) args.push('-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`);
  args.push('-c:v', 'libvpx', '-b:v', '200k', '-deadline', 'realtime');
  if (withTone) args.push('-c:a', 'libopus', '-shortest'); else args.push('-an');
  ff([...args, '-f', 'webm', out]);
  return fs.readFileSync(out).toString('base64');
}

const red = solid('red.webm', 'red', 4, true);
const blue = solid('blue.webm', 'blue', 4, false);
const manifest = JSON.stringify({
  schemaVersion: 2, captureID: 'cap-e2e', cameraSource: 'iphone-avfoundation', audioSource: 'none',
  selectedInputName: null, originalVideoFile: 'Wivra_A.mov', originalAudioFile: null, muxedVideoFile: null,
  audioStartOffsetSeconds: null, createdAtISO8601: '2026-11-05T10:00:00Z', tracks: [], muxedFromTrackIDs: [],
  multicam: { schema: 'wivra-multicam-v1', secondaryVideoFile: 'Wivra_B.mov', secondaryOffsetSeconds: 0,
    primaryPosition: 'back', secondaryPosition: 'front', corner: 'top-left', audio: 'primary' }
});

function fail(msg) { console.log('not ok - ' + msg); process.exitCode = 1; }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + html);
  await page.waitForFunction(() => !!window.WivraEditorImport);
  const out = await page.evaluate(async ({ manifest, red, blue }) => {
    const bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    await window.WivraEditorImport.importFiles([
      new File([manifest], 'Wivra_A.wivra.json', { type: 'application/json' }),
      new File([bytes(red)], 'Wivra_A.mov', { type: 'video/webm' }),
      new File([bytes(blue)], 'Wivra_B.mov', { type: 'video/webm' })
    ]);
    /* global session, media, recordProject */
    const p = session.project;
    const res = await recordProject({ project: p, media, onProgress: () => {} });
    if (!res?.blob) return { error: 'no export blob', res: JSON.stringify(res).slice(0, 300) };
    const buf = new Uint8Array(await res.blob.arrayBuffer());
    let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { clips: p.clips.length, overlays: p.overlayClips.length, ext: res.ext, mime: res.mime, b64: btoa(bin) };
  }, { manifest, red, blue });
  await browser.close();
  if (out.error) { fail(out.error + ' ' + (out.res || '')); return; }
  if (out.clips !== 1 || out.overlays !== 1) fail(`project has ${out.clips} clips / ${out.overlays} overlays`);
  else console.log('ok - imported as main clip + PiP layer');
  const file = path.join(work, 'export.' + (out.ext || 'webm'));
  fs.writeFileSync(file, Buffer.from(out.b64, 'base64'));
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]).toString());
  const v = probe.streams.find(s => s.codec_type === 'video');
  const a = probe.streams.find(s => s.codec_type === 'audio');
  const dur = Number(probe.format.duration);
  if (!v) fail('no video stream'); else console.log(`ok - video ${v.codec_name} ${v.width}x${v.height}`);
  if (!a) fail('no audio stream: main camera sound lost'); else console.log(`ok - audio ${a.codec_name}`);
  if (!(Math.abs(dur - 4) < 0.6)) fail(`duration ${dur} s, expected about 4 s`); else console.log(`ok - duration ${dur.toFixed(2)} s`);
  // One frame at 2 s as raw RGB: top-left area must be blue (PiP), centre red (main).
  const w = v.width, h = v.height;
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', '2', '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  const px = (fx, fy) => { const x = Math.floor(fx * w), y = Math.floor(fy * h), i = (y * w + x) * 3; return [raw[i], raw[i + 1], raw[i + 2]]; };
  const tl = px(0.15, 0.12), mid = px(0.5, 0.6);
  const isBlue = c => c[2] > 150 && c[0] < 90, isRed = c => c[0] > 150 && c[2] < 90;
  if (!isBlue(tl)) fail(`top-left should be the blue inset, got ${tl}`); else console.log(`ok - inset visible top-left ${tl}`);
  if (!isRed(mid)) fail(`centre should be the red main camera, got ${mid}`); else console.log(`ok - main camera in the centre ${mid}`);
  // Sound is the main camera's 440 Hz tone (the inset is silent), not silence.
  const vol = require('node:child_process').spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /mean_volume: (-?[\d.]+) dB/.exec(vol.stderr || '');
  if (!m) fail('could not measure export audio level');
  else if (Number(m[1]) < -45) fail(`export audio is silent (${m[1]} dB)`);
  else console.log(`ok - main camera sound present (mean ${m[1]} dB)`);
  if (errors.length) fail('page errors: ' + errors.join('; '));
  fs.rmSync(work, { recursive: true, force: true });
  if (!process.exitCode) console.log('ok - capture → editor → export chain');
})().catch(e => { console.error(e); process.exit(1); });
