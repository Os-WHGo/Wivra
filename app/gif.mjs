// Wivra · GIF animado: lector propio (sin dependencias) para poder dibujar el fotograma exacto de cada instante, en la vista previa y al exportar.
// Los navegadores no dejan elegir el fotograma de un <img> GIF, y Safari/Chrome lo congelan al copiarlo a un canvas. — Claude
// decodeGif(bytes) → { w, h, frames:[{ delay (s), rgba:Uint8ClampedArray(w*h*4) }] } (cada fotograma ya compuesto). Lanza Error si no es un GIF válido.
export function decodeGif(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let p = 0;
  const u16 = () => { const v = b[p] | (b[p + 1] << 8); p += 2; return v; };
  if (b.length < 13 || String.fromCharCode(...b.subarray(0, 4)) !== 'GIF8') throw new Error('No es un GIF');
  p = 6; const W = u16(), H = u16(), pk = b[p++]; p += 2;
  if (!W || !H || W * H > 4096 * 4096) throw new Error('GIF con tamaño imposible');
  let gct = null; if (pk & 0x80) { const n = 3 * (2 << (pk & 7)); gct = b.subarray(p, p + n); p += n; }
  const cv = new Uint8ClampedArray(W * H * 4), frames = []; let gce = null, prev = null;
  const skipSub = () => { while (p < b.length && b[p]) p += b[p] + 1; p++; };
  while (p < b.length) {
    const t = b[p++];
    if (t === 0x3b) break;
    if (t === 0x21) { const l = b[p++]; if (l === 0xf9 && b[p] >= 4) { const f = b[p + 1]; gce = { disp: (f >> 2) & 7, tr: f & 1 ? b[p + 4] : -1, delay: (b[p + 2] | (b[p + 3] << 8)) / 100 }; } skipSub(); continue; }
    if (t !== 0x2c) throw new Error('GIF dañado');
    const fx = u16(), fy = u16(), fw = u16(), fh = u16(), fp = b[p++];
    if (fx + fw > W || fy + fh > H) throw new Error('GIF dañado (fotograma fuera del cuadro)');
    let pal = gct; if (fp & 0x80) { const n = 3 * (2 << (fp & 7)); pal = b.subarray(p, p + n); p += n; }
    if (!pal) throw new Error('GIF sin paleta');
    const mcs = b[p++]; if (mcs < 1 || mcs > 11) throw new Error('GIF dañado (LZW)');
    const data = []; while (p < b.length && b[p]) { for (let i = 1; i <= b[p]; i++) data.push(b[p + i]); p += b[p] + 1; } p++;
    // LZW
    const clear = 1 << mcs, eoi = clear + 1, out = new Uint8Array(fw * fh); let size = mcs + 1, next = eoi + 1, op = 0, old = -1, acc = 0, nb = 0, di = 0;
    const pre = new Int32Array(4096), suf = new Uint8Array(4096), stk = new Uint8Array(4097);
    for (let i = 0; i < clear; i++) suf[i] = i;
    while (op < out.length) {
      while (nb < size && di < data.length) { acc |= data[di++] << nb; nb += 8; }
      if (nb < size) break;
      const code = acc & ((1 << size) - 1); acc >>>= size; nb -= size;
      if (code === clear) { size = mcs + 1; next = eoi + 1; old = -1; continue; }
      if (code === eoi) break;
      let sp = 0, c = code;
      if (old === -1) { out[op++] = suf[code]; old = code; continue; }
      if (code >= next) { if (code > next) throw new Error('GIF dañado (LZW)'); stk[sp++] = 0; c = old; }   // se corrige abajo
      while (c >= clear) { stk[sp++] = suf[c]; c = pre[c]; }
      const first = suf[c]; stk[sp++] = first; if (code >= next) stk[0] = first;
      while (sp > 0 && op < out.length) out[op++] = stk[--sp];
      if (next < 4096) { pre[next] = old; suf[next] = first; next++; if (next === (1 << size) && size < 12) size++; }
      old = code;
    }
    const g = gce || { disp: 0, tr: -1, delay: 0.1 }; gce = null;
    if (g.disp === 3) prev = cv.slice();
    const rows = []; if (fp & 0x40) { for (const [s, st] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = s; y < fh; y += st) rows.push(y); } else for (let y = 0; y < fh; y++) rows.push(y);
    for (let i = 0; i < fh; i++) for (let x = 0; x < fw; x++) {
      const ci = out[i * fw + x]; if (ci === g.tr) continue; const o = ((fy + rows[i]) * W + fx + x) * 4;
      cv[o] = pal[ci * 3]; cv[o + 1] = pal[ci * 3 + 1]; cv[o + 2] = pal[ci * 3 + 2]; cv[o + 3] = 255;
    }
    frames.push({ delay: g.delay > 0.01 ? g.delay : 0.1, rgba: cv.slice() });
    if (g.disp === 2) { for (let y = fy; y < fy + fh; y++) cv.fill(0, (y * W + fx) * 4, (y * W + fx + fw) * 4); }
    else if (g.disp === 3 && prev) cv.set(prev);
    if (frames.length > 2000) throw new Error('GIF demasiado largo');
  }
  if (!frames.length) throw new Error('GIF sin fotogramas');
  return { w: W, h: H, frames };
}
/** Índice del fotograma que se ve en el instante t (el GIF se repite). */
export function gifFrameAt(gif, t) {
  const total = gif.frames.reduce((n, f) => n + f.delay, 0); if (!(total > 0) || !(t >= 0)) return 0;
  let r = t % total; for (let i = 0; i < gif.frames.length; i++) { if (r < gif.frames[i].delay) return i; r -= gif.frames[i].delay; }
  return gif.frames.length - 1;
}
/** Elemento <canvas> que se comporta como un video: `currentTime = t` dibuja el fotograma de ese instante. Solo en el navegador. */
export function gifCanvasEl(gif) {
  const cv = document.createElement('canvas'); cv.width = gif.w; cv.height = gif.h; const g = cv.getContext('2d');
  const bmp = gif.frames.map((f) => { const c = document.createElement('canvas'); c.width = gif.w; c.height = gif.h; c.getContext('2d').putImageData(new ImageData(f.rgba, gif.w, gif.h), 0, 0); return c; });
  let cur = -1, ct = 0;
  const show = (t) => { const i = gifFrameAt(gif, t); if (i === cur) return; cur = i; g.clearRect(0, 0, gif.w, gif.h); g.drawImage(bmp[i], 0, 0); };
  show(0);
  Object.defineProperties(cv, { paused: { value: true }, currentTime: { get: () => ct, set: (t) => { ct = t; show(t); } }, videoWidth: { get: () => gif.w }, videoHeight: { get: () => gif.h } });
  cv.pause = () => {}; cv.play = () => Promise.resolve(); return cv;
}
