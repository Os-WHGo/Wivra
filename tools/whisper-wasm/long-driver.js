/* W107 (Claude): long-mode subtitles inside the REAL editor (iPhone simulator WKWebView).
   The host pushed the video's bytes into window.__wvLongB64 (base64 pieces) and already gave the
   same file to the native piece reader (as the file chooser does). Input (window.__wvE2EIn):
   { name, type, model, lang }. Result: window.__wvE2EOut (JSON string), as the shared e2e driver. */
window.__wvE2EOut = 'running';
(async () => {
  try {
    /* global $, session, wvGetPack, totalDuration */
    const inp = window.__wvE2EIn || {};
    const bin = atob((window.__wvLongB64 || []).join('')); delete window.__wvLongB64;
    const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    window.confirm = () => true; const says = []; const o = window.say; window.say = (m, k) => { says.push(String(m)); return o(m, k); };
    const mf = JSON.stringify({ schemaVersion: 2, captureID: 'w107', cameraSource: 'simulator', audioSource: 'none', selectedInputName: null, originalVideoFile: inp.name, originalAudioFile: null, muxedVideoFile: null, audioStartOffsetSeconds: null, createdAtISO8601: '2026-11-06T12:00:00Z', tracks: [], muxedFromTrackIDs: [] });
    await window.WivraEditorImport.importFiles([new File([mf], inp.name.replace(/\.\w+$/, '') + '.wivra.json'), new File([bytes], inp.name, { type: inp.type })]);
    const duration = totalDuration(session.project);
    const native = !!(window.WivraAudioPcm && typeof window.WivraAudioPcm.extract === 'function') || !!(window.WivraHost && typeof window.WivraHost.audioPcm === 'function');
    $('wvModel').value = inp.model; $('wvLang').value = inp.lang;
    if (!(await wvGetPack(inp.model))) throw new Error('no kept pack');
    const t0 = performance.now(); await $('wvRun').onclick();
    window.__wvE2EOut = JSON.stringify({ ok: true, duration, native, bytes: bytes.length, ms: Math.round(performance.now() - t0), run: window.wvLastRun || null,
      askedAgain: $('wvRegrant').style.display !== 'none', texts: session.project.texts.map((x) => ({ start: x.start, end: x.end, text: x.text })), says: says.slice(-3) });
  } catch (e) { window.__wvE2EOut = JSON.stringify({ ok: false, error: String(e && e.message || e) }); }
})();
