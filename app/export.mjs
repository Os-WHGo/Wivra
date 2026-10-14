// Wivra · exportación en el propio teléfono. Sin servidor y sin librerías: el navegador
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
  const end = [project.overlayClips || [], project.audioClips || []].reduce((m, g) => g.reduce((n, c) => Math.max(n, c.start + (c.out - c.in)), m), 0);
  if (end - cursor > 0.05) { segments.push({ type: 'gap', dur: r2(end - cursor), start: cursor }); cursor = end; }
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

// Forma del cuadro según el formato elegido. 'original' sigue la forma del primer video; los demás son fijos (lado corto 1080).
export const ASPECTS = { '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5], '16:9': [16, 9] };
export function formatSize(format, w, h, shortSide = 1080) {
  const a = ASPECTS[format && format.aspect];
  if (!a) return outputSize(w, h, shortSide);
  const k = shortSide / Math.min(a[0], a[1]);
  return { w: Math.round((a[0] * k) / 2) * 2, h: Math.round((a[1] * k) / 2) * 2 };
}
// Con formato 'original' el cuadro sigue al primer video: no se recorta (los demás clips se ven enteros). Con formato fijo manda `fit`.
export const effectiveFit = (format) => (!format || !ASPECTS[format.aspect] ? 'contain' : (format.fit === 'contain' ? 'contain' : 'cover'));
// Dónde dibujar un video de vw×vh dentro de W×H: 'contain' = entero con barras; 'cover' = rellena y recorta lo que sobra, centrado.
export function fitRect(vw, vh, W, H, fit) {
  const k = fit === 'cover' ? Math.max(W / vw, H / vh) : Math.min(W / vw, H / vh), w = vw * k, h = vh * k;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
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

// Ganancia del audio original de un clip: silenciado = 0; si no, su volumen (por defecto 1), limitado a 0–2.
export const clipGain = (c) => (c.muted ? 0 : Math.max(0, Math.min(2, typeof c.volume === 'number' && Number.isFinite(c.volume) ? c.volume : 1)));

// Pistas de audio aparte: cuándo arrancan. En el instante `t` del timeline, ¿debe sonar el clip de audio `c`? Devuelve dónde empezar dentro del medio y cuánto dura aún, o null.
export function audioStartAt(c, t) {
  const len = c.out - c.in, into = t - c.start;
  if (c.muted || into < -0.02 || into >= len - 0.03) return null;
  const k = Math.max(0, into);
  return { offset: c.in + k, dur: len - k };
}

// Dónde y de qué tamaño se dibuja un video superpuesto en un cuadro W×H (x,y = centro en 0..1; scale = ancho en 0..1 del cuadro; se respeta su forma).
export function overlayRect(c, W, H, vw, vh) {
  const w = c.scale * W, h = vw > 0 ? w * (vh / vw) : w;
  return { x: c.x * W - w / 2, y: c.y * H - h / 2, w, h };
}
// ¿Debe verse el clip superpuesto `c` en el instante t? Devuelve el tiempo dentro del medio original, o null.
export function overlayAt(c, t) {
  const into = t - c.start;
  return into >= 0 && into < c.out - c.in - 0.03 ? c.in + into : null;
}

// Efectos de entrada/salida de un clip de video: devuelve cuánto se ve (alpha), cuánto está desplazado (dx, en anchos del cuadro) y su escala en el instante t.
const ease = (p) => { const q = Math.max(0, Math.min(1, p)); return q * q * (3 - 2 * q); };
export function fxAt(c, t) {
  const o = { alpha: 1, dx: 0, scale: 1 }; if (!c || (!c.fxIn && !c.fxOut)) return o;
  const len = c.out - c.in, rel = t - c.start, d = Math.max(0.05, Math.min(typeof c.fxDur === 'number' ? c.fxDur : 0.5, len / 2));
  const apply = (kind, p, sign) => {
    if (!kind || kind === 'none' || p >= 1) return; const e = ease(p);
    if (kind === 'fade') o.alpha *= e; else if (kind === 'slide') o.dx += sign * (e - 1); else if (kind === 'zoom') { o.alpha *= e; o.scale *= 0.6 + 0.4 * e; }
  };
  apply(c.fxIn, rel / d, 1); apply(c.fxOut, (len - rel) / d, -1);
  return o;
}
const withFx = (r, fx, W) => { const w = r.w * fx.scale, h = r.h * fx.scale; return { x: r.x + (r.w - w) / 2 + fx.dx * W, y: r.y + (r.h - h) / 2, w, h }; };

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
export function drawFrame(g, W, H, video, project, t, overlays = []) {
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  if (video && video.videoWidth > 0) {
    const mc = project.clips.find((k) => t >= k.start && t < k.start + (k.out - k.in)), fx = fxAt(mc, t);
    const r = withFx(fitRect(video.videoWidth, video.videoHeight, W, H, effectiveFit(project.format)), fx, W);
    g.save(); g.globalAlpha = fx.alpha; try { g.drawImage(video, r.x, r.y, r.w, r.h); } catch { /* fotograma aún no listo */ } g.restore();
  }
  for (const o of overlays) {   // videos superpuestos: pista 1 abajo, las mayores encima
    const el = o.el; if (!el || !(el.videoWidth > 0)) continue;
    const fx = fxAt(o.c, t), r = withFx(overlayRect(o.c, W, H, el.videoWidth, el.videoHeight), fx, W);
    g.save(); g.globalAlpha = fx.alpha; try { g.drawImage(el, r.x, r.y, r.w, r.h); } catch { /* fotograma aún no listo */ } g.restore();
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
  if (!plan.segments.length) throw new Error('No hay clips para exportar.');
  if (typeof MediaRecorder === 'undefined') throw new Error('Este navegador no puede grabar video (falta MediaRecorder).');
  const first = (firstClip && media[firstClip.clip.asset_id]) || (project.overlayClips || []).map((c) => media[c.asset_id]).find(Boolean) || {};
  const { w: W, h: H } = formatSize(project.format, first.w, first.h);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');

  const ev = document.createElement('video');
  ev.playsInline = true; ev.setAttribute('playsinline', ''); ev.preload = 'auto';
  ev.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none';
  document.body.appendChild(ev);

  const AC = window.AudioContext || window.webkitAudioContext; let ac = null, dest = null, gainNode = null;
  const stream = canvas.captureStream(fps);
  try {
    ac = new AC(); await ac.resume().catch(() => {});
    dest = ac.createMediaStreamDestination(); gainNode = ac.createGain(); ac.createMediaElementSource(ev).connect(gainNode); gainNode.connect(dest);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  } catch { ac = null; /* sin audio: se avisa al final */ }
  const hasAudio = stream.getAudioTracks().length > 0;

  // Pistas de audio aparte (p. ej. el micrófono de una captura): se decodifican antes y se lanzan según el tiempo del timeline.
  const aClips = (project.audioClips || []).filter((c) => !c.muted && clipGain(c) > 0), buffers = new Map(), skippedAudio = [];
  if (ac && dest) {
    for (const c of aClips) {
      if (buffers.has(c.asset_id) || skippedAudio.includes(c.asset_id)) continue;
      const m = media[c.asset_id];
      try { if (!m) throw new Error('sin medio'); buffers.set(c.asset_id, await ac.decodeAudioData(await (await fetch(m.url)).arrayBuffer())); }
      catch { skippedAudio.push(c.asset_id); }
    }
  } else if (aClips.length) aClips.forEach((c) => skippedAudio.push(c.asset_id));
  // Videos superpuestos: un <video> oculto por clip, sincronizado con el tiempo del timeline; su audio se mezcla igual que el de las pistas.
  const oList = [], skippedOverlay = [];
  for (const c of (project.overlayClips || [])) {
    const m = media[c.asset_id]; if (!m) { skippedOverlay.push(c.id); continue; }
    const el = document.createElement('video'); el.playsInline = true; el.setAttribute('playsinline', ''); el.preload = 'auto'; el.src = m.url;
    el.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none'; document.body.appendChild(el);
    try {
      await Promise.race([once(el, 'loadedmetadata'), once(el, 'error').then(() => { throw new Error('no se pudo leer'); }), new Promise((_, no) => setTimeout(() => no(new Error('tardó demasiado')), 10000))]);
      if (ac && dest && !c.muted && clipGain(c) > 0) { const gn = ac.createGain(); gn.gain.value = clipGain(c); ac.createMediaElementSource(el).connect(gn); gn.connect(dest); } else el.muted = true;
      oList.push({ el, c });
    } catch { el.remove(); skippedOverlay.push(c.id); }
  }
  oList.sort((a, b) => a.c.track - b.c.track || a.c.start - b.c.start);
  const overlayTick = (t) => {
    const draw = [];
    for (const o of oList) {
      const want = overlayAt(o.c, t);
      if (want == null) { if (!o.el.paused) o.el.pause(); continue; }
      if (o.el.paused) { try { o.el.currentTime = want; } catch { /* aún no */ } o.el.play().catch(() => {}); }
      else if (Math.abs(o.el.currentTime - want) > 0.35) { try { o.el.currentTime = want; } catch { /* aún no */ } }
      draw.push(o);
    }
    return draw;
  };
  const started = new Set(), sources = [];
  const audioTick = (t) => {
    if (!ac || !dest) return;
    for (const c of aClips) {
      if (started.has(c.id) || !buffers.has(c.asset_id)) continue;
      const a = audioStartAt(c, t); if (!a) continue;
      started.add(c.id);
      const src = ac.createBufferSource(), gn = ac.createGain(); src.buffer = buffers.get(c.asset_id); gn.gain.value = clipGain(c);
      src.connect(gn); gn.connect(dest); try { src.start(0, a.offset, a.dur); sources.push(src); } catch { /* clip fuera del buffer */ }
    }
  };

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
          const tg = seg.start + (performance.now() - s) / 1000; audioTick(tg);
          drawFrame(g, W, H, null, project, tg, overlayTick(tg)); report(seg.start + (performance.now() - s) / 1000); await frame();
        }
        continue;
      }
      const c = seg.clip, m = media[c.asset_id]; if (!m) throw new Error('Falta el video original de un clip.');
      if (ev.dataset.src !== m.url) { ev.dataset.src = m.url; ev.src = m.url; await Promise.race([once(ev, 'loadedmetadata'), once(ev, 'error').then(() => { throw new Error('No se pudo leer un video para exportar.'); })]); }
      if (Math.abs(ev.currentTime - c.in) > 0.02) { ev.currentTime = c.in; await once(ev, 'seeked'); }
      if (gainNode) gainNode.gain.value = clipGain(c);
      await ev.play();
      await new Promise((res) => {
        const tick = () => {
          const cur = ev.currentTime, t = c.start + (cur - c.in);
          audioTick(t); drawFrame(g, W, H, ev, project, t, overlayTick(t)); report(t);
          if (isCancelled() || cur >= c.out - 0.03 || ev.ended) return res();
          requestAnimationFrame(tick);
        };
        tick();
      });
      ev.pause();
    }
    await frame(); await frame();
  } finally {
    sources.forEach((x) => { try { x.stop(); } catch { /* ya terminó */ } });
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    oList.forEach((o) => { try { o.el.pause(); } catch { /* nada */ } o.el.remove(); });
    ev.remove(); try { ac && ac.close(); } catch { /* nada */ }
  }
  if (cancelled || isCancelled()) return { cancelled: true };
  const type = rec.mimeType || mime || 'video/webm';
  return { blob: new Blob(chunks, { type }), mime: type, ext: extFor(type), w: W, h: H, seconds: r2((performance.now() - t0) / 1000), hasAudio, textBeyondEnd: plan.textBeyondEnd, skippedAudio, skippedOverlay };
}
