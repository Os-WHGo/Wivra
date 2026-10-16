// Wivra · exportación en el propio teléfono. Sin servidor y sin librerías: el navegador
// reproduce cada clip (con su audio), se dibuja en un canvas con los textos y se graba con MediaRecorder.
// Va en tiempo real (un video de 20 s tarda unos 20 s). Los originales no se tocan. — Claude
import { clipLength, speedOf, srcTime } from '../core/project.mjs';
import { TEXT_POS, TEXT_SIZES, TEXT_ZONES, textZoneOf, textStyleOf, groupTextsByPos } from '../core/text-style.mjs';

const r2 = (n) => Math.round(n * 100) / 100;

// Lista de pasos en orden: clips, y "huecos" negros si hay espacio entre clips.
export function exportPlan(project) {
  const clips = [...project.clips].sort((a, b) => a.start - b.start);
  const segments = []; let cursor = 0;
  for (const c of clips) {
    if (c.start - cursor > 0.05) segments.push({ type: 'gap', dur: r2(c.start - cursor), start: cursor });
    segments.push({ type: 'clip', clip: c, dur: r2(clipLength(c)) });
    cursor = Math.max(cursor, c.start + clipLength(c));
  }
  // El video termina donde terminan los clips y las capas de video. La música/audio que pasa de ahí se CORTA al exportar (con un fundido), no alarga el video con negro.
  const end = (project.overlayClips || []).reduce((n, c) => Math.max(n, c.start + clipLength(c)), 0);
  if (end - cursor > 0.05) { segments.push({ type: 'gap', dur: r2(end - cursor), start: cursor }); cursor = end; }
  const audioEnd = (project.audioClips || []).reduce((n, c) => Math.max(n, c.start + clipLength(c)), 0);
  if (!segments.length && audioEnd > 0) { segments.push({ type: 'gap', dur: r2(audioEnd), start: 0 }); cursor = audioEnd; }       // solo audio: se exporta tal cual
  const textEnd = project.texts.reduce((m, t) => Math.max(m, t.end), 0);
  return { segments, total: r2(Math.max(cursor, 0)), textBeyondEnd: textEnd > cursor + 0.05, audioCut: r2(Math.max(0, audioEnd - cursor)) };
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
  const len = clipLength(c), s = speedOf(c), into = t - c.start;
  if (c.muted || into < -0.02 || into >= len - 0.03) return null;
  const k = Math.max(0, into);
  return { offset: c.in + k * s, dur: (len - k) * s, rate: s };      // offset y dur en segundos del MEDIO; rate = velocidad de reproducción
}

// Formas de recorte para un video superpuesto: caminos SVG en un cuadrado de 0 a 1. Las que no son rectangulares usan un cuadro cuadrado.
const f4 = (n) => (Math.round(n * 1e4) / 1e4).toString();
const polar = (n, rf) => { let d = ''; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 - Math.PI / 2, r = rf(a); d += `${i ? 'L' : 'M'}${f4(0.5 + r * Math.cos(a))} ${f4(0.5 + r * Math.sin(a))} `; } return d + 'Z'; };
const starPath = () => polar(10, (() => { let i = -1; return () => (++i % 2 ? 0.2 : 0.5); })());
// Borde rasgado: un cuadrado con los lados en dientes de sierra irregulares (determinista).
const tornPath = () => { const pts = [], N = 14, j = (i) => 0.012 + 0.03 * Math.abs(Math.sin(i * 12.9898) * 0.5 + Math.sin(i * 7.233 + 1.3) * 0.5); let k = 0;
  for (let i = 0; i <= N; i++) pts.push([i / N, j(k++)]); for (let i = 1; i <= N; i++) pts.push([1 - j(k++), i / N]); for (let i = 1; i <= N; i++) pts.push([1 - i / N, 1 - j(k++)]); for (let i = 1; i < N; i++) pts.push([j(k++), 1 - i / N]);
  return pts.map((q, i) => `${i ? 'L' : 'M'}${f4(q[0])} ${f4(q[1])}`).join(' ') + ' Z'; };
