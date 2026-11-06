// W86 (Claude): one in-page driver for the automatic-subtitles flow, shared by the Chromium
// check, the Android WebView instrumentation test and the iOS simulator WKWebView hook.
// Input:  window.__wvE2EIn = { phase: 'full' | 'offline', videoB64, videoName, videoType,
//                              model: 'base' | 'tiny', lang, words: [..], cancel: true|false }
// Output: window.__wvE2EOut = 'running' while it works, then a JSON string with the result.
// It presses the same buttons a person presses (their onclick handlers), accepts the consent
// dialogs, and records what happened. It never fakes recognition: the texts come from the engine.
/* global session, totalDuration, wvWorker, $, wvGetPack, wvDelPack, WV_MODELS, toSRT, toVTT */
(function () {
  'use strict';
  const IN = window.__wvE2EIn || {}, out = { phase: IN.phase, model: IN.model, lang: IN.lang, steps: [], says: [], confirms: [], ua: navigator.userAgent };
  window.__wvE2EOut = 'running';
  const now = () => (performance && performance.now ? performance.now() : Date.now());
  const step = (name, data) => out.steps.push(Object.assign({ name, t: Math.round(now()) }, data || {}));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const finish = (error) => { if (error) out.error = String(error && error.stack || error); window.__wvE2EOut = JSON.stringify(out); };
  const mem = () => (performance && performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null);
  (async () => {
    for (let i = 0; i < 200 && !(typeof session !== 'undefined' && window.WivraEditorImport && typeof wvGetPack === 'function'); i++) await sleep(100);
    if (typeof wvGetPack !== 'function') throw new Error('editor not ready');
    // Record what the editor tells the person, and accept its consent dialogs (as a person tapping «Aceptar»).
    const origSay = window.say; window.say = (msg, kind) => { out.says.push({ msg: String(msg), kind }); return origSay(msg, kind); };
    window.confirm = (msg) => { out.confirms.push({ msg: String(msg), t: Math.round(now()) }); return true; };
    const realFetch = window.fetch.bind(window); let netCalls = 0, blockNet = false;
    window.fetch = (u, o) => { const url = String(u && u.url || u); if (/^https?:/i.test(url)) { netCalls++; if (blockNet) return Promise.reject(new TypeError('network blocked by the test')); } return realFetch(u, o); };

    // A real capture import (manifest + video), the same path the native app uses.
    const bytes = Uint8Array.from(atob(IN.videoB64), (c) => c.charCodeAt(0));
    const manifest = JSON.stringify({ schemaVersion: 2, captureID: 'wv-e2e', cameraSource: 'iphone-avfoundation', audioSource: 'none', selectedInputName: null,
      originalVideoFile: IN.videoName, originalAudioFile: null, muxedVideoFile: null, audioStartOffsetSeconds: null, createdAtISO8601: '2026-11-05T10:00:00Z', tracks: [], muxedFromTrackIDs: [] });
    await window.WivraEditorImport.importFiles([new File([manifest], 'Wivra_E2E.wivra.json', { type: 'application/json' }), new File([bytes], IN.videoName, { type: IN.videoType })]);
    for (let i = 0; i < 100 && !session.project.clips.length; i++) await sleep(100);
    step('imported', { clips: session.project.clips.length, assets: session.project.assets.length });
    if (!session.project.clips.length) throw new Error('video not imported: ' + JSON.stringify(out.says.slice(-3)));

    $('wvModel').value = IN.model; $('wvLang').value = IN.lang || 'auto';
    const m = WV_MODELS[IN.model];
    if (IN.phase === 'full') {
      await wvDelPack(m.id);
      const c0 = out.confirms.length, n0 = netCalls, t0 = now();
      step('download-start', { netBefore: n0 });
      await $('wvGet').onclick();
      const pack = await wvGetPack(m.id);
      step('download-end', { ms: Math.round(now() - t0), saved: !!pack, bytes: pack && pack.bytes, sha256: pack && pack.sha256, consentAsked: out.confirms.length > c0, netCalls: netCalls - n0 });
      if (!pack) throw new Error('voice pack not saved: ' + JSON.stringify(out.says.slice(-2)));
    } else {
      const pack = await wvGetPack(m.id);
      step('pack-kept', { saved: !!pack, bytes: pack && pack.bytes });
      if (!pack) throw new Error('voice pack was not kept after reload');
    }

    if (IN.cancel) {            // start, wait until the engine is listening, then cancel: nothing may be added
      const before = session.project.texts.length, p = $('wvRun').onclick();
      for (let i = 0; i < 600 && !/Escuchando|Listening/.test($('wvState').textContent); i++) await sleep(50);
      const seen = $('wvState').textContent; $('wvCancel').onclick(); const t1 = now(); await p;
      step('cancel', { seenBeforeCancel: seen, settledMs: Math.round(now() - t1), textsAdded: session.project.texts.length - before, state: $('wvState').textContent, workerGone: typeof wvWorker === 'undefined' || wvWorker === null });
    }

    blockNet = true; const n1 = netCalls, before = session.project.texts.length, t2 = now(), heap0 = mem();
    await $('wvRun').onclick();
    blockNet = false;
    const texts = session.project.texts.slice(before).map((x) => ({ start: x.start, end: x.end, text: x.text }));
    const all = texts.map((x) => x.text).join(' ').toLowerCase(), missing = (IN.words || []).filter((w) => !all.includes(String(w).toLowerCase()));
    const sorted = texts.slice().sort((a, b) => a.start - b.start), overlaps = sorted.filter((x, i) => i && x.start < sorted[i - 1].end - 1e-6).length;
    const srt = toSRT(session.project.texts), vtt = toVTT(session.project.texts);
    step('recognized', { ms: Math.round(now() - t2), seconds: totalDuration(session.project), count: texts.length, texts, missing, overlaps,
      netCallsDuringRun: netCalls - n1, heapMB: [heap0, mem()], srtOk: /^1\r?\n\d\d:\d\d:\d\d,\d{3} --> /.test(srt), vttOk: /^WEBVTT/.test(vtt) });
    out.ok = texts.length > 0 && !missing.length && !overlaps && netCalls === n1;
    finish();
  })().catch(finish);
})();
