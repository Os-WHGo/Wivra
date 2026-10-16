// Wivra · filtros de color en la tarjeta gráfica (WebGL). Un solo contexto compartido: se dibuja el fotograma con el filtro y se copia donde haga falta.
// Misma fórmula que filterRGB() de core/filters.mjs; el grano usa un ruido que cambia 24 veces por segundo (igual en vista previa y exportación). — Claude
// Solo navegador. Si WebGL no está disponible, fxRender devuelve null y el clip se ve sin filtro.
let fxS = null, fxDead = false;
const FX_VS = 'attribute vec2 p; varying vec2 uv; void main(){ uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }';
const FX_FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 uv; uniform sampler2D tex; uniform vec2 res;
uniform float B, C, S, Sep, W, Fd, V, G, seed;
void main(){
  vec4 px = texture2D(tex, uv); vec3 c = px.rgb;
  c += B * 0.3;
  float cf = C >= 0.0 ? 1.0 + C : 1.0 + C * 0.8; c = (c - 0.5) * cf + 0.5;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = vec3(l) + (c - vec3(l)) * (1.0 + S);
  if (Sep > 0.0) { vec3 sp = vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131))); c += (sp - c) * Sep; }
  c += vec3(W * 0.08, W * 0.02, -W * 0.08);
  c = c * (1.0 - 0.18 * Fd) + 0.12 * Fd;
  if (V > 0.0) { float d = distance(uv, vec2(0.5)) * 1.4142; float t = clamp((d - 0.35) / 0.65, 0.0, 1.0); c *= 1.0 - V * (t * t * (3.0 - 2.0 * t)) * 0.8; }
  if (G > 0.0) { float n = fract(sin(dot(floor(uv * res) + seed, vec2(12.9898, 78.233))) * 43758.5453) - 0.5; float lm = dot(c, vec3(0.2126, 0.7152, 0.0722)); c += n * G * 0.35 * (1.0 - 0.6 * abs(lm * 2.0 - 1.0)); }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), px.a);
}`;
function fxInit() {
  if (fxS) return fxS; if (fxDead || typeof document === 'undefined') return null;
  try {
    const cv = document.createElement('canvas'), gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!gl) { fxDead = true; return null; }
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, FX_VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FX_FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    const u = {}; for (const n of ['res', 'B', 'C', 'S', 'Sep', 'W', 'Fd', 'V', 'G', 'seed']) u[n] = gl.getUniformLocation(pr, n);
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); fxS = null; });
    return (fxS = { cv, gl, u });
  } catch { fxDead = true; return null; }
}
const fxDims = (s) => s.videoWidth ? [s.videoWidth, s.videoHeight] : s.naturalWidth ? [s.naturalWidth, s.naturalHeight] : [s.width || 0, s.height || 0];
/** Dibuja `src` (video, imagen o canvas) con el filtro `f` en el instante `t` (s). → canvas compartido (úsalo enseguida: el siguiente fxRender lo reemplaza), o null si no se puede. */
function fxRender(src, f, t) {
  const S = fxInit(); if (!S || !src) return null;
  const [w0, h0] = fxDims(src); if (!(w0 > 0 && h0 > 0)) return null;
  const k = Math.min(1, 1280 / Math.max(w0, h0)), w = Math.max(2, Math.round(w0 * k)), h = Math.max(2, Math.round(h0 * k)), { cv, gl, u } = S;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); } catch { return null; }
  const F = (n) => (f && f[n]) || 0;
  gl.viewport(0, 0, w, h); gl.uniform2f(u.res, w, h);
  gl.uniform1f(u.B, F('brightness')); gl.uniform1f(u.C, F('contrast')); gl.uniform1f(u.S, F('saturation')); gl.uniform1f(u.Sep, F('sepia'));
  gl.uniform1f(u.W, F('warmth')); gl.uniform1f(u.Fd, F('fade')); gl.uniform1f(u.V, F('vignette')); gl.uniform1f(u.G, F('grain'));
  gl.uniform1f(u.seed, (Math.floor((t || 0) * 24) % 997) * 0.37);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return cv;
}
