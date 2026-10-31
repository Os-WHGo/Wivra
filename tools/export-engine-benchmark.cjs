/* Banco comparativo AISLADO de motores de exportación (no es código de la app):
   A) motor actual: app/export.mjs recordProject (Canvas + MediaRecorder, tiempo real);
   B) prototipo: WebCodecs + Mediabunny (decodifica, dibuja y codifica sin esperar al reloj).
   Mismo montaje para ambos: cortes de una fuente con destello blanco + pitido cada 2 s
   (marcas de sincronía), texto encima y audio. Mide tiempo, memoria (heap JS y RSS de todo
   Chromium), tamaño, duración (ffprobe) y desfase audio/video en cada marca.
   Uso: node tools/export-engine-benchmark.cjs [segundos=30] [cortes=12]
   Chromium Linux con códecs por software: NO representa un teléfono. — Claude */
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/tmp/wivra-media-lab/node_modules/playwright'); }
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const total = Number(process.argv[2] || 30), cutsN = Number(process.argv[3] || 12);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wivra-engines-'));
const mbDir = [path.join(root, 'node_modules/mediabunny/dist/bundles'), '/tmp/wivra-media-lab/node_modules/mediabunny/dist/bundles',
  ...(process.env.MEDIABUNNY_DIR ? [process.env.MEDIABUNNY_DIR] : [])].find((d) => fs.existsSync(path.join(d, 'mediabunny.mjs')));
if (!mbDir) { console.error('mediabunny no instalado (npm install --prefix /tmp/wivra-media-lab mediabunny@1.61.6)'); process.exit(2); }

// Fuente: negro con destello blanco de 2 cuadros y pitido de 50 ms cada 2 s, VP8/Opus WebM.
const srcSeconds = Math.max(20, Math.ceil(total * 1.5));
const src = path.join(work, 'source.webm');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=black:s=640x360:r=30:d=${srcSeconds},drawbox=x=0:y=0:w=640:h=360:color=white:t=fill:enable='lt(mod(t\\,2)\\,0.066)',drawtext=text='%{pts\\:hms}':x=20:y=20:fontsize=28:fontcolor=gray`,
  '-f', 'lavfi', '-i', `aevalsrc='if(lt(mod(t\\,2)\\,0.05)\\,0.6*sin(2*PI*1000*t)\\,0)':s=48000:d=${srcSeconds}`,
  '-c:v', 'libvpx', '-b:v', '1M', '-g', '30', '-c:a', 'libopus', '-b:a', '96k', src]);
// Montaje: cortes de igual duración que empiezan justo antes de una marca (para poder medirla).
const cutLen = total / cutsN, cuts = [];
for (let i = 0; i < cutsN; i++) { const marker = 2 * ((i * 3) % Math.floor((srcSeconds - cutLen - 2) / 2) + 1); cuts.push({ in: marker - 0.5, out: marker - 0.5 + cutLen }); }

const files = { '/source.webm': src };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = files[url];
  if (!file && url.startsWith('/mb/')) file = path.join(mbDir, path.basename(url));
  if (!file && /^\/(app|core)\//.test(url)) file = path.resolve(root, '.' + url);
  if (!file || !file.startsWith('/') || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  const st = fs.statSync(file), type = file.endsWith('.webm') ? 'video/webm' : 'text/javascript';
  const range = req.headers.range;
  if (range) { const [a, b] = range.replace('bytes=', '').split('-'); const s = +a, e = b ? +b : st.size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 }); return fs.createReadStream(file, { start: s, end: e }).pipe(res); }
  res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': st.size, 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
});

function treeRssMB(pid) {
  // Sum RSS of the browser process and all descendants (renderer, GPU, utility).
  const parents = new Map();
  for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d)) continue; try { const st = fs.readFileSync(`/proc/${d}/stat`, 'utf8'); const pp = +st.slice(st.lastIndexOf(')') + 2).split(' ')[1]; parents.set(+d, pp); } catch {} }
  const inTree = (p) => { for (let x = p, n = 0; x && n < 50; x = parents.get(x), n++) if (x === pid) return true; return false; };
  let kb = 0; for (const p of parents.keys()) if (inTree(p)) { try { const m = /VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${p}/status`, 'utf8')); if (m) kb += +m[1]; } catch {} }
  return kb / 1024;
}

