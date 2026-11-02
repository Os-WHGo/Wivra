// Idiomas de Wivra. El español es el texto original y sirve de clave: si falta una traducción, se ve en español (nunca vacío). — Claude
export const I18N_LANGS = [['es', 'Español'], ['en', 'English'], ['pt', 'Português'], ['fr', 'Français'], ['de', 'Deutsch'], ['ja', '日本語'], ['zh', '中文'], ['it', 'Italiano']];
export const i18nDetect = (nav) => { const l = String(nav || '').slice(0, 2).toLowerCase(); return I18N_LANGS.some((x) => x[0] === l) ? l : 'en'; };
/** map: {español: traducción}. Devuelve tr(texto). Admite: frase exacta; plantillas con {} (números u otros datos); y "prefijo:" seguido de texto libre. */
export function i18nCompile(map) {
  const exact = new Map(), tpl = [], pre = [];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  for (const [k, v] of Object.entries(map || {})) {
    exact.set(k, v);
    if (k.includes('{}')) tpl.push([new RegExp('^' + k.split('{}').map(esc).join('(.+?)') + '$'), v]);
    else if (k.endsWith(':') && k.length >= 8) pre.push([k, v]);
  }
  pre.sort((a, b) => b[0].length - a[0].length);
  return function tr(s) {
    if (typeof s !== 'string') return s;
    const t = s.trim(); if (!t) return s;
    const lead = s.slice(0, s.length - s.trimStart().length), trail = s.slice(s.trimEnd().length), k = t.replace(/\s+/g, ' ');
    const e = exact.get(k); if (e !== undefined) return lead + e + trail;
    for (const [re, out] of tpl) { const m = re.exec(k); if (m) { let i = 0; return lead + out.replace(/\{\}/g, () => m[++i]) + trail; } }
    for (const [p, out] of pre) if (k.startsWith(p + ' ') || k.startsWith(p)) return lead + out + k.slice(p.length) + trail;
    return s;
  };
}
