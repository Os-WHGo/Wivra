#!/usr/bin/env node
// W89 (Claude): dictation in the editor chat, end to end in Chromium with a FAKE microphone that plays a
// WAV file: consent → voice pack download → 🎤 → speak (the file) → Detener → text in the chat box,
// recognized by whisper.cpp in the page (network blocked while transcribing). Not mobile evidence.
// Usage: node tools/browser-whisper-dictation.cjs <speech.wav> <tiny|base> <lang> <word,word> [seconds]
'use strict';
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/tmp/wivra-media-lab/node_modules/playwright')); }

const [, , wav, model, lang, words = '', seconds = '8'] = process.argv;
const html = 'file://' + path.join(path.resolve(__dirname, '..'), 'app/dist/agentcut.html');

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve(wav)}`] });
  const context = await browser.newContext({ permissions: ['microphone'] });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(html);
  await page.waitForFunction(() => typeof wvGetPack === 'function' && typeof wvDictPack === 'function');
  const out = await page.evaluate(async ({ model, lang, seconds }) => {
    /* global $, i18nApply, wvDictPack, aiSync */
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms)), says = [];
    window.confirm = () => true; const o = window.say; window.say = (m, k) => { says.push(String(m)); return o(m, k); };
    if (lang !== 'es') i18nApply(lang);
    $('wvModel').value = model; const t0 = performance.now(); await $('wvGet').onclick(); const dl = Math.round(performance.now() - t0);
    const pack = await wvDictPack(); if (!pack) return { error: 'no pack', says };
    await window.wvDictHint(); const visible = $('aiMic').style.display !== 'none', hint = $('aiMicHint').textContent;
    const realFetch = window.fetch; let net = 0; window.fetch = (u, x) => { if (/^https?:/.test(String(u && u.url || u))) { net++; return Promise.reject(new TypeError('blocked')); } return realFetch(u, x); };
    $('ask').value = ''; $('aiMic').onclick(); await sleep(seconds * 1000);
    const t1 = performance.now(); $('aiMic').onclick();
    for (let i = 0; i < 1200 && ($('aiMic').disabled || !/🎤/.test($('aiMic').textContent)); i++) await sleep(250);
    return { dl, pack: pack.id, visible, hint, ms: Math.round(performance.now() - t1), text: $('ask').value, net, says: says.slice(-3) };
  }, { model, lang, seconds: Number(seconds) });
  await browser.close();
  const need = words.split(',').filter(Boolean), low = String(out.text || '').toLowerCase(), missing = need.filter((w) => !low.includes(w.toLowerCase()));
  const checks = [[out.visible, `🎤 visible with a saved pack (${out.pack}); hint: «${out.hint}»`], [!!out.text && !missing.length, `dictated text in the chat in ${(out.ms / 1000).toFixed(1)} s: «${out.text}»${missing.length ? ' missing: ' + missing.join(',') : ''}`],
    [out.net === 0, 'no network used while transcribing'], [!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : '')]];
  if (out.error) checks.unshift([false, out.error + ' ' + JSON.stringify(out.says)]);
  for (const [good, what] of checks) console.log(`${good ? 'ok' : 'not ok'} - ${model} ${lang}: ${what}`);
  process.exit(checks.every((c) => c[0]) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
