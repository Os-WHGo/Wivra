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
/** Agrupa textos por posición, en el orden en que aparecen. → { top:[…], middle:[…], bottom:[…] } */
export function groupTextsByPos(list) {
  const g = { top: [], middle: [], bottom: [] };
  for (const t of list) g[textStyleOf(t).pos].push(t);
  return g;
}
