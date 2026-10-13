// AgentCut · exportación en el propio teléfono. Sin servidor y sin librerías: el navegador
// reproduce cada clip (con su audio), se dibuja en un canvas con los textos y se graba con MediaRecorder.
// Va en tiempo real (un video de 20 s tarda unos 20 s). Los originales no se tocan. — Claude

const r2 = (n) => Math.round(n * 100) / 100;

// Lista de pasos en orden: clips, y "huecos" negros si hay espacio entre clips.
export function exportPlan(project) {
  const clips = [...project.clips].sort((a, b) => a.start - b.start);
  const segments = []; let cursor = 0;
  for (const c of clips) {
    if (c.start - cursor > 0.05) segments.push({ type: 'gap', dur: r2(c.start - cursor), start: cursor });
    segments.push({ type: 'clip', clip: c, dur: r2(c.out - c.in) });
    cursor = Math.max(cursor, c.start + (c.out - c.in));
  }
  const textEnd = project.texts.reduce((m, t) => Math.max(m, t.end), 0);
  return { segments, total: r2(Math.max(cursor, 0)), textBeyondEnd: textEnd > cursor + 0.05 };
}

// Tamaño de salida: respeta la forma del primer video, máximo 1080 en el lado corto, medidas pares.
export function outputSize(w, h, shortSide = 1080) {
  if (!(w > 0 && h > 0)) return { w: 1080, h: 1920 };
  const k = Math.min(1, shortSide / Math.min(w, h));
  const even = (n) => Math.max(2, Math.round((n * k) / 2) * 2);
  return { w: even(w), h: even(h) };
}

// Elige el mejor formato que el navegador sepa grabar. Safari da MP4; Chrome/Android suele dar WebM.
export const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4',
  'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
export function pickMime(isSupported) {
  for (const m of MIME_CANDIDATES) { try { if (isSupported(m)) return m; } catch { /* sigue */ } }
  return '';
}
export const extFor = (mime) => (/mp4/.test(mime || '') ? 'mp4' : 'webm');

export const textsAt = (project, t) => project.texts.filter((x) => t >= x.start && t < x.end);

// Parte un texto en líneas que quepan en `maxWidth` (measure(str) -> ancho).
export function wrapLines(text, maxWidth, measure) {
  const words = String(text).split(/\s+/).filter(Boolean); const lines = []; let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (cur && measure(next) > maxWidth) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}

// Dibuja un fotograma: el video centrado ("contain") sobre negro y los textos activos.
export function drawFrame(g, W, H, video, project, t) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  if (video && video.videoWidth > 0) {
    const k = Math.min(W / video.videoWidth, H / video.videoHeight), dw = video.videoWidth * k, dh = video.videoHeight * k;
    try { g.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh); } catch { /* fotograma aún no listo */ }
  }
  const size = Math.round(Math.min(W, H) * 0.06);
  g.font = `800 ${size}px -apple-system, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.lineJoin = 'round'; g.lineWidth = Math.max(2, size / 6); g.strokeStyle = 'rgba(0,0,0,.85)'; g.fillStyle = '#fff';
  let y = H * 0.86;
  for (const tx of textsAt(project, t)) {
    const lines = wrapLines(tx.text, W * 0.86, (s) => g.measureText(s).width);
    y -= (lines.length - 1) * size * 1.2;
    for (const line of lines) { g.strokeText(line, W / 2, y); g.fillText(line, W / 2, y); y += size * 1.2; }
    y -= size * 1.2 * lines.length + size * 0.4;
  }
}

const once = (el, ev) => new Promise((res) => el.addEventListener(ev, res, { once: true }));
const frame = () => new Promise((res) => requestAnimationFrame(res));

// Graba el proyecto. `media[id]` = { url, w, h }. Devuelve { blob, mime, ext, w, h, seconds }.
export async function recordProject({ project, media, onProgress = () => {}, isCancelled = () => false, fps = 30 }) {
  const plan = exportPlan(project);
  const firstClip = plan.segments.find((s) => s.type === 'clip');
  if (!firstClip) throw new Error('No hay clips para exportar.');
  if (typeof MediaRecorder === 'undefined') throw new Error('Este navegador no puede grabar video (falta MediaRecorder).');
  const first = media[firstClip.clip.asset_id] || {};
  const { w: W, h: H } = outputSize(first.w, first.h);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');

  const ev = document.createElement('video');
  ev.playsInline = true; ev.setAttribute('playsinline', ''); ev.preload = 'auto';
  ev.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none';
  document.body.appendChild(ev);

  const AC = window.AudioContext || window.webkitAudioContext; let ac = null, dest = null;
  const stream = canvas.captureStream(fps);
  try {
    ac = new AC(); await ac.resume().catch(() => {});
    dest = ac.createMediaStreamDestination(); ac.createMediaElementSource(ev).connect(dest);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  } catch { ac = null; /* sin audio: se avisa al final */ }
  const hasAudio = stream.getAudioTracks().length > 0;

  const mime = pickMime((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
  const chunks = []; rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => { rec.onstop = res; });
  const t0 = performance.now(); let cancelled = false;
  const report = (t) => onProgress({ t: Math.min(t, plan.total), total: plan.total, pct: plan.total ? Math.min(1, t / plan.total) : 1 });

  try {
    rec.start(1000);
    for (const seg of plan.segments) {
      if (isCancelled()) { cancelled = true; break; }
      if (seg.type === 'gap') {
        const s = performance.now();
        while (performance.now() - s < seg.dur * 1000 && !isCancelled()) {
          drawFrame(g, W, H, null, project, seg.start + (performance.now() - s) / 1000); report(seg.start + (performance.now() - s) / 1000); await frame();
        }
        continue;
      }
      const c = seg.clip, m = media[c.asset_id]; if (!m) throw new Error('Falta el video original de un clip.');
      if (ev.dataset.src !== m.url) { ev.dataset.src = m.url; ev.src = m.url; await Promise.race([once(ev, 'loadedmetadata'), once(ev, 'error').then(() => { throw new Error('No se pudo leer un video para exportar.'); })]); }
      if (Math.abs(ev.currentTime - c.in) > 0.02) { ev.currentTime = c.in; await once(ev, 'seeked'); }
      await ev.play();
      await new Promise((res) => {
        const tick = () => {
          const cur = ev.currentTime, t = c.start + (cur - c.in);
          drawFrame(g, W, H, ev, project, t); report(t);
          if (isCancelled() || cur >= c.out - 0.03 || ev.ended) return res();
          requestAnimationFrame(tick);
        };
        tick();
      });
      ev.pause();
    }
    await frame(); await frame();
  } finally {
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    ev.remove(); try { ac && ac.close(); } catch { /* nada */ }
  }
  if (cancelled || isCancelled()) return { cancelled: true };
  const type = rec.mimeType || mime || 'video/webm';
  return { blob: new Blob(chunks, { type }), mime: type, ext: extFor(type), w: W, h: H, seconds: r2((performance.now() - t0) / 1000), hasAudio, textBeyondEnd: plan.textBeyondEnd };
}
