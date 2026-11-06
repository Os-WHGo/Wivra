#!/usr/bin/env node
// W98 (Claude): automatic subtitles on a video LONGER than the 10-minute single-decode limit, in the real
// editor (Chromium). The phone's native piece reader (WivraAudioPcm.extract) is replaced by a stand-in that
// answers exactly like it (16 kHz mono 16-bit PCM, base64) from a WAV of the same sound, so windowing,
// mixing, timing and the whisper engine run for real. Not mobile evidence (the emulator test covers MediaCodec).
// Usage: node tools/browser-whisper-long.cjs <video> <video/type> <sound16k.wav> <tiny|base> <lang> <word@second,...>
'use strict';
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/tmp/wivra-media-lab/node_modules/playwright')); }

const [, , video, type, wav, model, lang, expect = ''] = process.argv;
const html = 'file://' + path.join(path.resolve(__dirname, '..'), 'app/dist/agentcut.html');
const wavBytes = fs.readFileSync(wav), dataAt = wavBytes.indexOf(Buffer.from('data')) + 8;
const pcmB64 = wavBytes.subarray(dataAt).toString('base64');

(async () => {
  const browser = await chromium.launch(); const page = await browser.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(html + '#new');      // straight into the editor with a new project, as the app opens it
  await page.waitForFunction(() => typeof wvGetPack === 'function' && window.WivraEditorImport);
  const videoBytes = fs.readFileSync(video);
  const setup = await page.evaluate(async ({ vid, type, pcmB64, model, lang }) => {
    /* global $, session, wvGetPack, totalDuration, openSheet */
    const bin = atob(pcmB64), all = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) all[i] = bin.charCodeAt(i);
    const st = window.__wvLong = { calls: 0, maxSpan: 0, granted: false };   // W102: starts as after a restart (no permission)
    window.WivraAudioPcm = { extract: async (name, size, from, to) => {      // same answer as the phone's bridge
      if (!st.granted) return { ok: false, error: 'NOT_GRANTED' };
      st.calls++; st.maxSpan = Math.max(st.maxSpan, to - from); if (!(to - from <= 35)) return { ok: false, error: 'PIECE' };
      const a = Math.floor(from * 16000) * 2, b = Math.floor(to * 16000) * 2, want = b - a, piece = new Uint8Array(want); piece.set(all.subarray(a, Math.min(b, all.length)));
      let s = ''; for (let i = 0; i < piece.length; i += 0x8000) s += String.fromCharCode(...piece.subarray(i, i + 0x8000)); return { ok: true, rate: 16000, b64: btoa(s) };
    } };
    window.confirm = () => true; const says = window.__wvSays = []; const o = window.say; window.say = (m, k) => { says.push(String(m)); return o(m, k); };
    const bytes = Uint8Array.from(atob(vid), (c) => c.charCodeAt(0));
    const mf = JSON.stringify({ schemaVersion: 2, captureID: 'w98', cameraSource: 'iphone-avfoundation', audioSource: 'none', selectedInputName: null, originalVideoFile: 'Wivra_L.mov', originalAudioFile: null, muxedVideoFile: null, audioStartOffsetSeconds: null, createdAtISO8601: '2026-11-06T10:00:00Z', tracks: [], muxedFromTrackIDs: [] });
    await window.WivraEditorImport.importFiles([new File([mf], 'Wivra_L.wivra.json'), new File([bytes], 'Wivra_L.mov', { type })]);
    $('wvModel').value = model; $('wvLang').value = lang; await $('wvGet').onclick();
    if (!(await wvGetPack(model))) return { error: 'no pack', says };
    for (const sel of ['#langList button[data-l="es"]', '#onbSkip']) { const b = document.querySelector(sel); if (b) b.click(); }      // first-run welcome, as a person
    openSheet('sText'); await $('wvRun').onclick();      // the subtitles panel is open, as for a person; without permission: must ask to choose the file again, not start
    const box = $('wvRegrant'), btn = box && box.querySelector('button');
    return { asked: !!btn && box.style.display !== 'none', label: btn ? btn.textContent : '', texts: session.project.texts.length };
  }, { vid: videoBytes.toString('base64'), type, pcmB64, model, lang });
  if (setup.error) { console.log('not ok - ' + setup.error); process.exit(1); }
  // The person taps the button and picks the same file; the phone's chooser then grants it again.
  let regrantOk = false;
  if (setup.asked) {
    await page.$eval('#wvRegrant button', (b) => b.scrollIntoView({ block: 'center' }));
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#wvRegrant button')]);
    await page.evaluate(() => { window.__wvLong.granted = true; });
    await chooser.setFiles({ name: 'Wivra_L.mov', mimeType: type, buffer: videoBytes });
    regrantOk = await page.waitForFunction(() => document.getElementById('wvRegrant').style.display === 'none', null, { timeout: 15000 }).then(() => true, () => false);
  }
  const out = await page.evaluate(async () => {
    const st = window.__wvLong, says = window.__wvSays, duration = totalDuration(session.project);
    const t0 = performance.now(); await $('wvRun').onclick();
    return { duration, ms: Math.round(performance.now() - t0), calls: st.calls, maxSpan: st.maxSpan, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
      texts: session.project.texts.map((x) => ({ start: x.start, end: x.end, text: x.text })), says: says.slice(-3), run: window.wvLastRun || null };
  });
  await browser.close();
  if (out.error) { console.log('not ok - ' + out.error + ' ' + JSON.stringify(out.says)); process.exit(1); }
  console.log(`${model} ${lang}: ${out.duration.toFixed(0)} s project in ${(out.ms / 1000).toFixed(0)} s, ${out.calls} native pieces (longest ${out.maxSpan.toFixed(1)} s), heap ${out.heapMB} MB, ${out.texts.length} subtitles`);
  if (out.run) console.log(`  ${out.run.windows} windows, ${out.run.silent} silent ones not sent to whisper`);
  for (const t of out.texts) console.log(`  [${t.start.toFixed(1)}–${t.end.toFixed(1)}] ${t.text}`);
  const checks = [[setup.asked && setup.texts === 0, `after a restart it asks to choose the file again (${setup.label})`],
    [regrantOk, 'choosing the same file again restores the permission'],
    [out.duration > 600, 'project longer than the 10-minute single-decode limit'], [out.maxSpan <= 35, 'every native piece ≤ 35 s'], [!errors.length, 'no page errors ' + errors.join(' | ')]];
  for (const e of expect.split(',').filter(Boolean)) {
    const [word, sec] = e.split('@'), hit = out.texts.find((t) => t.text.toLowerCase().includes(word.toLowerCase()));
    checks.push([!!hit && Math.abs(hit.start - Number(sec)) < 12, `«${word}» recognized near ${sec} s${hit ? ` (at ${hit.start.toFixed(1)} s)` : ' (missing)'}`]);
  }
  for (const [good, what] of checks) console.log(`${good ? 'ok' : 'not ok'} - ${what}`);
  process.exit(checks.every((c) => c[0]) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
