/* Regenera las muestras de contenedor usadas por las pruebas de reparación de exportación:
   grabaciones REALES de MediaRecorder en Chromium (WebM VP8/Opus y MP4 H.264/Opus fragmentado)
   y un MP4 fragmentado H.264/AAC parecido al de Safari, hecho con ffmpeg. Son pequeñas (~2 s,
   240x180) y sintéticas: no contienen datos de nadie. Uso: node tools/make-mediarecorder-fixtures.cjs
   — Claude */
let playwright;
try { playwright = require('playwright'); } catch { playwright = require('/tmp/wivra-media-lab/node_modules/playwright'); }
const fs = require('node:fs'), path = require('node:path');
const { execFileSync } = require('node:child_process');
const out = path.resolve(__dirname, '../app/tests/fixtures/mediarecorder');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await playwright.chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage(); await page.goto('about:blank');
  for (const [mime, name] of [['video/webm;codecs=vp8,opus', 'chromium-vp8-opus.webm'], ['video/mp4;codecs=avc1,opus', 'chromium-avc1-opus-fragmented.mp4']]) {
    const b64 = await page.evaluate(async (mime) => {
      if (!MediaRecorder.isTypeSupported(mime)) return null;
      const c = document.createElement('canvas'); c.width = 240; c.height = 180; const g = c.getContext('2d');
      const s = c.captureStream(30), ac = new AudioContext(), o = ac.createOscillator(), d = ac.createMediaStreamDestination();
      o.connect(d); o.start(); d.stream.getAudioTracks().forEach((t) => s.addTrack(t));
      const rec = new MediaRecorder(s, { mimeType: mime, videoBitsPerSecond: 250000 }), parts = [];
      rec.ondataavailable = (e) => e.data.size && parts.push(e.data); const stopped = new Promise((r) => { rec.onstop = r; });
      rec.start(500); const t0 = performance.now();
      while (performance.now() - t0 < 2200) { g.fillStyle = `hsl(${(performance.now() / 8) % 360},70%,45%)`; g.fillRect(0, 0, 240, 180); g.fillStyle = '#fff'; g.font = '36px sans-serif'; g.fillText(((performance.now() - t0) / 1000).toFixed(1), 70, 100); await new Promise((r) => requestAnimationFrame(r)); }
      rec.stop(); await stopped; s.getTracks().forEach((t) => t.stop()); await ac.close();
      const u = new Uint8Array(await new Blob(parts).arrayBuffer()); let bin = '';
      for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      return btoa(bin);
    }, mime);
    if (!b64) { console.log('no soportado en este Chromium:', mime); continue; }
    fs.writeFileSync(path.join(out, name), Buffer.from(b64, 'base64'));
    console.log('escrito', name);
  }
  await browser.close();
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=240x180:rate=30:duration=2', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=2',
    '-c:v', 'libx264', '-profile:v', 'baseline', '-pix_fmt', 'yuv420p', '-g', '15', '-c:a', 'aac', '-b:a', '64k', '-shortest',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof', path.join(out, 'ffmpeg-h264-aac-fragmented.mp4')]);
  console.log('escrito ffmpeg-h264-aac-fragmented.mp4');
})();
