#!/usr/bin/env node
// Real editor (app/dist/agentcut.html) in Chromium: import an iPhone two-camera
// capture bundle (.wivra.json with a multicam block + two movies) through the
// same window.WivraEditorImport path the native iOS picker uses, then read the
// resulting project. Synthetic media made with ffmpeg; no phone involved.
// Cases: valid pair, missing second movie, unreadable second movie, corrupt
// multicam block, unknown offset, second camera starting earlier. — Claude
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/tmp/wivra-media-lab/node_modules/playwright')); }

const root = path.resolve(__dirname, '..');
const html = path.join(root, 'app/dist/agentcut.html');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wivra-multicam-'));

function makeVideo(name, seconds, w, h, withAudio, freq) {
  const out = path.join(work, name);
  const args = ['-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', `testsrc2=size=${w}x${h}:rate=24:duration=${seconds}`];
  if (withAudio) args.push('-f', 'lavfi', '-i', `sine=frequency=${freq}:duration=${seconds}`);
  args.push('-c:v', 'libvpx', '-b:v', '300k', '-deadline', 'realtime');
  if (withAudio) args.push('-c:a', 'libopus', '-shortest'); else args.push('-an');
  args.push('-f', 'webm', out);
  execFileSync('ffmpeg', args);
  return fs.readFileSync(out).toString('base64');
}

const primary = makeVideo('a.webm', 4, 360, 640, true, 440);   // portrait main camera with mic
const secondary = makeVideo('b.webm', 3.5, 360, 640, false, 0); // inset camera, no audio
const manifest = (multicam) => JSON.stringify({
  schemaVersion: 2, captureID: 'cap-' + Math.random().toString(36).slice(2), cameraSource: 'iphone-avfoundation',
  audioSource: 'none', selectedInputName: null, originalVideoFile: 'Wivra_A.mov', originalAudioFile: null,
  muxedVideoFile: null, audioStartOffsetSeconds: null, createdAtISO8601: '2026-11-05T10:00:00Z',
  tracks: [], muxedFromTrackIDs: [], ...(multicam === undefined ? {} : { multicam })
});
const block = (extra = {}) => ({
  schema: 'wivra-multicam-v1', secondaryVideoFile: 'Wivra_B.mov', secondaryOffsetSeconds: 0.25,
  primaryPosition: 'back', secondaryPosition: 'front', corner: 'top-left', audio: 'primary', ...extra
});

const cases = [
  { label: 'valid pair', manifest: manifest(block()), files: ['A', 'B'],
    expect: { clips: 1, overlays: 1, overlayStart: 0.25, overlayIn: 0, muted: true } },
  { label: 'second camera started earlier', manifest: manifest(block({ secondaryOffsetSeconds: -0.5 })), files: ['A', 'B'],
    expect: { clips: 1, overlays: 1, overlayStart: 0, overlayIn: 0.5, muted: true } },
  { label: 'unknown offset', manifest: manifest(block({ secondaryOffsetSeconds: null })), files: ['A', 'B'],
    expect: { clips: 1, overlays: 1, overlayStart: 0, overlayIn: 0, muted: true, note: /desfase entre cámaras/ } },
  { label: 'missing second movie', manifest: manifest(block()), files: ['A'],
    expect: { clips: 1, overlays: 0, note: /segunda cámara no está/ } },
  { label: 'unreadable second movie', manifest: manifest(block()), files: ['A', 'Bbad'],
    expect: { clips: 1, overlays: 0, note: /segunda cámara no está/ } },
  { label: 'corrupt multicam block', manifest: manifest(block({ secondaryOffsetSeconds: 99, corner: 'middle' })), files: ['A', 'B'],
    expect: { clips: 1, overlays: 0, note: /segunda cámara ignorados/ } },
  { label: 'single camera manifest', manifest: manifest(undefined), files: ['A'],
    expect: { clips: 1, overlays: 0 } }
];

(async () => {
  const browser = await chromium.launch();
  const results = [];
  let failed = 0;
  for (const c of cases) {
    const page = await browser.newPage();
    const messages = [];
    page.on('pageerror', e => messages.push('pageerror: ' + e.message));
    await page.goto('file://' + html);
    await page.waitForFunction(() => !!window.WivraEditorImport);
    const r = await page.evaluate(async ({ c, primary, secondary }) => {
      const bytes = b64 => Uint8Array.from(atob(b64), ch => ch.charCodeAt(0));
      const files = [new File([c.manifest], 'Wivra_A.wivra.json', { type: 'application/json' })];
      if (c.files.includes('A')) files.push(new File([bytes(primary)], 'Wivra_A.mov', { type: 'video/webm' }));
      if (c.files.includes('B')) files.push(new File([bytes(secondary)], 'Wivra_B.mov', { type: 'video/webm' }));
      if (c.files.includes('Bbad')) files.push(new File([new Uint8Array(4096).fill(7)], 'Wivra_B.mov', { type: 'video/webm' }));
      await window.WivraEditorImport.importFiles(files);
      // eslint-disable-next-line no-undef
      const p = typeof session !== 'undefined' && session ? session.project : null;
      const text = [...document.querySelectorAll('#info, #msg, .toast, #aiLog, body')].map(n => n.innerText).join('\n');
      return {
        clips: p ? p.clips.length : 0,
        overlays: p ? (p.overlayClips || []).map(o => ({ start: o.start, in: o.in, out: o.out, muted: o.muted, x: o.x, y: o.y, scale: o.scale })) : [],
        mainMuted: p && p.clips[0] ? p.clips[0].muted === true : null,
        undo: typeof session !== 'undefined' && session ? session.undoStack.length : 0,
        text
      };
    }, { c, primary, secondary });
    const e = c.expect;
    const problems = [];
    if (r.clips !== e.clips) problems.push(`clips ${r.clips} != ${e.clips}`);
    if (r.overlays.length !== e.overlays) problems.push(`overlays ${r.overlays.length} != ${e.overlays}`);
    if (e.overlays && r.overlays[0]) {
      const o = r.overlays[0];
      if (Math.abs(o.start - e.overlayStart) > 0.01) problems.push(`overlay start ${o.start} != ${e.overlayStart}`);
      if (Math.abs(o.in - e.overlayIn) > 0.01) problems.push(`overlay in ${o.in} != ${e.overlayIn}`);
      if (o.muted !== e.muted) problems.push(`overlay muted ${o.muted}`);
      if (!(o.x < 0.5 && o.y < 0.5)) problems.push(`top-left corner expected, got ${o.x},${o.y}`);
      if (r.mainMuted) problems.push('main camera must stay audible');
      if (r.undo !== 1) problems.push(`one undo step expected, got ${r.undo}`);
    }
    if (e.note && !e.note.test(r.text)) problems.push('expected note ' + e.note);
    if (messages.length) problems.push(...messages);
    if (problems.length) failed++;
    results.push({ case: c.label, ok: !problems.length, problems, overlays: r.overlays });
    console.log((problems.length ? 'not ok - ' : 'ok - ') + c.label + (problems.length ? ' :: ' + problems.join('; ') : ''));
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(os.tmpdir(), 'wivra-multicam-import.json'), JSON.stringify({ results }, null, 2));
  fs.rmSync(work, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