export const SHAPE_PATHS = {
  rounded: 'M0.12 0 H0.88 Q1 0 1 0.12 V0.88 Q1 1 0.88 1 H0.12 Q0 1 0 0.88 V0.12 Q0 0 0.12 0 Z',
  square: 'M0 0 H1 V1 H0 Z',
  squircle: 'M0.2 0 H0.8 C0.95 0 1 0.05 1 0.2 V0.8 C1 0.95 0.95 1 0.8 1 H0.2 C0.05 1 0 0.95 0 0.8 V0.2 C0 0.05 0.05 0 0.2 0 Z',
  circle: 'M0.5 0 A0.5 0.5 0 1 1 0.5 1 A0.5 0.5 0 1 1 0.5 0 Z',
  oval: 'M0.5 0 A0.5 0.5 0 1 1 0.5 1 A0.5 0.5 0 1 1 0.5 0 Z',
  heart: 'M0.5 0.95 C0.1 0.65 0 0.45 0 0.28 C0 0.12 0.12 0.02 0.27 0.02 C0.38 0.02 0.46 0.08 0.5 0.18 C0.54 0.08 0.62 0.02 0.73 0.02 C0.88 0.02 1 0.12 1 0.28 C1 0.45 0.9 0.65 0.5 0.95 Z',
  star: starPath(),
  diamond: 'M0.5 0 L1 0.5 L0.5 1 L0 0.5 Z',
  triangle: 'M0.5 0.02 L1 0.95 L0 0.95 Z',
  hexagon: 'M0.25 0.04 L0.75 0.04 L1 0.5 L0.75 0.96 L0.25 0.96 L0 0.5 Z',
  cloud: 'M0.24 0.82 C0.06 0.82 0 0.6 0.14 0.5 C0.06 0.32 0.26 0.2 0.38 0.3 C0.44 0.1 0.72 0.08 0.78 0.28 C0.96 0.24 1 0.5 0.88 0.58 C1 0.72 0.88 0.86 0.74 0.8 C0.66 0.92 0.46 0.92 0.4 0.82 C0.34 0.88 0.28 0.86 0.24 0.82 Z',
  blob: polar(72, (a) => 0.4 + 0.07 * Math.sin(3 * a + 1) + 0.045 * Math.sin(5 * a + 2) + 0.025 * Math.sin(7 * a)),
  splat: polar(96, (a) => 0.3 + 0.12 * Math.abs(Math.sin(4.5 * a + 0.5)) ** 0.6 + 0.08 * Math.max(0, Math.sin(11 * a + 1)) + 0.04 * Math.sin(2 * a)),
  flower: polar(120, (a) => 0.37 + 0.11 * Math.cos(6 * a)),
  bubble: 'M0.1 0.05 H0.9 Q0.98 0.05 0.98 0.13 V0.62 Q0.98 0.7 0.9 0.7 H0.55 L0.3 0.95 L0.35 0.7 H0.1 Q0.02 0.7 0.02 0.62 V0.13 Q0.02 0.05 0.1 0.05 Z',
  torn: tornPath(),
};
export const SHAPE_NAMES = { none: 'Normal', rounded: 'Redondeado', square: 'Cuadrado', squircle: 'Cuadrado suave', circle: 'Círculo', oval: 'Óvalo', heart: 'Corazón', star: 'Estrella', diamond: 'Rombo', triangle: 'Triángulo', hexagon: 'Hexágono', cloud: 'Nube', blob: 'Mancha', splat: 'Salpicadura', flower: 'Flor', bubble: 'Globo', torn: 'Rasgado' };
const SQUARE_SHAPES = ['square', 'squircle', 'circle', 'heart', 'star', 'diamond', 'triangle', 'hexagon', 'cloud', 'blob', 'splat', 'flower', 'bubble', 'torn'];
// Alto/ancho del cuadro de un superpuesto: con forma cuadrada es 1; si no, la forma del video.
export const overlayAr = (c, vw, vh) => (SQUARE_SHAPES.includes(c.shape) ? 1 : (vw > 0 && vh > 0 ? vh / vw : 16 / 9));
// Dónde y de qué tamaño se dibuja un video superpuesto en un cuadro W×H (x,y = centro en 0..1; scale = ancho en 0..1 del cuadro).
export function overlayRect(c, W, H, vw, vh) {
  const w = c.scale * W, h = w * overlayAr(c, vw, vh);
  return { x: c.x * W - w / 2, y: c.y * H - h / 2, w, h };
}
// Dónde va el video (vw×vh) dentro de su cuadro bw×bh: rellena el cuadro (recorta lo que sobra), se mueve con px/py (0..1, 0.5 = centro) y se amplía con zoom desde el centro.
export function contentRect(bw, bh, vw, vh, zoom = 1, px = 0.5, py = 0.5) {
  // Contenido que cubre la ventana (bw×bh), ampliado `zoom` veces; px/py (0..1) deciden qué parte se ve (0 = borde izquierdo/superior, 1 = derecho/inferior).
  const k = Math.max(bw / vw, bh / vh), w = vw * k * zoom, h = vh * k * zoom;
  return { x: (bw - w) * px, y: (bh - h) * py, w, h };
}
/** Inverso de contentRect: dado el rectángulo que debe ocupar el contenido (abs, en el mismo sistema que la ventana win={left,top,w,h}), devuelve {zoom, px, py} válidos (zoom 1..4, el contenido siempre cubre la ventana). */
export function solveContent(win, abs, vw, vh) {
  const k = Math.max(win.w / vw, win.h / vh), w0 = vw * k, h0 = vh * k, cl = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const zoom = cl(abs.W / w0, 1, 4), Wc = w0 * zoom, Hc = h0 * zoom, dx = win.w - Wc, dy = win.h - Hc;
  return { zoom, px: dx < -1e-6 ? cl((abs.X - win.left) / dx, 0, 1) : 0.5, py: dy < -1e-6 ? cl((abs.Y - win.top) / dy, 0, 1) : 0.5 };
}
// Dibuja el video superpuesto `el` en el cuadro r (ya con efectos), recortado por su forma y con su marco (borde) si lo tiene.
// Una imagen (logo, foto, GIF) se usa como capa con la misma interfaz mínima que un <video>: el resto del código no distingue.
export function imageEl(img) {
  Object.defineProperties(img, { paused: { value: true }, currentTime: { get: () => 0, set: () => {} }, videoWidth: { get: () => img.naturalWidth }, videoHeight: { get: () => img.naturalHeight } });
  img.pause = () => {}; img.play = () => Promise.resolve(); return img;
}
export function drawOverlay(g, el, c, r, t = 0) {
  const vw = el.videoWidth || el.naturalWidth, vh = el.videoHeight || el.naturalHeight, cr = contentRect(r.w, r.h, vw, vh, c.zoom || 1, c.px ?? 0.5, c.py ?? 0.5), d = SHAPE_PATHS[c.shape];
  g.save();
  g.translate(r.x, r.y);
  if (d) { g.scale(r.w, r.h); g.clip(new Path2D(d)); g.scale(1 / r.w, 1 / r.h); } else { g.beginPath(); g.rect(0, 0, r.w, r.h); g.clip(); }
  const src = (c.filter && globalThis.fxRender && globalThis.fxRender(el, c.filter, t, Math.max(r.w, r.h) * 1.5)) || el;      // sin bajar la resolución: el filtro se calcula al tamaño con que se dibuja (+50 % para zoom)
  try { g.drawImage(src, cr.x, cr.y, cr.w, cr.h); } catch { /* fotograma aún no listo */ }
  if (c.frame > 0) {       // el marco se dibuja por dentro del recorte: el grosor visible es `frame` × ancho
    g.strokeStyle = c.frameColor || '#ffffff'; g.lineWidth = 2 * c.frame * r.w; g.lineJoin = 'round';
    const p2 = new Path2D(); p2.addPath(new Path2D(d || 'M0 0H1V1H0Z'), new DOMMatrix([r.w, 0, 0, r.h, 0, 0])); g.stroke(p2);
  }
  g.restore();
}
// ¿Debe verse el clip superpuesto `c` en el instante t? Devuelve el tiempo dentro del medio original, o null.
export function overlayAt(c, t) {
  const into = t - c.start;
  return into >= 0 && into < clipLength(c) - 0.03 ? c.in + into * speedOf(c) : null;
}

