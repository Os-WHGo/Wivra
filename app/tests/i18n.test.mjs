import test from 'node:test'; import assert from 'node:assert/strict';
import { loadI18n, parseTsv } from '../i18n-parse.mjs';
import { I18N_LANGS, i18nCompile, i18nDetect } from '../i18n.mjs';
const D = loadI18n(); const LANGS = I18N_LANGS.map((x) => x[0]).filter((l) => l !== 'es');

test('hay diccionario para cada idioma de la lista y todos tienen las mismas frases', () => {
  const n = Object.keys(D.en).length; assert.ok(n > 250, 'frases: ' + n);
  for (const l of LANGS) { assert.ok(D[l], l); assert.deepEqual(Object.keys(D[l]).sort(), Object.keys(D.en).sort(), `${l} difiere de en`); }
});
test('ninguna traducción está vacía y las plantillas {} conservan su cantidad', () => {
  for (const l of LANGS) for (const [k, v] of Object.entries(D[l])) { assert.ok(v && v.trim(), `${l}: «${k}» vacío`); assert.equal((v.match(/\{\}/g) || []).length, (k.match(/\{\}/g) || []).length, `${l}: «${k}» cambia los {}`); }
});
test('una fila con columnas de más o de menos se rechaza', () => {
  assert.throws(() => parseTsv('es || en\nhola || hello || extra', 'x'), /columnas/);
});
test('tr: frase exacta, plantilla, prefijo y texto desconocido (queda en español)', () => {
  const tr = i18nCompile(D.en);
  assert.equal(tr('Cortar'), 'Split'); assert.equal(tr('  Cortar '), '  Split ');
  assert.equal(tr('3 clips · 12.5 s en total'), '3 clips · 12.5 s total');
  assert.equal(tr('No se pudo: boom'), 'Could not: boom');
  assert.equal(tr('Texto que no existe'), 'Texto que no existe'); assert.equal(tr(''), '');
});
test('detección del idioma del teléfono: soportado o inglés', () => {
  assert.equal(i18nDetect('pt-BR'), 'pt'); assert.equal(i18nDetect('ja-JP'), 'ja'); assert.equal(i18nDetect('ru-RU'), 'en'); assert.equal(i18nDetect(''), 'en');
});
