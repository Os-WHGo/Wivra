// Real export inside the bundled Wivra editor (Android System WebView): synthetic source video made
// with this WebView's own MediaRecorder, then the editor's recordProject → progressive native
// bridge → MediaStore → container repair. Writes JSON to window.__wivraRealExport. — Claude
(function () {
  window.__wivraRealExport = 'running';
  (async () => {
    const out = { userAgent: navigator.userAgent, supported: {} };
    try {
      for (const m of MIME_CANDIDATES) { try { out.supported[m] = MediaRecorder.isTypeSupported(m); } catch (e) { out.supported[m] = 'error'; } }
      const c = document.createElement('canvas'); c.width = 320; c.height = 240; const g = c.getContext('2d');
      const stream = c.captureStream(30), ac = new AudioContext(); await ac.resume().catch(() => {});
      const osc = ac.createOscillator(), dest = ac.createMediaStreamDestination(); osc.connect(dest); osc.start();
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      out.sourceMime = pickMime((t) => MediaRecorder.isTypeSupported(t), { platform: 'android' });
      const rec = new MediaRecorder(stream, out.sourceMime ? { mimeType: out.sourceMime } : {}), parts = [];
      rec.ondataavailable = (e) => e.data && e.data.size && parts.push(e.data);
      const stopped = new Promise((r) => { rec.onstop = r; }); rec.start(500);
      const t0 = performance.now();
      while (performance.now() - t0 < 4500) { g.fillStyle = `hsl(${(performance.now() / 6) % 360},70%,45%)`; g.fillRect(0, 0, 320, 240); g.fillStyle = '#fff'; g.font = '40px sans-serif'; g.fillText(((performance.now() - t0) / 1000).toFixed(1), 100, 130); await new Promise((r) => setTimeout(r, 33)); }
      rec.stop(); await stopped; stream.getTracks().forEach((t) => t.stop()); await ac.close().catch(() => {});
      const source = new Blob(parts, { type: rec.mimeType || out.sourceMime });
      out.sourceRecordedMime = rec.mimeType; out.sourceBytes = source.size;
      const media = { v: { url: URL.createObjectURL(source), kind: 'video', w: 320, h: 240 } };
      const project = { clips: [{ id: 'c1', asset_id: 'v', start: 0, in: 0.3, out: 2.3 }, { id: 'c2', asset_id: 'v', start: 2, in: 2.6, out: 3.8 }],
        overlayClips: [], audioClips: [], texts: [{ id: 't', text: 'Wivra Android', start: 0.4, end: 2.5, position: 'middle' }], format: { aspect: 'original' } };
      out.planned = exportPlan(project).total;
      const t1 = performance.now();
      const r = await recordProject({ project, media, saveMode: window.__wivraProbeSaveMode || 'auto' });
      out.exportWallSeconds = Math.round(performance.now() - t1) / 1000;
      out.result = { progressive: !!r.progressive, mime: r.mime, cancelled: !!r.cancelled, interrupted: !!r.interrupted, hasAudio: r.hasAudio,
        saved: r.saved ? { name: r.saved.displayName, bytes: r.saved.bytes, recordedBytes: r.saved.recordedBytes, chunks: r.saved.chunks,
          peakQueuedBytes: r.saved.peakQueuedBytes, repair: r.saved.repair, repairNote: r.saved.repairNote, media: r.saved.media } : null,
        blobBytes: r.blob ? r.blob.size : null, container: r.container || null, verification: r.verification || null };
    } catch (e) { out.error = String(e && e.message || e); }
    window.__wivraRealExport = JSON.stringify(out);
  })();
  return 'started';
})();
