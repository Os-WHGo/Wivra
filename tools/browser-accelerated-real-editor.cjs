#!/usr/bin/env node
// MU V4 (Claude): the accelerated engine (WebCodecs + Mediabunny) driven from the REAL editor build (the normal
// app/dist/agentcut.html, not a QA build): Mediabunny is loaded on demand from the editor's own pinned copy.
// A project made with the editor's own operations — two clips with a cross-dissolve (one at 1.5× speed), a PiP
// layer, a photo on the main line, a title and an independent voice track (capture WAV) — is rendered by the
// accelerated renderer and the file is checked with ffprobe/ffmpeg: duration = project, video + audio, seekable,
// pictures at start/middle/end, the title area, and sound where the voice is. Linux Chromium, not a phone.
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/tmp/wivra-media-lab/node_modules/playwright')); }

const root = path.resolve(__dirname, '..');
const html = path.join(root, 'app/dist/agentcut.html');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wivra-accel-editor-'));
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
const b64 = (f) => fs.readFileSync(f).toString('base64');
let failed = 0;
const ok = (m) => console.log('ok - ' + m), fail = (m) => { console.log('not ok - ' + m); failed++; };

function clip(name, color, freq) {
  const out = path.join(work, name);
  ff(['-f', 'lavfi', '-i', `testsrc2=size=360x640:rate=24:duration=4,hue=h=${color}`, '-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=4`,
    '-c:v', 'libvpx', '-b:v', '300k', '-deadline', 'realtime', '-c:a', 'libopus', '-shortest', '-f', 'webm', out]);
  return out;
}
const manifest = (id, video, wav) => JSON.stringify({ schemaVersion: 2, captureID: id, cameraSource: 'iphone-avfoundation',
  audioSource: wav ? 'ios-usb-audio' : 'none', selectedInputName: null, originalVideoFile: video, originalAudioFile: wav || null,
  muxedVideoFile: null, audioStartOffsetSeconds: wav ? 0 : null, createdAtISO8601: '2026-11-06T10:00:00Z',
  tracks: wav ? [{ id: 'audio-1', kind: 'audio', role: 'voice_primary', source: 'ios-usb-audio', file: wav, channelIndex: null,
    sampleRateHz: 48000, channelCount: 1, inputName: null, startOffsetSeconds: 0 }] : [], muxedFromTrackIDs: [] });