// Efectos de entrada/salida de un clip de video: devuelve cuánto se ve (alpha), cuánto está desplazado (dx, en anchos del cuadro) y su escala en el instante t.
const ease = (p) => { const q = Math.max(0, Math.min(1, p)); return q * q * (3 - 2 * q); };
export function fxAt(c, t) {
  const o = { alpha: 1, dx: 0, scale: 1 }; if (!c || (!c.fxIn && !c.fxOut)) return o;
  const len = clipLength(c), rel = t - c.start, d = Math.max(0.05, Math.min(typeof c.fxDur === 'number' ? c.fxDur : 0.5, len / 2));
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
    const mc = project.clips.find((k) => t >= k.start && t < k.start + clipLength(k)), fx = fxAt(mc, t);
    const r = withFx(fitRect(video.videoWidth, video.videoHeight, W, H, effectiveFit(project.format)), fx, W);
    const src = (mc && mc.filter && globalThis.fxRender && globalThis.fxRender(video, mc.filter, t, Math.max(W, H))) || video;   // filtro de color en la tarjeta gráfica
    g.save(); g.globalAlpha = fx.alpha; try { g.drawImage(src, r.x, r.y, r.w, r.h); } catch { /* fotograma aún no listo */ } g.restore();
  }
  for (const o of overlays) {   // videos superpuestos: pista 1 abajo, las mayores encima
    const el = o.el; if (!el || !(el.videoWidth > 0)) continue;
    const fx = fxAt(o.c, t), r = withFx(overlayRect(o.c, W, H, el.videoWidth, el.videoHeight), fx, W);
    g.save(); g.globalAlpha = fx.alpha * (typeof o.c.opacity === 'number' ? o.c.opacity : 1); drawOverlay(g, el, o.c, r, t); g.restore();
  }
  drawTexts(g, textsAt(project, t), W, H, textZoneOf(project.format));
}

