// Catálogo de paquetes de efectos (datos puros): todo valida y los ids no se repiten. — Claude
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { filterProblem, FILTER_KEYS } from '../../core/filters.mjs';
const cat = JSON.parse(fs.readFileSync(new URL('../packs/catalog.json', import.meta.url), 'utf8'));
test('catálogo: esquema, licencia y ids únicos', () => {
  assert.equal(cat.schema, 'wivra-packs'); assert.ok(cat.license && cat.packs.length >= 4);
  const ids = new Set(); for (const p of cat.packs) { assert.ok(p.id && p.name && p.looks.length); assert.ok(!ids.has(p.id)); ids.add(p.id); const li = new Set(); for (const l of p.looks) { assert.ok(l.id && l.name && !li.has(l.id)); li.add(l.id); } }
});
test('catálogo: cada ajuste es válido y no vacío', () => {
  for (const p of cat.packs) for (const l of p.looks) { assert.equal(filterProblem(l.p), null, `${p.id}/${l.id}`); assert.ok(Object.keys(l.p).every((k) => FILTER_KEYS.includes(k))); assert.ok(Object.values(l.p).some((v) => v !== 0)); }
});
