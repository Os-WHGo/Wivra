/* Exportación PROGRESIVA en Chromium real: el app/export.mjs de verdad, MediaRecorder
   real y un puente "nativo" simulado con el protocolo Android (marcos binarios WVX1)
   que escribe cada fragmento a disco en cuanto llega, como el escritor MediaStore.
   Verifica: archivo idéntico byte a byte, CRC, decodificación completa con ffmpeg,
   cancelación y fallo de disco sin dejar archivos a medias, memoria de cola acotada.
   Chromium Linux NO es un WebView de Android/iOS: no certifica teléfonos. — Claude */
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/tmp/wivra-media-lab/node_modules/playwright'); }
const { chromium } = playwright;
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const { crc32 } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wivra-progressive-'));
const report = { type: 'WIVRA_PROGRESSIVE_EXPORT_BROWSER_SYNTHETIC_LINUX', source: 'app/export.mjs + app/export-sink.mjs',
  runner: 'Playwright Chromium Linux; simulated Android bridge, not a phone', cases: [] };

const server = http.createServer((req, res) => {
  const loc = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!loc.startsWith(root + path.sep) || !/\.(mjs|js)$/.test(loc)) { res.writeHead(404); return res.end(); }
  try { res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(loc)); }
  catch { res.writeHead(404); res.end(); }
});