/**
 * Dibuja los textos del instante: arriba, al centro o abajo, con su tamaño, color y (si tiene) caja de fondo. Misma regla que la vista previa (app/template.html).
 * Dentro de una posición los textos se apilan en el orden en que se crearon; abajo, el último queda más abajo y todo crece hacia arriba. — Claude
 */
export function drawTexts(g, list, W, H, zone = TEXT_ZONES.normal) {
  if (!list.length) return;
  const base = Math.min(W, H) * 0.06, groups = groupTextsByPos(list);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  for (const pos of TEXT_POS) {
    const blocks = groups[pos].map((tx) => {
      const st = textStyleOf(tx), size = Math.round(base * TEXT_SIZES[st.size]), lineH = size * 1.2, pad = st.box === 'none' ? 0 : size * 0.28;
      g.font = `800 ${size}px -apple-system, system-ui, sans-serif`;
      const lines = wrapLines(tx.text, W * zone.width - pad * 2, (x) => g.measureText(x).width), tw = Math.max(...lines.map((l) => g.measureText(l).width));
      return { st, size, lineH, pad, lines, tw, h: lines.length * lineH + pad * 2 };
    });
    if (!blocks.length) continue;
    const gap = base * 0.3, total = blocks.reduce((a, b) => a + b.h, 0) + gap * (blocks.length - 1);
    const cx = W * (zone.left + (1 - zone.right)) / 2;      // centro horizontal de la zona
    let y = pos === 'top' ? H * zone.top : pos === 'middle' ? H * zone.mid - total / 2 : H * zone.bottom - total;
    for (const b of blocks) {
      g.font = `800 ${b.size}px -apple-system, system-ui, sans-serif`;
      if (b.st.box !== 'none') {
        const bw = b.tw + b.pad * 2, bx = cx - bw / 2, r = b.size * 0.3;
        g.fillStyle = b.st.box; g.beginPath();
        if (g.roundRect) g.roundRect(bx, y, bw, b.h, r); else g.rect(bx, y, bw, b.h);
        g.fill();
      } else { g.lineWidth = Math.max(2, b.size / 6); g.strokeStyle = 'rgba(0,0,0,.85)'; }
      g.fillStyle = b.st.color;
      b.lines.forEach((line, i) => { const ly = y + b.pad + (i + 0.5) * b.lineH; if (b.st.box === 'none') g.strokeText(line, cx, ly); g.fillText(line, cx, ly); });
      y += b.h + gap;
    }
  }
}

