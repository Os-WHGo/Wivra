/* ¿Muestran duración y dejan avanzar los reproductores reales? Carga en <video> las grabaciones
   reales de MediaRecorder (app/tests/fixtures/mediarecorder) ANTES y DESPUÉS de la reparación de
   app/media-container.mjs, en cada motor de Playwright instalado (Chromium, WebKit, Firefox).
   WebKit de Linux no es Safari de iPhone: es una referencia, no una certificación. — Claude */
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/tmp/wivra-media-lab/node_modules/playwright'); }
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const root = path.resolve(__dirname, '..'), fixtures = path.join(root, 'app/tests/fixtures/mediarecorder');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wivra-playback-'));

(async () => {
  const { finalizeExportBytes } = await import(path.join(root, 'app/media-container.mjs'));
  const cases = [];
  for (const name of ['chromium-vp8-opus.webm', 'chromium-avc1-opus-fragmented.mp4', 'ffmpeg-h264-aac-fragmented.mp4']) {
    const raw = fs.readFileSync(path.join(fixtures, name)), fixed = finalizeExportBytes(new Uint8Array(raw));
    const ext = path.extname(name), base = path.basename(name, ext);
    fs.writeFileSync(path.join(work, base + '.raw' + ext), raw); fs.writeFileSync(path.join(work, base + '.fixed' + ext), fixed.bytes);
    cases.push(base + '.raw' + ext, base + '.fixed' + ext);
  }
  const server = http.createServer((req, res) => {
    const f = path.join(work, path.basename(decodeURIComponent(req.url))); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    const st = fs.statSync(f), type = f.endsWith('.webm') ? 'video/webm' : 'video/mp4', range = req.headers.range;
    if (range) { const [a, b] = range.replace('bytes=', '').split('-'); const s = +a, e = b ? +b : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 }); return fs.createReadStream(f, { start: s, end: e }).pipe(res); }
    res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': st.size }); fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`, report = { type: 'WIVRA_CONTAINER_PLAYBACK', results: [] };
  let regressions = 0;
  for (const engine of ['chromium', 'webkit', 'firefox']) {
    let browser; try { browser = await playwright[engine].launch(); } catch { report.results.push({ engine, available: false }); continue; }
    const page = await browser.newPage(); await page.goto(base + 'none');
    const byFile = {};
    for (const file of cases) {
      byFile[file] = await page.evaluate(async (url) => {
        const v = document.createElement('video'); v.muted = true; v.preload = 'auto'; v.src = url;
        const ok = await new Promise((res) => { v.onloadedmetadata = () => res(true); v.onerror = () => res(false); setTimeout(() => res(false), 8000); });
        if (!ok) return { playable: false, error: v.error ? v.error.code : 'timeout' };
        const duration = Number.isFinite(v.duration) ? +v.duration.toFixed(3) : String(v.duration);
        v.currentTime = 1.5;
        const seeked = await new Promise((res) => { v.onseeked = () => res(true); setTimeout(() => res(false), 5000); });
        return { playable: true, duration, seekableEnd: v.seekable.length ? +v.seekable.end(0).toFixed(3) : 0, seeked, at: +v.currentTime.toFixed(3) };
      }, base + file);
    }
    // A repair must never make a file less playable than the raw recording.
    for (const file of cases.filter((f) => f.includes('.fixed'))) {
      const raw = byFile[file.replace('.fixed', '.raw')], fixed = byFile[file];
      if (raw.playable && !fixed.playable) regressions++;
      if (raw.playable && fixed.playable && typeof raw.duration === 'number' && typeof fixed.duration !== 'number') regressions++;
    }
    report.results.push({ engine, available: true, version: browser.version(), files: byFile });
    console.log(engine, browser.version(), JSON.stringify(byFile));
    await browser.close();
  }
  server.close();
  fs.writeFileSync(path.join(root, 'wivra-container-playback.json'), JSON.stringify(report, null, 2));
  fs.rmSync(work, { recursive: true, force: true });
  report.regressions = regressions;
  if (regressions) { console.error('Repair made playback worse in ' + regressions + ' case(s)'); process.exitCode = 1; }
})();
