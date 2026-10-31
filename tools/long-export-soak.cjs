/* Exportación LARGA con el motor real (app/export.mjs recordProject, tiempo real) por el camino
   progresivo: puente "nativo" simulado que escribe cada fragmento a disco como Android/iOS.
   Montaje: muchos cortes de dos fuentes (destello + pitido cada 2 s como marcas de sincronía),
   fundidos de entrada/salida, un texto cada 30 s, música independiente en bucle y voz independiente.
   Mide: duración planificada vs exportada, desfase audio/video en cada marca, tamaño, velocidad,
   memoria (heap JS, cola del puente y RSS de Chromium) y reparación del contenedor.
   Uso: node tools/long-export-soak.cjs <minutos>   (Chromium Linux; NO es un teléfono) — Claude */
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/tmp/wivra-media-lab/node_modules/playwright'); }
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), os = require('node:os');
const { execFileSync, spawnSync } = require('node:child_process');
const { crc32 } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const minutes = Number(process.argv[2] || 1), total = minutes * 60;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wivra-soak-'));

// Fuentes de 5 min: A gris oscuro, B azul oscuro; destello blanco 2 cuadros + pitido 50 ms cada 2 s.
const srcLen = 300;
const makeSource = (name, color) => { const f = path.join(work, name);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=640x360:r=30:d=${srcLen},drawbox=x=0:y=0:w=640:h=360:color=white:t=fill:enable='lt(mod(t\\,2)\\,0.066)',drawtext=text='%{pts\\:hms}':x=20:y=20:fontsize=26:fontcolor=gray`,
    '-f', 'lavfi', '-i', `aevalsrc='if(lt(mod(t\\,2)\\,0.05)\\,0.6*sin(2*PI*1000*t)\\,0)':s=48000:d=${srcLen}`,
    '-c:v', 'libvpx', '-b:v', '800k', '-g', '30', '-c:a', 'libopus', '-b:a', '64k', f]); return f; };
const srcA = makeSource('a.webm', '0x202020'), srcB = makeSource('b.webm', '0x101040');
// Música 120 s (tono grave suave, sin marcas) y voz 20 s (ruido de banda, sin marcas): pistas independientes.
const music = path.join(work, 'music.wav'), voice = path.join(work, 'voice.wav'), beacon = path.join(work, 'beacon.wav');
// Baliza independiente: pitido de 1500 Hz y 50 ms en t = 5, 15, 25… s de la LÍNEA DE TIEMPO.
// Mide si el audio grabado aparte (voces, música) se mantiene alineado con el video exportado.
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', "aevalsrc='if(lt(mod(t-5\\,10)\\,0.05)*gte(t\\,5)\\,0.5*sin(2*PI*1500*t)\\,0)':s=48000:d=60", beacon]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=110:duration=120:sample_rate=48000', '-af', 'volume=0.05', music]);
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anoisesrc=d=20:c=pink:r=48000:a=0.02', voice]);

// Montaje determinista: cortes de 3–8 s que empiezan 0,5 s antes de una marca; alterna fuentes.
const clips = [], audioClips = [], texts = [];
let t = 0, i = 0;
while (t < total - 0.01) {
  const len = Math.min(3 + (i * 7) % 6, total - t), marker = 2 * (1 + (i * 37) % Math.floor((srcLen - 12) / 2));
  clips.push({ id: 'c' + i, asset_id: i % 2 ? 'b' : 'a', start: t, in: marker - 0.5, out: marker - 0.5 + len, volume: 1,
    ...(i % 5 === 0 ? { fxIn: 'fade', fxOut: 'fade', fxDur: 0.3 } : {}) });
  t += len; i++;
}
for (let m = 0; m < total; m += 120) audioClips.push({ id: 'm' + m, asset_id: 'music', start: m, in: 0, out: Math.min(120, total - m), role: 'music', volume: 0.6 });
for (let v = 15; v + 20 <= total; v += 300) audioClips.push({ id: 'v' + v, asset_id: 'voice', start: v, in: 0, out: 20, role: 'voice_primary', volume: 0.8 });
for (let b = 0; b < total; b += 60) audioClips.push({ id: 'b' + b, asset_id: 'beacon', start: b, in: 0, out: Math.min(60, total - b), role: 'voice_guest', volume: 1 });
for (let s = 0; s < total; s += 30) texts.push({ id: 't' + s, text: 'Wivra soak ' + Math.round(s / 60) + ' min', start: s + 1, end: Math.min(s + 6, total), position: 'bottom' });
const project = { clips, overlayClips: [], audioClips, texts, format: { aspect: 'original' } };

const files = { '/a.webm': srcA, '/b.webm': srcB, '/music.wav': music, '/voice.wav': voice, '/beacon.wav': beacon };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname); let file = files[url];
  if (!file && /^\/(app|core)\//.test(url)) file = path.resolve(root, '.' + url);
  if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  const st = fs.statSync(file), type = file.endsWith('.webm') ? 'video/webm' : file.endsWith('.wav') ? 'audio/wav' : 'text/javascript';
  const range = req.headers.range;
  if (range) { const [a, b] = range.replace('bytes=', '').split('-'); const s = +a, e = b ? +b : st.size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${s}-${e}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1 }); return fs.createReadStream(file, { start: s, end: e }).pipe(res); }
  res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': st.size }); fs.createReadStream(file).pipe(res);
});

// Puente "nativo" con las reglas de Android: orden, CRC, borrado del parcial.
const out = path.join(work, 'export.webm.partial'); let fd = null, seqNext = 0, written = 0, crc = 0, chunkSizes = [];
function nativeHandle(msg) {
  if (msg.bin) {
    const buf = Buffer.from(msg.bin, 'base64'), rid = buf.readUInt32LE(4), seq = buf.readUInt32LE(12), data = buf.subarray(16);
    if (seq !== seqNext) return { rid, ok: false, error: 'out of order' };
    fs.writeSync(fd, data); seqNext++; written += data.length; crc = crc32(data, crc); chunkSizes.push(data.length);
    return { rid, ok: true, seq, written };
  }
  const j = JSON.parse(msg.json);
  if (j.op === 'hello') return { rid: j.rid, ok: true, arrayBuffer: true };
  if (j.op === 'begin') { fd = fs.openSync(out, 'w'); return { rid: j.rid, ok: true, token: 7, displayName: 'soak.webm' }; }
  if (j.op === 'abort') { if (fd != null) fs.closeSync(fd); fd = null; fs.rmSync(out, { force: true }); return { rid: j.rid, ok: true }; }
  if (j.op === 'finish') { fs.fsyncSync(fd); fs.closeSync(fd); fd = null; const ok = written === j.bytes && (crc >>> 0) === j.crc32 && seqNext === j.chunks;
    return ok ? { rid: j.rid, ok: true, token: 7, bytes: written, crc32: crc >>> 0, displayName: 'soak.webm' } : { rid: j.rid, ok: false, error: 'verification failed' }; }
  return { rid: j.rid, ok: false, error: 'op' };
}
function treeRssMB() {
  const parents = new Map();
  for (const d of fs.readdirSync('/proc')) { if (!/^\d+$/.test(d)) continue; try { const st = fs.readFileSync(`/proc/${d}/stat`, 'utf8'); parents.set(+d, +st.slice(st.lastIndexOf(')') + 2).split(' ')[1]); } catch {} }
  let kb = 0; for (const p of parents.keys()) { if (p === process.pid) continue; let x = p, n = 0; while (x && n++ < 50 && x !== process.pid) x = parents.get(x);
    if (x === process.pid) { try { const m = /VmRSS:\s+(\d+)/.exec(fs.readFileSync(`/proc/${p}/status`, 'utf8')); if (m) kb += +m[1]; } catch {} } }
  return kb / 1024;
}

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await playwright.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'] });
  const report = { type: 'WIVRA_LONG_EXPORT_SOAK', runner: 'Playwright Chromium Linux, simulated native bridge; NOT a phone', minutes,
    montage: { clips: clips.length, fades: clips.filter((c) => c.fxIn).length, texts: texts.length, independentAudioClips: audioClips.length } };
  const samples = []; let failed = false;
  try {
    const page = await browser.newPage();
    await page.exposeFunction('__wivraNativeBridge', (msg) => JSON.stringify(nativeHandle(msg)));
    await page.exposeFunction('__soakSample', (s) => { samples.push({ ...s, rssMB: Math.round(treeRssMB()) }); });
    await page.goto(`http://127.0.0.1:${server.address().port}/app/export.mjs`);
    await page.evaluate(() => {
      const toB64 = (ab) => { const u = new Uint8Array(ab); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
      window.WivraExportNative = { onmessage: null, postMessage(m) { const msg = m instanceof ArrayBuffer ? { bin: toB64(m) } : { json: m }; window.__wivraNativeBridge(msg).then((r) => this.onmessage && this.onmessage({ data: r })); } };
    });
    const t0 = Date.now();
    const result = await page.evaluate(async ({ project }) => {
      const { recordProject, exportPlan } = await import('/app/export.mjs');
      const media = { a: { url: '/a.webm', kind: 'video', w: 640, h: 360 }, b: { url: '/b.webm', kind: 'video', w: 640, h: 360 }, music: { url: '/music.wav', kind: 'audio' }, voice: { url: '/voice.wav', kind: 'audio' }, beacon: { url: '/beacon.wav', kind: 'audio' } };
      let lastPct = -1;
      const sampler = setInterval(() => window.__soakSample({ heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null, pct: lastPct }), 5000);
      try {
        const r = await recordProject({ project, media, onProgress: ({ pct }) => { lastPct = Math.round(pct * 1000) / 10; } });
        return { planned: exportPlan(project).total, progressive: !!r.progressive, mime: r.mime, hasAudio: r.hasAudio, saved: r.saved && { bytes: r.saved.bytes, chunks: r.saved.chunks, peakQueuedBytes: r.saved.peakQueuedBytes },
          skippedAudio: r.skippedAudio, skippedOverlay: r.skippedOverlay, cancelled: !!r.cancelled, interrupted: !!r.interrupted, audioBlocked: !!r.audioBlocked };
      } catch (e) { return { error: String(e && e.message || e) }; } finally { clearInterval(sampler); }
    }, { project });
    report.wallSeconds = Math.round((Date.now() - t0) / 100) / 10;
    report.result = result;
    if (result.error || !result.saved) throw new Error('export failed: ' + JSON.stringify(result));
    // Contenedor: misma reparación que hace el nativo (aquí con la implementación JS, idéntica a Kotlin).
    const { webmMakeSeekable, inspectExport } = await import(path.join(root, 'app/media-container.mjs'));
    const raw = fs.readFileSync(out), fixedFile = path.join(work, 'export.webm');
    const before = inspectExport(raw), repaired = webmMakeSeekable(raw); fs.writeFileSync(fixedFile, repaired.bytes);
    report.container = { rawBytes: raw.length, before, after: inspectExport(repaired.bytes), cues: repaired.cues, clusters: repaired.clusters };
    const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name', '-of', 'json', fixedFile]).toString());
    const exported = +probe.format.duration;
    report.duration = { plannedSeconds: result.planned, exportedSeconds: exported, driftSeconds: +(exported - result.planned).toFixed(3), driftPercent: +((exported - result.planned) / result.planned * 100).toFixed(3) };
    report.speedVsRealtime = +(result.planned / report.wallSeconds).toFixed(3);
    report.sizeMB = +(raw.length / 1e6).toFixed(1);
    report.chunkBytes = { count: chunkSizes.length, max: Math.max(...chunkSizes), mean: Math.round(chunkSizes.reduce((a, b) => a + b, 0) / chunkSizes.length) };
    // Sincronía: destello (video) frente a pitido (audio) en cada marca del montaje.
    const vlog = spawnSync('ffmpeg', ['-v', 'info', '-i', fixedFile, '-an', '-vf', 'signalstats,metadata=mode=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 30 }).stderr;
    const frames = [...vlog.matchAll(/pts_time:([\d.]+)\s*\n.*?YAVG=([\d.]+)/g)].map((m) => ({ t: +m[1], y: +m[2] }));
    const flashes = []; let prev = false; for (const f of frames) { const on = f.y > 128; if (on && !prev) flashes.push(f.t); prev = on; }
    const alog = spawnSync('ffmpeg', ['-v', 'info', '-i', fixedFile, '-vn', '-af', 'bandpass=f=1000:width_type=h:w=150,silencedetect=noise=-35dB:d=0.02', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stderr;
    const beeps = [...alog.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
    const offsets = []; let j = 0;
    for (const f of flashes) { while (j + 1 < beeps.length && beeps[j + 1] <= f) j++; const cand = [beeps[j], beeps[j + 1]].filter((b) => b != null); const best = cand.sort((a, b) => Math.abs(a - f) - Math.abs(b - f))[0]; if (best != null && Math.abs(best - f) < 0.5) offsets.push({ t: f, o: best - f }); }
    const q = Math.max(1, Math.floor(offsets.length / 4)), firstQ = offsets.slice(0, q), lastQ = offsets.slice(-q);
    const mean = (a) => a.length ? Math.round(a.reduce((s, x) => s + x.o, 0) / a.length * 1000) : null;
    report.avSync = { markersVideo: flashes.length, markersAudio: beeps.length, matched: offsets.length, meanMs: mean(offsets), maxAbsMs: offsets.length ? Math.round(Math.max(...offsets.map((x) => Math.abs(x.o))) * 1000) : null,
      firstQuarterMeanMs: mean(firstQ), lastQuarterMeanMs: mean(lastQ) };
    // Independent audio: beacon beeps must appear at their planned TIMELINE times.
    const blog = spawnSync('ffmpeg', ['-v', 'info', '-i', fixedFile, '-vn', '-af', 'bandpass=f=1500:width_type=h:w=150,silencedetect=noise=-35dB:d=0.02', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stderr;
    const beaconFound = [...blog.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
    const planned = []; for (let x = 5; x < result.planned - 0.2; x += 10) planned.push(x);
    const bOff = planned.map((p) => { const near = beaconFound.reduce((best, f) => (best == null || Math.abs(f - p) < Math.abs(best - p) ? f : best), null); return near != null && Math.abs(near - p) < 1 ? { t: p, o: near - p } : null; }).filter(Boolean);
    const bq = Math.max(1, Math.floor(bOff.length / 4));
    // Where does timeline time T land in the file? Every flash has a known planned timeline time
    // (each cut starts 0.5 s before a source flash, then one every 2 s), so the measured flashes give
    // the file's timeline drift d(T). Sync of independent audio = beacon - (T + d(T)), i.e. relative
    // to the VIDEO at that point, which is what a viewer perceives; vs planned it also includes d(T).
    const plannedFlashes = [];
    for (const c of project.clips) { const len = c.out - c.in; for (let k = 0.5; k < len - 0.05; k += 2) plannedFlashes.push(c.start + k); }
    plannedFlashes.sort((a, b) => a - b);
    const drift = []; let fi = 0;
    for (const p of plannedFlashes) {
      const prevD = drift.length ? drift[drift.length - 1].d : 0;
      while (fi < flashes.length && flashes[fi] < p + prevD - 0.6) fi++;
      if (fi < flashes.length && Math.abs(flashes[fi] - (p + prevD)) < 0.6) { drift.push({ t: p, d: flashes[fi] - p }); fi++; }
    }
    const dAt = (t) => { if (!drift.length) return 0; let i = drift.findIndex((x) => x.t >= t); if (i <= 0) return drift[Math.max(0, i)].d; if (i < 0) return drift[drift.length - 1].d;
      const a = drift[i - 1], b = drift[i]; return a.d + (b.d - a.d) * (t - a.t) / (b.t - a.t); };
    const rel = planned.map((p) => { const want = p + dAt(p); const near = beaconFound.reduce((best, f) => (best == null || Math.abs(f - want) < Math.abs(best - want) ? f : best), null);
      return near != null && Math.abs(near - want) < 1 ? { t: p, o: near - want } : null; }).filter(Boolean);
    const rq = Math.max(1, Math.floor(rel.length / 4));
    report.timelineDrift = { flashesMatched: drift.length, ofPlanned: plannedFlashes.length, endMs: drift.length ? Math.round(drift[drift.length - 1].d * 1000) : null };
    report.independentAudio = { planned: planned.length, matched: rel.length,
      vsVideo: { meanMs: mean(rel), maxAbsMs: rel.length ? Math.round(Math.max(...rel.map((x) => Math.abs(x.o))) * 1000) : null, firstQuarterMeanMs: mean(rel.slice(0, rq)), lastQuarterMeanMs: mean(rel.slice(-rq)) },
      vsPlannedTimeline: { meanMs: mean(bOff), maxAbsMs: bOff.length ? Math.round(Math.max(...bOff.map((x) => Math.abs(x.o))) * 1000) : null, firstQuarterMeanMs: mean(bOff.slice(0, bq)), lastQuarterMeanMs: mean(bOff.slice(-bq)) } };
    report.memory = { samples: samples.length, heapPeakMB: Math.max(0, ...samples.map((s) => s.heapMB || 0)), chromiumRssPeakMB: Math.max(0, ...samples.map((s) => s.rssMB || 0)),
      chromiumRssFirstMB: samples[0]?.rssMB ?? null, chromiumRssLastMB: samples.at(-1)?.rssMB ?? null };
    report.checks = {
      progressive: result.progressive === true,
      durationWithin1Percent: Math.abs(report.duration.driftPercent) <= 1,
      repairedHasDurationAndCues: report.container.after.declaresDuration && report.container.after.seekIndex,
      avSyncWithin120ms: report.avSync.matched > 0 && report.avSync.maxAbsMs <= 120,
      noSkippedAudio: !(result.skippedAudio || []).length,
      independentAudioVsVideoWithin150ms: report.independentAudio.matched >= Math.max(1, report.independentAudio.planned - 1) && report.independentAudio.vsVideo.maxAbsMs <= 150,
    };
    failed = Object.values(report.checks).some((v) => !v);
  } catch (e) { failed = true; report.fatal = String(e && e.stack || e); }
  finally {
    await browser.close(); server.close();
    const file = path.join(root, `wivra-long-export-soak-${minutes}min.json`); fs.writeFileSync(file, JSON.stringify({ ...report, samples }, null, 2));
    console.log(JSON.stringify(report, null, 2));
    fs.rmSync(work, { recursive: true, force: true });
    if (failed) process.exitCode = 1;
  }
})();