const once = (el, ev) => new Promise((res) => el.addEventListener(ev, res, { once: true }));
const frame = () => new Promise((res) => requestAnimationFrame(res));
/** Bits por segundo de la exportación: 8 Mbps hasta 2 min; en videos más largos baja (mín. 3 Mbps) para que el archivo en memoria no pase de ~120 MB. */
export const EXPORT_BPS = 8_000_000, EXPORT_FULL_SECONDS = 120, EXPORT_MIN_BPS = 3_000_000;
export const exportBitrate = (seconds) => Math.round(Math.max(EXPORT_MIN_BPS, Math.min(EXPORT_BPS, EXPORT_BPS * EXPORT_FULL_SECONDS / Math.max(1, seconds || 0))));
export const exportSizeMB = (seconds) => Math.max(1, Math.round(exportBitrate(seconds) * Math.max(0, seconds || 0) / 8 / 1e6));
/** Espera un evento con tiempo límite. Si se cancela mientras espera, termina (antes un video que no cargaba dejaba la exportación sin poder cancelarse). */
export function waitEvent(el, ev, { ms = 15000, isCancelled = () => false, what = 'Un video' } = {}) {
  return new Promise((res, rej) => {
    let done = false, timer = 0, poll = 0;
    const fin = (f, v) => { if (done) return; done = true; clearTimeout(timer); clearInterval(poll); el.removeEventListener(ev, onEv); el.removeEventListener('error', onErr); f(v); };
    const onEv = () => fin(res), onErr = () => fin(rej, new Error(`No se pudo leer ${what.toLowerCase()} para exportar.`));
    el.addEventListener(ev, onEv); el.addEventListener('error', onErr);
    timer = setTimeout(() => fin(rej, new Error(`${what} tardó demasiado en responder (más de ${Math.round(ms / 1000)} s).`)), ms);
    poll = setInterval(() => { if (isCancelled()) fin(res); }, 200);
  });
}
export const STALL_SECONDS = 8;      // un video que no avanza durante tanto tiempo = exportación trabada

