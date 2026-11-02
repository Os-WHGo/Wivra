// Estilo de textos: posición, tamaño, color y caja de fondo. — Claude
import test from 'node:test'; import assert from 'node:assert/strict';
import { applyBatch } from '../operations.mjs';
import { createProject } from '../project.mjs';
import { textStyleOf, TEXT_DEFAULT, groupTextsByPos, textStyleProblem } from '../text-style.mjs';
import { OP_SCHEMAS } from '../op-schemas.mjs';

const base = () => applyBatch(createProject({ assets: [{ id: 'a1', duration: 10, name: 'v.mp4' }] }), [{ op: 'add_clip', asset_id: 'a1' }]).project;
const run = (p, ops) => { const r = applyBatch(p, ops); assert.ok(r.ok, r.message); return r.project; };

test('un texto sin estilo no guarda campos de estilo y se ve con los valores de siempre', () => {
  const p = run(base(), [{ op: 'add_text', text: 'Hola', start: 0, duration: 2 }]);
  assert.deepEqual(Object.keys(p.texts[0]).sort(), ['end', 'id', 'start', 'text']); assert.deepEqual(textStyleOf(p.texts[0]), TEXT_DEFAULT);
});
test('add_text y set_text guardan el estilo; los valores por defecto lo quitan', () => {
  let p = run(base(), [{ op: 'add_text', text: 'Y DICIÉNDOLE', start: 0, duration: 3, pos: 'middle', size: 'l', color: '#FFD24A', box: '#000000' }]);
  assert.deepEqual([p.texts[0].pos, p.texts[0].size, p.texts[0].color, p.texts[0].box], ['middle', 'l', '#ffd24a', '#000000'], 'el color se guarda en minúsculas');
  p = run(p, [{ op: 'set_text', text_id: 't2', pos: 'bottom', box: 'none' }]); assert.equal(p.texts[0].pos, undefined); assert.equal(p.texts[0].box, undefined); assert.equal(p.texts[0].size, 'l', 'lo que no se pide no cambia');
  p = run(p, [{ op: 'set_text', text_id: 't2', size: 'm', color: '#ffffff' }]); assert.deepEqual(Object.keys(p.texts[0]).sort(), ['end', 'id', 'start', 'text']);
});
test('valores inválidos o propiedades desconocidas se rechazan y no cambian nada', () => {
  const p = run(base(), [{ op: 'add_text', text: 'x', start: 0, duration: 2 }]);
  for (const bad of [{ pos: 'izquierda' }, { size: 'gigante' }, { color: 'rojo' }, { color: '#fff' }, { box: 'negro' }, { rotate: 45 }]) {
    const r = applyBatch(p, [{ op: 'set_text', text_id: 't2', ...bad }]); assert.equal(r.ok, false, JSON.stringify(bad)); if (!('rotate' in bad)) assert.equal(r.code, 'bad_text_style');
    assert.equal(applyBatch(p, [{ op: 'add_text', text: 'y', start: 0, duration: 1, ...bad }]).ok, false);
  }
  assert.equal(applyBatch(p, [{ op: 'set_text', text_id: 't2' }]).ok, false, 'sin nada que cambiar');
});
test('un lote con un estilo inválido es todo-o-nada', () => {
  const p = run(base(), [{ op: 'add_text', text: 'x', start: 0, duration: 2 }]);
  const r = applyBatch(p, [{ op: 'set_text', text_id: 't2', pos: 'top' }, { op: 'set_text', text_id: 't2', size: 'nada' }]); assert.equal(r.ok, false); assert.equal(p.texts[0].pos, undefined);
});
test('groupTextsByPos separa arriba, centro y abajo; textStyleOf ignora valores dañados', () => {
  const g = groupTextsByPos([{ id: 'a', pos: 'top' }, { id: 'b' }, { id: 'c', pos: 'middle' }, { id: 'd', pos: 'raro' }]);
  assert.deepEqual([g.top.map((t) => t.id), g.middle.map((t) => t.id), g.bottom.map((t) => t.id)], [['a'], ['c'], ['b', 'd']]);
  assert.equal(textStyleProblem('size', 'xl'), null); assert.ok(textStyleProblem('x', 1));
});
test('el esquema de la IA conoce el estilo', () => {
  for (const op of ['add_text', 'set_text']) for (const k of ['pos', 'size', 'color', 'box']) assert.ok(OP_SCHEMAS[op].props.includes(k), `${op}.${k}`);
});
