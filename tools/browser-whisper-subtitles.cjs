#!/usr/bin/env node
// W86 (Claude): the automatic-subtitles flow in the REAL editor (app/dist/agentcut.html) in Chromium:
// consent → download of the pinned multilingual pack → SHA-256 check → kept in IndexedDB →
// cancel while listening → recognition with the network blocked → texts in the timeline → SRT/VTT;
// then OFFLINE: reload with no network, the pack is still there and recognition works again.
// Chromium on Linux is NOT mobile evidence (Android WebView / iPhone WKWebView are tested apart).
// Usage: node tools/browser-whisper-subtitles.cjs <video> <video/type> <tiny|base> <lang> <word,word> [--route-model <model.bin>]
'use strict';
const fs = require('node:fs');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/tmp/wivra-media-lab/node_modules/playwright')); }

const [, , video, type, model, lang, words, flag, routed] = process.argv;
const root = path.resolve(__dirname, '..');
const html = 'file://' + path.join(root, 'app/dist/agentcut.html');
const driver = fs.readFileSync(path.join(__dirname, 'whisper-wasm/e2e-driver.js'), 'utf8');
const input = { videoB64: fs.readFileSync(video).toString('base64'), videoName: 'Wivra_E2E.mov', videoType: type, model, lang, words: words ? words.split(',') : [] };

async function drive(page, extra) {
  await page.evaluate((i) => { window.__wvE2EIn = i; }, Object.assign({}, input, extra));
  await page.addScriptTag({ content: driver });
  await page.waitForFunction(() => window.__wvE2EOut !== 'running', null, { timeout: 15 * 60 * 1000, polling: 500 });
  return JSON.parse(await page.evaluate(() => window.__wvE2EOut));
}
const show = (label, r) => {
  console.log(`${r.ok ? 'ok' : 'not ok'} - ${label} (${model}, ${lang})${r.error ? ': ' + r.error.split('\n')[0] : ''}`);
  for (const s of r.steps) { const { name, texts, ...rest } = s; console.log(`  ${name} ${JSON.stringify(rest)}`); if (texts) for (const t of texts) console.log(`    [${t.start.toFixed(2)}–${t.end.toFixed(2)}] ${t.text}`); }
  if (!r.ok) console.log('  says: ' + JSON.stringify(r.says.slice(-4)));
};

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  if (flag === '--route-model') await context.route(/huggingface\.co/, (route) => route.fulfill({ status: 200, body: fs.readFileSync(routed), headers: { 'access-control-allow-origin': '*' } }));
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(html);
  const full = await drive(page, { phase: 'full', cancel: true }); show('download + cancel + recognize (network blocked while recognizing)', full);
  let offline = { ok: false, steps: [], says: [] };
  if (full.ok) {
    await context.setOffline(true); await page.reload();
    offline = await drive(page, { phase: 'offline', cancel: false }); show('after reload with NO network: pack kept, recognition works', offline);
  }
  const consent = full.steps.find((s) => s.name === 'download-end'), cancel = full.steps.find((s) => s.name === 'cancel');
  const checks = [[consent && consent.consentAsked, 'consent asked before downloading'], [cancel && cancel.textsAdded === 0 && cancel.workerGone, 'cancel left no subtitles and no engine running'],
    [!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : '')]];
  for (const [good, what] of checks) console.log(`${good ? 'ok' : 'not ok'} - ${what}`);
  await browser.close();
  process.exit(full.ok && offline.ok && checks.every((c) => c[0]) ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
