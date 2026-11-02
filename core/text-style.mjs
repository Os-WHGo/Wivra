// Estilo de los textos en pantalla (y subtítulos): posición, tamaño, color y caja de fondo. Lógica pura; la usan las operaciones, la vista previa y la exportación. — Claude
// Los valores por defecto NO se guardan en el proyecto (un texto sin estilo se ve como siempre: blanco, mediano, abajo, sin caja).
export const TEXT_POS = ['top', 'middle', 'bottom'];
export const TEXT_SIZES = { s: 0.75, m: 1, l: 1.5, xl: 2.1 };           // múltiplos del tamaño base (6 % del lado corto del cuadro)
export const TEXT_DEFAULT = { pos: 'bottom', size: 'm', color: '#ffffff', box: 'none' };
export const TEXT_STYLE_KEYS = ['pos', 'size', 'color', 'box'];
const HEX = /^#[0-9a-fA-F]{6}$/;

/** Devuelve un texto de error si `v` no es un valor válido para la propiedad de estilo `k`; si no, null. */
export function textStyleProblem(k, v) {
  if (k === 'pos') return TEXT_POS.includes(v) ? null : `pos debe ser uno de ${TEXT_POS.join(', ')}`;
  if (k === 'size') return Object.prototype.hasOwnProperty.call(TEXT_SIZES, v) ? null : `size debe ser uno de ${Object.keys(TEXT_SIZES).join(', ')}`;
  if (k === 'color') return typeof v === 'string' && HEX.test(v) ? null : 'color debe ser un color #rrggbb';
  if (k === 'box') return v === 'none' || (typeof v === 'string' && HEX.test(v)) ? null : "box debe ser 'none' o un color #rrggbb";
  return `propiedad de estilo desconocida: ${k}`;
}
/** Estilo completo (con valores por defecto) de un texto del proyecto; los valores inválidos guardados se ignoran. */
export function textStyleOf(t) {
  const o = { ...TEXT_DEFAULT };
  for (const k of TEXT_STYLE_KEYS) if (t && t[k] !== undefined && !textStyleProblem(k, t[k])) o[k] = typeof t[k] === 'string' && t[k][0] === '#' ? t[k].toLowerCase() : t[k];
  return o;
}
/** Pone (o quita, si es el valor por defecto) las propiedades de estilo `st` en el texto `t`. */
export function applyTextStyle(t, st) {
  for (const k of TEXT_STYLE_KEYS) {
    if (st[k] === undefined) continue;
    const v = typeof st[k] === 'string' && st[k][0] === '#' ? st[k].toLowerCase() : st[k];
    if (v === TEXT_DEFAULT[k]) delete t[k]; else t[k] = v;
  }
}
/**
 * Zona de los textos como fracción del cuadro. «Normal» = la de siempre. «Segura» (opción, solo 9:16): deja libre lo que tapan los botones y el pie de Reels/TikTok/Shorts.
 * Medidas en un cuadro de 1080×1920 (estilo editorial de Wivra, NO una norma de las apps): x de 90 a 950, y de 240 a 1470.
 */
export const TEXT_ZONES = { normal: { top: 0.07, mid: 0.5, bottom: 0.89, width: 0.86, left: 0.04, right: 0.04 }, safe: { top: 240 / 1920, mid: (240 + 1470) / 2 / 1920, bottom: 1470 / 1920, width: 0.8, left: 90 / 1080, right: 130 / 1080 } };
/** ¿Está activa la zona segura? Solo cuenta en 9:16. */
export const safeZoneOn = (format) => !!format && format.safe === true && format.aspect === '9:16';
export const textZoneOf = (format) => (safeZoneOn(format) ? TEXT_ZONES.safe : TEXT_ZONES.normal);
/** Agrupa textos por posición, en el orden en que aparecen. → { top:[…], middle:[…], bottom:[…] } */
export function groupTextsByPos(list) {
  const g = { top: [], middle: [], bottom: [] };
  for (const t of list) g[textStyleOf(t).pos].push(t);
  return g;
}
