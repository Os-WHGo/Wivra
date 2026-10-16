// Pantalla de tomas: estados repetir / saltada sobre el checklist único. Pruebas de cableado (la prueba en navegador está aparte). — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createShootPlan, updateShot, progress } from '../../core/shoot-checklist.mjs';

const tpl = readFileSync(new URL('../template.html', import.meta.url), 'utf8');
const dist = readFileSync(new URL('../dist/agentcut.html', import.meta.url), 'utf8');
const tsv = (f) => readFileSync(new URL('../i18n/' + f, import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => l.split(' || '));
const keys = new Set([...tsv('strings-3.tsv'), ...tsv('strings-it.tsv')].map((r) => r[0]));

const NUEVAS = ['{} de {} tomas hechas.', 'Por repetir: {}', 'Saltadas: {} (no cuentan como grabadas)', 'Lista lista para revisar tus videos.',
  'Todas las tomas están saltadas: no hay nada que editar.', 'Marca las tomas que hayas grabado.', 'Pendiente', 'Hecha', 'Por repetir', 'Saltada',
  'Repetir esta toma', 'Saltar esta toma', 'Volver a pendiente', 'Grabar esta toma',
  'Esta toma ya está hecha. ¿Repetirla? Se quita el video asociado a la toma (el video sigue en el proyecto).',
  'La toma «{1}» se salta y no cuenta como grabada. ¿Saltarla?'];

test('cada texto nuevo de la pantalla de tomas tiene fila en los 8 idiomas', () => {
  const s3 = new Set(tsv('strings-3.tsv').map((r) => r[0])), it = new Set(tsv('strings-it.tsv').map((r) => r[0]));
  for (const k of NUEVAS) { assert.ok(s3.has(k), 'falta en strings-3: ' + k); assert.ok(it.has(k), 'falta en strings-it: ' + k); }
});
test('las marcas {} / {1} se conservan en cada idioma', () => {
  for (const f of ['strings-3.tsv', 'strings-it.tsv']) for (const r of tsv(f)) {
    if (!NUEVAS.includes(r[0])) continue;
    const n = (s) => (s.match(/\{\d*\}/g) || []).length;
    for (const c of r.slice(1)) assert.equal(n(c), n(r[0]), `${f}: «${r[0]}» → «${c}»`);
  }
});
test('la plantilla y el archivo final muestran los estados y piden confirmación', () => {
  for (const [n, h] of [['plantilla', tpl], ['dist', dist]]) {
    for (const t of ['Repetir esta toma', 'Saltar esta toma', 'Volver a pendiente']) assert.ok(h.includes(t), `${n}: falta ${t}`);
    assert.match(h, /setState\('skipped',aiT\(/, n + ': saltar debe pedir confirmación');
    assert.match(h, /\{state,assetId:null\}/, n + ': repetir/saltar deben quitar el video asociado');
    assert.ok(!/window\.prompt/.test(h), n + ': sin window.prompt');
  }
});
test('el módulo admite los 4 estados y saltar no cuenta como grabada', () => {
  let p = createShootPlan({ subject: 'café en Vancouver', durationSeconds: 30, shotCount: 4 });
  p = updateShot(p, 'shot-1', { state: 'done' }); p = updateShot(p, 'shot-2', { state: 'retry' }); p = updateShot(p, 'shot-3', { state: 'skipped' });
  const g = progress(p); assert.equal(g.done, 1); assert.equal(g.remaining, 2); assert.equal(g.readyToEdit, false);
  p = updateShot(p, 'shot-2', { state: 'done' }); p = updateShot(p, 'shot-4', { state: 'skipped' });
  assert.equal(progress(p).readyToEdit, true);
  assert.throws(() => updateShot(p, 'shot-1', { state: 'otra' }), /Invalid shot state/);
});
