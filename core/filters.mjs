// Filtros de color de Wivra (fórmulas propias, sin código de otras apps). Puro y sin dependencias; el mismo cálculo corre en la tarjeta gráfica (app/filters-gl.mjs).
// Un filtro de clip es un objeto con parámetros numéricos (todo en 0 = sin cambio) y, opcional, `look` (nombre del ajuste preparado de donde salió).
// — Claude
export const FILTER_RANGES = { brightness: [-1, 1], contrast: [-1, 1], saturation: [-1, 1], warmth: [-1, 1], sepia: [0, 1], fade: [0, 1], vignette: [0, 1], grain: [0, 1] };
export const FILTER_KEYS = Object.keys(FILTER_RANGES);
// Ajustes preparados («looks»): nombre para mostrar + parámetros. Ids estables (los usa la IA y se guardan en el proyecto).
export const LOOK_PRESETS = {
  vintage: { name: 'Cámara antigua', p: { saturation: -0.25, contrast: 0.1, warmth: 0.3, sepia: 0.15, fade: 0.35, vignette: 0.4, grain: 0.3 } },
  film: { name: 'Rollo de película', p: { contrast: 0.2, saturation: 0.15, warmth: 0.12, fade: 0.2, vignette: 0.25, grain: 0.55 } },
  grain: { name: 'Grano fino', p: { grain: 0.5 } },
  bw: { name: 'Blanco y negro', p: { saturation: -1, contrast: 0.25 } },
  noir: { name: 'Noir', p: { saturation: -1, contrast: 0.5, brightness: -0.05, vignette: 0.6, grain: 0.35 } },
  sepia: { name: 'Sepia', p: { sepia: 0.9, contrast: 0.1, vignette: 0.25 } },
  warm: { name: 'Cálido', p: { warmth: 0.5, saturation: 0.12 } },
  cool: { name: 'Frío', p: { warmth: -0.5, saturation: 0.05, contrast: 0.05 } },
  vivid: { name: 'Intenso', p: { saturation: 0.45, contrast: 0.2 } },
  matte: { name: 'Mate', p: { fade: 0.45, contrast: -0.1, saturation: -0.15 } },
  sport: { name: 'Deportivo', p: { contrast: 0.35, saturation: 0.35, brightness: 0.03, vignette: 0.15 } },
};
export const LOOK_IDS = ['none', ...Object.keys(LOOK_PRESETS)];

const flNum = (v) => typeof v === 'number' && Number.isFinite(v);
/** Valida parámetros sueltos. → null si están bien, o un texto con el problema. */
export function filterProblem(params) {
  for (const k of Object.keys(params)) {
    if (!FILTER_KEYS.includes(k)) continue;
    const v = params[k]; if (v === undefined) continue; const [lo, hi] = FILTER_RANGES[k];
    if (!flNum(v) || v < lo || v > hi) return `${k} debe estar entre ${lo} y ${hi}`;
  }
  return null;
}
/** Une un filtro base con cambios; deja solo lo que no es cero. `look` se conserva solo si los números siguen siendo los del preset. → filtro o null (sin filtro). */
export function mergeFilter(base, look, params) {
  const out = {}; const src = look && look !== 'none' ? LOOK_PRESETS[look].p : (base || {});
  for (const k of FILTER_KEYS) { const v = params && params[k] !== undefined ? params[k] : src[k]; if (flNum(v) && Math.abs(v) > 1e-9) out[k] = Math.round(v * 1000) / 1000; }
  const lk = look && look !== 'none' ? look : (base && base.look);
  if (lk && LOOK_PRESETS[lk] && FILTER_KEYS.every((k) => (out[k] || 0) === (LOOK_PRESETS[lk].p[k] || 0))) out.look = lk;
  return Object.keys(out).length ? out : null;
}
export const hasFilter = (f) => !!f && FILTER_KEYS.some((k) => Math.abs(f[k] || 0) > 1e-9);

const flClamp = (x) => Math.min(1, Math.max(0, x));
/** Cálculo de referencia (igual que el shader), sin el grano. rgb en 0..1, uv en 0..1 (para la viñeta). */
export function filterRGB(rgb, f, uv = [0.5, 0.5]) {
  let [r, g, b] = rgb; const F = (k) => (f && f[k]) || 0;
  r += F('brightness') * 0.3; g += F('brightness') * 0.3; b += F('brightness') * 0.3;
  const k = F('contrast'), cf = k >= 0 ? 1 + k : 1 + k * 0.8; r = (r - 0.5) * cf + 0.5; g = (g - 0.5) * cf + 0.5; b = (b - 0.5) * cf + 0.5;
  const lum = (x, y, z) => 0.2126 * x + 0.7152 * y + 0.0722 * z, sat = 1 + F('saturation'); { const l = lum(r, g, b); r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat; }
  const sp = F('sepia'); if (sp > 0) { const sr = 0.393 * r + 0.769 * g + 0.189 * b, sg = 0.349 * r + 0.686 * g + 0.168 * b, sb = 0.272 * r + 0.534 * g + 0.131 * b; r += (sr - r) * sp; g += (sg - g) * sp; b += (sb - b) * sp; }
  const w = F('warmth'); r += w * 0.08; g += w * 0.02; b -= w * 0.08;
  const fd = F('fade'); r = r * (1 - 0.18 * fd) + 0.12 * fd; g = g * (1 - 0.18 * fd) + 0.12 * fd; b = b * (1 - 0.18 * fd) + 0.12 * fd;
  const v = F('vignette'); if (v > 0) { const d = Math.hypot(uv[0] - 0.5, uv[1] - 0.5) * 1.4142; const t = flClamp((d - 0.35) / 0.65), sm = t * t * (3 - 2 * t), m = 1 - v * sm * 0.8; r *= m; g *= m; b *= m; }
  return [flClamp(r), flClamp(g), flClamp(b)];
}
