// Importación robusta (guardas de lectura de archivos; el comportamiento real se prueba en navegador). — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
for (const f of ['../template.html', '../dist/agentcut.html']) {
  test(`importación: tiempo límite, motivos claros y tope de archivos (${f})`, () => {
    const h = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(h, /const PROBE_MS = 30000/); assert.match(h, /setTimeout\(\(\) => fail\('tardó demasiado en abrirse/);
    assert.match(h, /dura menos de 0\.1 s/); assert.match(h, /Más compatible/); assert.match(h, /const MAX_IMPORT = 40/);
    assert.match(h, /t\.removeAttribute\('src'\); t\.load\(\)/, 'se suelta el lector de video temporal');
    assert.match(h, /No se agregó ningún archivo/); assert.doesNotMatch(h, /files = files\.slice\(0, MAX_IMPORT\)/);
  });
}

for (const f of ['../template.html','../dist/agentcut.html']) {
  test(`captura multipista falla de forma segura ante audio faltante o ilegible (${f})`,()=>{
    const h=readFileSync(new URL(f,import.meta.url),'utf8');
    assert.match(h,/mf\.size > 128 \* 1024/);
    assert.match(h,/captureSelectionPlan\(m, files\)/);
    assert.match(h,/if \(!selection\.ok\)/);
    assert.match(h,/for \(const \{ name, muxed: isMux \} of selection\.candidates\)/);
    assert.match(h,/if \(out\.skipped\.length\) \{/);
    assert.match(h,/La línea de tiempo no se modificó/);
  });
}

for (const f of ['../template.html','../dist/agentcut.html']) {
 test(`capturas fallidas liberan recursos sin alterar otros clips ni historial (${f})`,()=>{
  const s=readFileSync(new URL(f,import.meta.url),'utf8');
  const block=s.slice(s.indexOf('async function importCapture(files)'),s.indexOf('// The same import path handles user-selected files'));
  assert.match(block,/const previousSession = session, stagedAssetIDs = \[\], importedAssetIDs = \[\]/);
  assert.match(block,/captureCommitted = true/);
  assert.match(block,/if \(stagedAssetIDs\.length\)/);
  assert.match(block,/\.\.\.stagingSession\.undoStack, \.\.\.stagingSession\.redoStack/);
  assert.match(block,/referenced\.has\(id\)/);
  assert.match(block,/state\.assets = state\.assets\.filter/);
  assert.match(block,/URL\.revokeObjectURL\(url\)/);
  assert.match(block,/delete media\[id\]/);
  assert.match(block,/delete mediaFiles\[id\]/);
 });
}