// "Nativo" en Node: mismas reglas que WivraProgressiveExportSession (orden, CRC, borrado).
const sessions = new Map(); let nextToken = 100; let failAtSeq = -1; const events = [];
function nativeHandle(msg) {
  if (msg.bin) {
    const buf = Buffer.from(msg.bin, 'base64');
    const magic = buf.readUInt32LE(0), rid = buf.readUInt32LE(4), token = buf.readUInt32LE(8), seq = buf.readUInt32LE(12);
    const s = sessions.get(token);
    if (magic !== 0x31585657 || !s || s.state !== 'open') return { rid, ok: false, error: 'bad frame' };
    if (seq === failAtSeq) return { rid, ok: false, error: 'No queda espacio (simulado).' };
    if (seq !== s.seq) return { rid, ok: false, error: 'out of order' };
    const data = buf.subarray(16);
    fs.appendFileSync(s.file, data); s.seq++; s.bytes += data.length; s.crc = crc32(data, s.crc);
    events.push({ token, seq, bytes: data.length, t: Date.now() });
    return { rid, ok: true, seq, written: s.bytes };
  }
  const j = JSON.parse(msg.json); const { rid } = j;
  if (j.op === 'hello') return { rid, ok: true, arrayBuffer: true, protocol: 1 };
  if (j.op === 'begin') {
    const token = nextToken++, file = path.join(outDir, `Wivra_Export_${token}.${j.ext || 'webm'}.partial`);
    fs.writeFileSync(file, Buffer.alloc(0));
    sessions.set(token, { file, seq: 0, bytes: 0, crc: 0, state: 'open', mime: j.mime });
    return { rid, ok: true, token };
  }
  const s = sessions.get(j.token); if (!s) return { rid, ok: false, error: 'unknown session' };
  if (j.op === 'abort') { s.state = 'aborted'; fs.rmSync(s.file, { force: true }); return { rid, ok: true }; }
  if (j.op === 'finish') {
    s.finishAt = Date.now();
    const disk = fs.readFileSync(s.file), diskCrc = crc32(disk) >>> 0;
    if (disk.length !== j.bytes || diskCrc !== j.crc32 || s.seq !== j.chunks) { fs.rmSync(s.file, { force: true }); return { rid, ok: false, error: 'verification failed' }; }
    const final = s.file.replace(/\.partial$/, ''); fs.renameSync(s.file, final); s.file = final; s.state = 'published';
    return { rid, ok: true, token: j.token, bytes: disk.length, crc32: diskCrc, displayName: path.basename(final), location: 'simulated' };
  }
  return { rid, ok: false, error: 'op' };
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  let failed = false;
  try {
    const page = await browser.newPage();
    await page.exposeFunction('__wivraNativeBridge', (msg) => JSON.stringify(nativeHandle(msg)));
    await page.goto(`http://127.0.0.1:${server.address().port}/app/export.mjs`);
    await page.evaluate(() => {
      const toB64 = (ab) => { const u = new Uint8Array(ab); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
      window.WivraExportNative = { onmessage: null, postMessage(m) {
        const msg = m instanceof ArrayBuffer ? { bin: toB64(m) } : { json: m };
        window.__wivraNativeBridge(msg).then((reply) => this.onmessage && this.onmessage({ data: reply }));
      } };
    });
    const runCase = (label, opts) => page.evaluate(async ({ label, opts }) => {
      const { recordProject } = await import('/app/export.mjs');
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 240;
      const g = canvas.getContext('2d'), stream = canvas.captureStream(15);
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8', videoBitsPerSecond: 400000 });
      const parts = []; rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
      const stopped = new Promise((r) => { rec.onstop = r; }); rec.start(200);
      for (let i = 0; i < opts.sourceFrames; i++) { g.fillStyle = `hsl(${i * 9},70%,45%)`; g.fillRect(0, 0, 320, 240); g.fillStyle = '#fff'; g.font = '28px sans-serif'; g.fillText('src ' + i, 20, 120); await new Promise((r) => setTimeout(r, 66)); }
      rec.stop(); await stopped; stream.getTracks().forEach((t) => t.stop());
      const media = { v: { url: URL.createObjectURL(new Blob(parts, { type: 'video/webm' })), kind: 'video', w: 320, h: 240 } };
      const project = { clips: [{ id: 'c1', asset_id: 'v', start: 0, in: 0, out: opts.clipSeconds }], overlayClips: [], audioClips: [],
        texts: [{ id: 't', text: 'Progresivo', start: 0.2, end: 1.5, position: 'middle' }], format: { aspect: 'original' } };
      let cancel = false; if (opts.cancelAfterMs) setTimeout(() => { cancel = true; }, opts.cancelAfterMs);
      // App switch / incoming call: the WebView reports the page as hidden.
      if (opts.hideAfterMs) setTimeout(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }, opts.hideAfterMs);
      const t0 = performance.now();
      try {
        const r = await recordProject({ project, media, isCancelled: () => cancel, saveMode: opts.saveMode || 'auto' });
        return { label, ok: true, wallSeconds: +((performance.now() - t0) / 1000).toFixed(2), saved: r.saved || null, progressive: !!r.progressive,
          memoryBlobBytes: r.blob ? r.blob.size : null, cancelled: !!r.cancelled, interrupted: !!r.interrupted, mime: r.mime };
      } catch (e) { return { label, ok: false, error: e.message }; }
    }, { label, opts });

    const check = (cond, label, detail) => { report.cases.push({ check: label, pass: !!cond, detail }); if (!cond) failed = true; };

    // 1) Exportación completa por partes.
    const full = await runCase('progressive-full', { sourceFrames: 110, clipSeconds: 6 });
    report.cases.push(full);
    check(full.ok && full.progressive && full.saved, 'progressive export returns a saved native file, not a Blob', full);
    if (full.saved) {
      const file = path.join(outDir, full.saved.displayName);
      const disk = fs.readFileSync(file);
      check(disk.length === full.saved.bytes && (crc32(disk) >>> 0) === full.saved.crc32, 'disk bytes and CRC-32 match the JS totals', { bytes: disk.length });
      check(full.saved.chunks >= 4, 'file was written in several progressive chunks', { chunks: full.saved.chunks });
      check(full.saved.peakQueuedBytes < 4 * 1024 * 1024, 'JS queue stayed bounded (not whole video)', { peakQueuedBytes: full.saved.peakQueuedBytes });
      const firstWrite = events.find((e) => e.token === full.saved.token), finishAt = sessions.get(full.saved.token).finishAt;
      check(firstWrite && firstWrite.seq === 0 && finishAt - firstWrite.t > 3000, 'first chunk reached disk seconds before recording ended', { firstWriteMsBeforeFinish: finishAt - (firstWrite && firstWrite.t) });
      const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height:format=format_name', '-of', 'json', file]).toString());
      check(probe.streams.some((s) => s.width === 320 && s.height === 240), 'ffprobe reads 320x240 video stream', probe);
      const decode = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
      const frames = Number(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', file]).toString().trim());
      check(decode.trim() === '' && frames >= 60, 'ffmpeg decodes the whole progressive file without errors', { frames });
      report.cases.push({ ffprobe: probe, decodedFrames: frames });
    }

    // 2) Cancelación a mitad: no queda archivo.
    const before = fs.readdirSync(outDir).length;
    const cancelled = await runCase('progressive-cancel', { sourceFrames: 80, clipSeconds: 5, cancelAfterMs: 2500 });
    report.cases.push(cancelled);
    check(cancelled.ok && cancelled.cancelled, 'cancel returns cancelled', cancelled);
    check(fs.readdirSync(outDir).length === before && !fs.readdirSync(outDir).some((f) => f.endsWith('.partial')), 'cancel leaves no partial file', fs.readdirSync(outDir));

    // 3) Disco que falla en el fragmento 2: error claro, nunca "cancelado", sin archivo.
    failAtSeq = 2;
    const broken = await runCase('progressive-disk-failure', { sourceFrames: 80, clipSeconds: 5 });
    failAtSeq = -1;
    report.cases.push(broken);
    check(!broken.ok && /No se pudo guardar el video en el teléfono/.test(broken.error) && /espacio/.test(broken.error), 'disk failure is reported as a save error', broken);
    check(!fs.readdirSync(outDir).some((f) => f.endsWith('.partial')), 'disk failure leaves no partial file', fs.readdirSync(outDir));

    // 3b) Cambio de app / llamada a mitad: se detiene, se informa y no queda archivo.
    const hidden = await runCase('progressive-app-switch', { sourceFrames: 80, clipSeconds: 5, hideAfterMs: 2000 });
    report.cases.push(hidden);
    check(hidden.ok && hidden.interrupted, 'app switch is reported as interrupted (not saved, not cancelled)', hidden);
    check(!fs.readdirSync(outDir).some((f) => f.endsWith('.partial')), 'app switch leaves no partial file', fs.readdirSync(outDir));
    await page.evaluate(() => { delete document.hidden; });

    // 4) El modo anterior sigue disponible: Blob en memoria, sin tocar el puente.
    const sessionsBefore = sessions.size;
    const memory = await runCase('memory-fallback', { sourceFrames: 60, clipSeconds: 3, saveMode: 'memory' });
    report.cases.push(memory);
    check(memory.ok && !memory.progressive && memory.memoryBlobBytes > 1000 && sessions.size === sessionsBefore, 'memory mode still exports a Blob and bypasses native bridge', memory);
  } catch (e) {
    failed = true; report.cases.push({ fatal: String(e && e.stack || e) });
  } finally {
    await browser.close(); server.close();
    fs.writeFileSync(path.join(root, 'wivra-progressive-export.json'), JSON.stringify(report, null, 2));
    for (const c of report.cases) if ('check' in c) console.log((c.pass ? 'PASS ' : 'FAIL ') + c.check);
    if (failed) { console.error(JSON.stringify(report, null, 2)); process.exitCode = 1; }
    fs.rmSync(outDir, { recursive: true, force: true });
  }
})();