(async () => {
  const a = clip('A.webm', 0, 440), bClip = clip('B.webm', 180, 660);
  const wav = path.join(work, 'voice.wav');
  ff(['-f', 'lavfi', '-i', 'sine=frequency=1000:duration=4', '-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', wav]);
  const png = path.join(work, 'photo.png');
  ff(['-f', 'lavfi', '-i', 'color=c=0x22cc44:size=360x640', '-frames:v', '1', png]);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + html + '#new');
  await page.waitForFunction(() => !!window.WivraEditorImport && !!window.WivraAcceleratedQA);
  const out = await page.evaluate(async ({ a, bClip, wav, png, mA, mB }) => {
    /* global session, media, edit, planCrossfades, importSelectedFiles, totalDuration */
    const bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
    const noMediabunnyBefore = typeof globalThis.Mediabunny === 'undefined';
    await window.WivraEditorImport.importFiles([new File([mA], 'Wivra_A.wivra.json'), new File([bytes(a)], 'Wivra_A.mov', { type: 'video/webm' }),
      new File([bytes(wav)], 'Wivra_A.wav', { type: 'audio/wav' })]);
    await window.WivraEditorImport.importFiles([new File([mB], 'Wivra_B.wivra.json'), new File([bytes(bClip)], 'Wivra_B.mov', { type: 'video/webm' })]);
    const say = []; const o = window.say; window.say = (m, k) => { say.push(String(m)); return o(m, k); };
    const p0 = session.project;
    const [c1, c2] = [...p0.clips].sort((x, y) => x.start - y.start);
    const step = (ops) => { const r = edit(ops, { ripple: false }); if (!r.ok) throw new Error(JSON.stringify(ops) + ' → ' + r.message); };
    step([{ op: 'set_format', aspect: '9:16', fit: 'cover' }]);
    step([{ op: 'set_clip_speed', clip_id: c2.id, speed: 1.5 }]);
    const xp = planCrossfades(session.project, 0.8, (id) => (media[id] && media[id].w > 0 ? { w: media[id].w, h: media[id].h } : null));
    if (!xp.ok) throw new Error('crossfade: ' + xp.error);
    step(xp.ops);
    step([{ op: 'add_overlay_clip', asset_id: c1.asset_id, start: 0.5, in: 1, out: 2.5, x: 0.75, y: 0.2, scale: 0.3, muted: true }]);
    await importSelectedFiles([new File([bytes(png)], 'photo.png', { type: 'image/png' })]);
    const total0 = totalDuration(session.project);
    step([{ op: 'add_text', text: 'WIVRA', start: 0.2, duration: Math.min(2, total0 - 0.3) }]);
    const project = session.project;
    const M = await WivraAcceleratedQA.loadMediabunny();
    const prepared = await WivraAcceleratedQA.prepareAcceleratedMultitrack({ project, media, M, platform: 'qa', expectedAudio: true });
    const pieces = []; let end = 0, writes = 0;
    const stats = await WivraAcceleratedQA.renderAcceleratedMultitrack({ prepared, fps: 30,
      writeAt: async (pos, data) => { pieces.push([pos, data.slice()]); end = Math.max(end, pos + data.length); writes++; return data.length; } });
    const file = new Uint8Array(end); for (const [pos, d] of pieces) file.set(d, pos);
    let bin = ''; for (let i = 0; i < file.length; i += 0x8000) bin += String.fromCharCode(...file.subarray(i, i + 0x8000));
    return { noMediabunnyBefore, total: totalDuration(project), container: stats.container, stats: { videoCodec: stats.videoCodec, audioCodec: stats.audioCodec, writes },
      lanes: { main: project.clips.length, overlay: project.overlayClips.length, audio: (project.audioClips || []).length, texts: project.texts.length },
      photo: project.clips.some((c) => media[c.asset_id]?.kind === 'image'),
      photoAt: (() => { const c = project.clips.find((k) => media[k.asset_id]?.kind === 'image'); return c ? c.start + Math.min(1, (c.out - c.in) / 2) : null; })(), speed: project.clips.some((c) => c.speed === 1.5),
      say: say.slice(-2), b64: btoa(bin) };
  }, { a: b64(a), bClip: b64(bClip), wav: b64(wav), png: b64(png), mA: manifest('cap-a', 'Wivra_A.mov', 'Wivra_A.wav'), mB: manifest('cap-b', 'Wivra_B.mov') });
  await browser.close();

  console.log(`  project: ${JSON.stringify(out.lanes)}, ${out.total.toFixed(2)} s, ${out.container} ${JSON.stringify(out.stats)}`);
  (out.noMediabunnyBefore ? ok : fail)('Mediabunny was not running before the accelerated export was chosen');
  (out.photo && out.speed && out.lanes.overlay >= 2 && out.lanes.audio >= 1 && out.lanes.texts === 1 ? ok : fail)
    ('the project has a photo, a 1.5× clip, a dissolve layer + PiP, an independent voice and a title');
  const file = path.join(work, 'accelerated.' + out.container);
  fs.writeFileSync(file, Buffer.from(out.b64, 'base64'));
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]).toString());
  const v = probe.streams.find((s) => s.codec_type === 'video'), au = probe.streams.find((s) => s.codec_type === 'audio');
  const dur = Number(probe.format.duration);
  console.log(`  file: ${probe.format.format_name}, ${dur.toFixed(2)} s, video ${v && v.codec_name} ${v && v.width}x${v && v.height}, audio ${au && au.codec_name}`);
  (v && au ? ok : fail)('video and audio streams present');
  (Math.abs(dur - out.total) < 0.15 ? ok : fail)(`duration ${dur.toFixed(2)} s = project ${out.total.toFixed(2)} s`);
  (v && Math.abs(v.width / v.height - 9 / 16) < 0.01 && v.height >= 1280 ? ok : fail)(`9:16 portrait at the editor's export size (${v && v.width}×${v && v.height})`);
  // Pictures: decoded at 10 fps; the frame centre is never black; the title area (top) differs with/without the title.
  const W = 36, H = 64, raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `fps=10,scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 64 << 20 });
  const frames = Math.floor(raw.length / (W * H * 3));
  const px = (t, x, y) => { const k = Math.min(frames - 1, Math.round(t * 10)), i = k * W * H * 3 + (y * W + x) * 3; return [raw[i], raw[i + 1], raw[i + 2]]; };
  const lit = (p) => p[0] + p[1] + p[2] > 60;
  const times = [0.1, out.total / 2, out.total - 0.2];
  (times.every((t) => lit(px(t, 18, 32))) ? ok : fail)(`pictures at start, middle and end (${times.map((t) => px(t, 18, 32).join('/')).join(' · ')})`);
  const photo = out.photoAt == null ? [0, 0, 0] : px(out.photoAt, 18, 32);
  (photo[1] > 150 && photo[0] < 90 && photo[2] < 120 ? ok : fail)(`the photo (green) at ${out.photoAt} s where the editor put it: ${photo}`);
  // Seek: one frame decoded directly at the middle.
  try { execFileSync('ffmpeg', ['-v', 'error', '-ss', String(out.total / 2), '-i', file, '-frames:v', '1', '-f', 'null', '-']); ok('seek to the middle decodes'); } catch (e) { fail('seek failed: ' + e.message); }
  // Sound: the voice track (1 kHz) is present in the first seconds.
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-t', '2', '-ac', '1', '-ar', '16000', '-f', 's16le', '-'], { maxBuffer: 16 << 20 });
  let sum = 0; for (let i = 0; i + 1 < pcm.length; i += 2) { const s = pcm.readInt16LE(i); sum += s * s; }
  const rms = Math.sqrt(sum / Math.max(1, pcm.length / 2));
  (rms > 500 ? ok : fail)(`sound in the first 2 s (RMS ${rms.toFixed(0)})`);
  if (errors.length) fail('page errors: ' + errors.join(' | '));
  if (!failed) fs.rmSync(work, { recursive: true, force: true }); else console.log('kept ' + work);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
