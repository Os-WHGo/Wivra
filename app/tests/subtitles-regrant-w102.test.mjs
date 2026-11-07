// W102 (Claude): long-video subtitles after Wivra was reopened. The phone keeps the permission to read a
// file in parts only in memory; the editor asks the person to choose the SAME file again instead of failing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../template.html', import.meta.url), 'utf8');
const tsv = readFileSync(new URL('../i18n/strings-3.tsv', import.meta.url), 'utf8') + readFileSync(new URL('../i18n/strings-it.tsv', import.meta.url), 'utf8');

test('checked before any work starts, only for long files read natively', () => {
  assert.match(html, /if \(long\) \{ const missing = await wvUngranted\(project\); if \(missing\.length\) \{ wvAskRegrant\(missing\); return; \} \}/);
  assert.ok(html.indexOf('wvAskRegrant(missing); return;') < html.indexOf("wvUi(true, aiT('Leyendo el sonido del video…'), 0);"));
  assert.match(html, /!\(a\.duration > WV_MAX_AUDIO_S\)/);
});

test('a real tap opens the picker; only the same file (name, size AND identical bytes) is accepted; nothing is copied', () => {
  assert.match(html, /b\.onclick = \(\) => \{\s*const inp = document\.createElement\('input'\); inp\.type = 'file'/);
  assert.match(html, /if \(file\.name !== x\.name \|\| file\.size !== x\.size\) \{ say\(aiT\('Ese no es el mismo archivo/);
  const block = html.split('function wvAskRegrant(missing) {')[1].split('async function wvLongWindow')[0];
  // The project's copy is only READ to compare bytes; nothing is imported, stored or replaced.
  assert.match(block, /await sameBytes\(mediaFiles\[x\.id\], file/);
  assert.doesNotMatch(block, /mediaFiles\[[^\]]+\]\s*=|importFiles|putAsset/);
});

test('every new text is translated', () => {
  for (const es of ['Elegir otra vez «{1}»', 'Ese no es el mismo archivo. Elige «{1}».', 'Listo. Toca «Generar subtítulos» otra vez.',
    'El teléfono todavía no deja leer ese archivo. Vuelve a agregar el video al proyecto.']) {
    assert.equal((tsv.match(new RegExp('^' + es.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\|\\|', 'gm')) || []).length, 2, es);
  }
});
