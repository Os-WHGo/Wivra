// Lee los archivos app/i18n/*.tsv (columnas separadas por " || ", la primera es el español = clave). Solo Node (build y tests). — Claude
import { readFileSync, readdirSync } from 'node:fs';
export function parseTsv(text, name = 'tsv') {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0].split(' || ').map((s) => s.trim()); const out = Object.fromEntries(head.slice(1).map((l) => [l, {}])); const bad = [];
  for (const [i, line] of lines.slice(1).entries()) {
    const c = line.split(' || ').map((s) => s.trim());
    if (c.length !== head.length) { bad.push(`${name}:${i + 2} tiene ${c.length} columnas (se esperaban ${head.length})`); continue; }
    for (let k = 1; k < head.length; k++) out[head[k]][c[0]] = c[k];
  }
  if (bad.length) throw new Error(bad.join('\n'));
  return out;
}
export function loadI18n(dir = new URL('./i18n/', import.meta.url)) {
  const all = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.tsv')).sort())
    for (const [lang, m] of Object.entries(parseTsv(readFileSync(new URL(f, dir), 'utf8'), f))) Object.assign((all[lang] ||= {}), m);
  return all;
}
