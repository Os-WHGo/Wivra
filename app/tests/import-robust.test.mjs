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
    assert.match(h, /else if \(capNote\) say\(capNote/);
  });
}