// Graba el proyecto. `media[id]` = { url, w, h }. Devuelve { blob, mime, ext, w, h, seconds }.
export async function recordProject({ project, media, onProgress = () => {}, isCancelled = () => false, fps = 30, loudnessGainDb = 0 }) {
  const plan = exportPlan(project);
  const firstClip = plan.segments.find((s) => s.type === 'clip');
  if (!plan.segments.length) throw new Error('No hay clips para exportar.');
  if (typeof MediaRecorder === 'undefined') throw new Error('Este navegador no puede grabar video (falta MediaRecorder).');
  const firstVideo = plan.segments.find((s) => s.type === 'clip' && media[s.clip.asset_id] && media[s.clip.asset_id].kind !== 'image');   // el cuadro 'original' sigue al primer VIDEO, no a una foto
  const first = (firstVideo && media[firstVideo.clip.asset_id]) || (firstClip && media[firstClip.clip.asset_id]) || (project.overlayClips || []).map((c) => media[c.asset_id]).find((m) => m && m.kind !== 'image') || {};
  const { w: W, h: H } = formatSize(project.format, first.w, first.h);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');

  const ev = document.createElement('video');
  ev.playsInline = true; ev.setAttribute('playsinline', ''); ev.preload = 'auto';
  ev.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none';
  document.body.appendChild(ev);

  const AC = window.AudioContext || window.webkitAudioContext; let ac = null, dest = null, gainNode = null, bus = null;
  const stream = canvas.captureStream(fps);
  try {
    ac = new AC(); await ac.resume().catch(() => {});
    dest = ac.createMediaStreamDestination(); bus = dest;
    // Volumen parejo (opcional): una sola ganancia fija sobre toda la mezcla, medida antes de grabar (app/loudness.mjs). Sin compresor ni limitador.
    if (Number.isFinite(loudnessGainDb) && Math.abs(loudnessGainDb) >= 0.05) { const master = ac.createGain(); master.gain.value = 10 ** (Math.max(-12, Math.min(12, loudnessGainDb)) / 20); master.connect(dest); bus = master; }
    gainNode = ac.createGain(); ac.createMediaElementSource(ev).connect(gainNode); gainNode.connect(bus);
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
    if (m.kind === 'image') {      // logo/foto/GIF: sin audio ni tiempo propio; el GIF se anima solo al dibujarlo
      if (m.gif) { oList.push({ el: m.makeEl(), c }); continue; }     // GIF animado: lo dibuja el lector propio, fotograma exacto por instante
      const im = imageEl(new Image()); im.src = m.url; im.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none'; document.body.appendChild(im);
      try { await im.decode(); oList.push({ el: im, c }); } catch { im.remove(); skippedOverlay.push(c.id); }
      continue;
    }
    const el = document.createElement('video'); el.playsInline = true; el.setAttribute('playsinline', ''); el.preload = 'auto'; el.src = m.url;
    el.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none'; document.body.appendChild(el);
    try {
      await Promise.race([once(el, 'loadedmetadata'), once(el, 'error').then(() => { throw new Error('no se pudo leer'); }), new Promise((_, no) => setTimeout(() => no(new Error('tardó demasiado')), 10000))]);
      if (ac && dest && !c.muted && clipGain(c) > 0) { const gn = ac.createGain(); gn.gain.value = clipGain(c); ac.createMediaElementSource(el).connect(gn); gn.connect(bus); } else el.muted = true;
      oList.push({ el, c });
    } catch { el.remove(); skippedOverlay.push(c.id); }
  }
  oList.sort((a, b) => a.c.track - b.c.track || a.c.start - b.c.start);
  const overlayTick = (t) => {
    const draw = [];
    for (const o of oList) {
      const want = overlayAt(o.c, t);
      if (want == null) { if (!o.el.paused) o.el.pause(); continue; }
      try { o.el.playbackRate = speedOf(o.c); } catch { /* velocidad no admitida */ }
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
      const src = ac.createBufferSource(), gn = ac.createGain(); src.buffer = buffers.get(c.asset_id); src.playbackRate.value = a.rate; gn.gain.value = clipGain(c);
      const over = c.start + clipLength(c) - plan.total;      // lo que pasa del final del video se corta con un fundido de 0,8 s
      if (over > 0.02) { const endAt = ac.currentTime + Math.max(0, plan.total - t), f = Math.min(0.8, Math.max(0.05, plan.total - t)), g0 = clipGain(c); gn.gain.setValueAtTime(g0, Math.max(ac.currentTime, endAt - f)); gn.gain.linearRampToValueAtTime(0, endAt); }
      src.connect(gn); gn.connect(bus); try { src.start(0, a.offset, a.dur); sources.push(src); } catch { /* clip fuera del buffer */ }
    }
  };

  const mime = pickMime((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: exportBitrate(plan.total) } : { videoBitsPerSecond: exportBitrate(plan.total) });
  const chunks = []; rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => { rec.onstop = res; });
  // Fotos de la línea principal: un elemento por medio (se reutiliza si la misma foto sale varias veces). Un GIF se anima solo con su propio lector.
  const photos = new Map();
  const photoEl = async (id, m) => {
    if (photos.has(id)) return photos.get(id);
    let el = null;
    if (m.gif) el = m.makeEl();
    else {
      const im = imageEl(new Image()); im.src = m.url; im.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.01;pointer-events:none'; document.body.appendChild(im);
      try { await im.decode(); el = im; } catch { im.remove(); }
    }
    photos.set(id, el); return el;
  };
  // Si la app pasa a segundo plano (cambio de app, pantalla apagada) el navegador congela el video y el dibujo: el archivo saldría con imagen congelada. Se detiene y se avisa.
  let interrupted = false, recError = null; const onVis = () => { if (document.hidden) interrupted = true; }; document.addEventListener('visibilitychange', onVis);
  const stopNow = () => isCancelled() || interrupted;
  rec.onerror = (e) => { recError = (e && e.error) || new Error('error de grabación'); };
  const t0 = performance.now(); let cancelled = false;
  const report = (t) => onProgress({ t: Math.min(t, plan.total), total: plan.total, pct: plan.total ? Math.min(1, t / plan.total) : 1 });

  try {
    rec.start(1000);
    for (const seg of plan.segments) {
      if (stopNow()) { cancelled = true; break; }
      if (seg.type === 'gap') {
        const s = performance.now();
        while (performance.now() - s < seg.dur * 1000 && !stopNow()) {
          const tg = seg.start + (performance.now() - s) / 1000; audioTick(tg);
          drawFrame(g, W, H, null, project, tg, overlayTick(tg)); report(seg.start + (performance.now() - s) / 1000); await frame();
        }
        continue;
      }
      const c = seg.clip, m = media[c.asset_id]; if (!m) throw new Error('Falta el video original de un clip.');
      if (m.kind === 'image') {      // foto (o GIF) en la línea principal: sin audio propio; se dibuja durante `dur` s con el mismo reloj que los huecos
        const el = await photoEl(c.asset_id, m);
        if (!el) throw new Error(`No se pudo abrir la foto «${m.name || c.asset_id}» para exportar.`);
        if (typeof el.currentTime === 'number' && m.gif) { try { el.currentTime = c.in; } catch { /* aún no */ } }
        const s = performance.now();
        while (!stopNow()) {
          const dt = (performance.now() - s) / 1000; if (dt >= seg.dur) break;
          const tp = c.start + dt; audioTick(tp); drawFrame(g, W, H, el, project, tp, overlayTick(tp)); report(tp); await frame();
        }
        continue;
      }
      if (ev.dataset.src !== m.url) { ev.dataset.src = m.url; ev.src = m.url; await waitEvent(ev, 'loadedmetadata', { isCancelled: stopNow, what: 'Un video' }); if (stopNow()) { cancelled = true; break; } }
      if (Math.abs(ev.currentTime - c.in) > 0.02) { ev.currentTime = c.in; await waitEvent(ev, 'seeked', { isCancelled: stopNow, what: 'Un video' }); if (stopNow()) { cancelled = true; break; } }
      if (gainNode) gainNode.gain.value = clipGain(c);
      const spd = speedOf(c); try { ev.playbackRate = spd; } catch { /* velocidad no admitida */ }
      try { await ev.play(); } catch { throw new Error('El navegador no dejó reproducir un video para exportar.'); }
      await new Promise((res, rej) => {
        let last = -1, since = performance.now();
        const tick = () => {
          const cur = ev.currentTime, t = c.start + (cur - c.in) / spd;
          audioTick(t); drawFrame(g, W, H, ev, project, t, overlayTick(t)); report(t);
          if (stopNow() || cur >= c.out - 0.03 || ev.ended) return res();
          if (cur !== last) { last = cur; since = performance.now(); }
          else if (performance.now() - since > STALL_SECONDS * 1000) return rej(new Error(`El video se trabó y no avanzó durante ${STALL_SECONDS} s. Prueba de nuevo o con menos clips.`));
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
    photos.forEach((el) => { try { el && el.remove && el.remove(); } catch { /* nada */ } });
    ev.remove(); try { ac && ac.close(); } catch { /* nada */ }
    document.removeEventListener('visibilitychange', onVis);
  }
  if (interrupted) return { interrupted: true };
  if (cancelled || isCancelled()) return { cancelled: true };
  if (recError) throw new Error('La grabación falló (' + (recError.name || recError.message || 'error') + '). Puede que el teléfono no tenga memoria o espacio libre.');
  const type = rec.mimeType || mime || 'video/webm', blob = new Blob(chunks, { type });
  if (blob.size < 1000) throw new Error('No se grabó nada. Prueba de nuevo.');
  return { blob, mime: type, ext: extFor(type), w: W, h: H, seconds: r2((performance.now() - t0) / 1000), hasAudio, textBeyondEnd: plan.textBeyondEnd, skippedAudio, skippedOverlay };
}