function analyse(file, planned) {
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,codec_type', '-of', 'json', file]).toString());
  const flashes = [...execFileSync('ffmpeg', ['-v', 'info', '-i', file, '-an', '-vf', "signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG", '-f', 'null', '-'], { stdio: ['ignore', 'pipe', 'pipe'] })
    .toString().matchAll(/pts_time:([\d.]+)[\s\S]*?YAVG=([\d.]+)/g)];
  // ffmpeg prints metadata on stderr: rerun capturing stderr.
  const vlog = require('node:child_process').spawnSync('ffmpeg', ['-v', 'info', '-i', file, '-an', '-vf', 'signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stderr;
  const frames = [...vlog.matchAll(/pts_time:([\d.]+)\s*\n.*?YAVG=([\d.]+)/g)].map((m) => ({ t: +m[1], y: +m[2] }));
  const flashStarts = []; let prev = false;
  for (const f of frames) { const on = f.y > 128; if (on && !prev) flashStarts.push(f.t); prev = on; }
  const alog = require('node:child_process').spawnSync('ffmpeg', ['-v', 'info', '-i', file, '-vn', '-af', 'silencedetect=noise=-30dB:d=0.02', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 }).stderr;
  const beepStarts = [...alog.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  const offsets = flashStarts.map((f) => { let best = null; for (const b of beepStarts) if (best == null || Math.abs(b - f) < Math.abs(best)) best = b - f; return best; }).filter((o) => o != null && Math.abs(o) < 0.5);
  const duration = +probe.format.duration;
  void flashes;
  return { durationSeconds: duration, plannedSeconds: planned, driftSeconds: +(duration - planned).toFixed(3), sizeMB: +(fs.statSync(file).size / 1e6).toFixed(2),
    codecs: probe.streams.map((s) => s.codec_type + ':' + s.codec_name), markers: flashStarts.length, beeps: beepStarts.length,
    avOffsetMs: offsets.length ? { mean: Math.round(offsets.reduce((a, b) => a + b, 0) / offsets.length * 1000), maxAbs: Math.round(Math.max(...offsets.map(Math.abs)) * 1000), samples: offsets.length } : null };
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await playwright.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'] });
  // Chromium processes are descendants of this Node process; their RSS excludes Node's own.
  const pid = process.pid, ownRss = () => { const m = /VmRSS:\s+(\d+)/.exec(fs.readFileSync('/proc/self/status', 'utf8')); return m ? +m[1] / 1024 : 0; };
  const report = { type: 'WIVRA_EXPORT_ENGINE_BENCHMARK', runner: 'Playwright Chromium Linux (software codecs), not a phone', mediabunny: require(path.join(mbDir, '../../package.json')).version, montage: { totalSeconds: total, cuts: cutsN }, engines: {} };
  try {
    for (const engine of ['mediarecorder', 'mediabunny']) {
      const page = await browser.newPage();
      const out = path.join(work, engine + '.webm'); const fd = fs.openSync(out, 'w');
      await page.exposeFunction('__writeAt', (pos, b64) => { const buf = Buffer.from(b64, 'base64'); fs.writeSync(fd, buf, 0, buf.length, pos); return buf.length; });
      await page.goto(base + '/app/export.mjs');
      let rssPeak = 0; const sampler = setInterval(() => { rssPeak = Math.max(rssPeak, treeRssMB(pid) - ownRss()); }, 250);
      const t0 = Date.now();
      const r = await page.evaluate(async ({ engine, cuts, total }) => {
        const b64 = (u) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
        let heapPeak = 0; const heap = setInterval(() => { if (performance.memory) heapPeak = Math.max(heapPeak, performance.memory.usedJSHeapSize); }, 200);
        const started = performance.now();
        try {
          if (engine === 'mediarecorder') {
            const { recordProject } = await import('/app/export.mjs');
            let start = 0; const clips = cuts.map((c, i) => { const clip = { id: 'c' + i, asset_id: 'v', start, in: c.in, out: c.out, volume: 1 }; start += c.out - c.in; return clip; });
            const project = { clips, overlayClips: [], audioClips: [], texts: [{ id: 't', text: 'Wivra benchmark', start: 0, end: total, position: 'bottom' }], format: { aspect: 'original' } };
            const res = await recordProject({ project, media: { v: { url: '/source.webm', kind: 'video', w: 640, h: 360 } }, saveMode: 'memory' });
            const bytes = new Uint8Array(await res.blob.arrayBuffer());
            for (let i = 0; i < bytes.length; i += 1 << 20) await window.__writeAt(i, b64(bytes.subarray(i, i + (1 << 20))));
            return { ok: true, wall: (performance.now() - started) / 1000, heapPeak, mime: res.mime, repaired: res.container && res.container.fixed };
          }
          const M = await import('/mb/mediabunny.mjs');
          const input = new M.Input({ source: new M.UrlSource('/source.webm'), formats: M.ALL_FORMATS });
          const vt = await input.getPrimaryVideoTrack(), at = await input.getPrimaryAudioTrack();
          const W = 640, H = 360, canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; const g = canvas.getContext('2d');
          const codec = await M.getFirstEncodableVideoCodec(['avc', 'vp9', 'vp8'], { width: W, height: H });
          const writes = []; let pending = Promise.resolve();
          const writable = new WritableStream({ write(chunk) { pending = pending.then(() => window.__writeAt(chunk.position, b64(chunk.data))); return pending; } });
          // H.264 → MP4 (moov at the end, written by position); VP9/VP8 → WebM.
          const mp4 = codec === 'avc', acodec = mp4 && await M.canEncodeAudio('aac') ? 'aac' : 'opus';
          const output = new M.Output({ format: mp4 ? new M.Mp4OutputFormat({ fastStart: false }) : new M.WebMOutputFormat(), target: new M.StreamTarget(writable, { chunked: true, chunkSize: 1 << 20 }) });
          const vs = new M.CanvasSource(canvas, { codec, bitrate: 2e6, keyFrameInterval: 1 }); output.addVideoTrack(vs, { frameRate: 30 });
          const as = new M.AudioBufferSource({ codec: acodec, bitrate: 96e3 }); output.addAudioTrack(as);
          await output.start();
          const vsink = new M.CanvasSink(vt, { width: W, height: H, fit: 'contain' }), asink = new M.AudioBufferSink(at);
          let outT = 0, frames = 0;
          for (const cut of cuts) {
            const len = cut.out - cut.in;
            for await (const wc of vsink.canvases(cut.in, cut.out)) {
              const s = Math.max(wc.timestamp, cut.in), e = Math.min(wc.timestamp + wc.duration, cut.out); if (e <= s) continue;
              g.drawImage(wc.canvas, 0, 0, W, H); g.fillStyle = '#fff'; g.font = '700 28px sans-serif'; g.textAlign = 'center'; g.fillText('Wivra benchmark', W / 2, H - 30);
              await vs.add(outT + (s - cut.in), e - s); frames++;
            }
            for await (const wb of asink.buffers(cut.in, cut.out)) {
              const b = wb.buffer, s = Math.max(wb.timestamp, cut.in), e = Math.min(wb.timestamp + wb.duration, cut.out); if (e <= s) continue;
              const from = Math.round((s - wb.timestamp) * b.sampleRate), n = Math.round((e - s) * b.sampleRate); if (n <= 0) continue;
              const part = new AudioBuffer({ length: n, sampleRate: b.sampleRate, numberOfChannels: b.numberOfChannels });
              for (let ch = 0; ch < b.numberOfChannels; ch++) part.copyToChannel(b.getChannelData(ch).subarray(from, from + n), ch);
              await as.add(part);
            }
            outT += len;
          }
          await output.finalize(); await pending;
          void writes;
          return { ok: true, wall: (performance.now() - started) / 1000, heapPeak, codec, audioCodec: acodec, container: mp4 ? 'mp4' : 'webm', frames };
        } catch (e) { return { ok: false, error: String(e && e.stack || e) }; } finally { clearInterval(heap); }
      }, { engine, cuts, total });
      clearInterval(sampler); fs.closeSync(fd);
      const entry = { ...r, wallSeconds: +((Date.now() - t0) / 1000).toFixed(2), heapPeakMB: r.heapPeak ? +(r.heapPeak / 1e6).toFixed(1) : null, chromiumRssPeakMB: rssPeak ? Math.round(rssPeak) : null };
      delete entry.heapPeak; delete entry.wall;
      if (r.ok) { Object.assign(entry, analyse(out, total)); entry.speedVsRealtime = +(total / entry.wallSeconds).toFixed(2); }
      report.engines[engine] = entry;
      console.log(engine, JSON.stringify(entry));
      await page.close();
    }
  } finally {
    await browser.close(); server.close();
    fs.writeFileSync(path.join(root, 'wivra-export-engine-benchmark.json'), JSON.stringify(report, null, 2));
    fs.rmSync(work, { recursive: true, force: true });
  }
  const bad = Object.values(report.engines).filter((e) => !e.ok);
  if (bad.length) { console.error(JSON.stringify(report, null, 2)); process.exitCode = 1; }
})();
