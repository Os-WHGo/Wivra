// Editar y borrar textos en pantalla (subtítulos): set_text y delete_text. — Claude
import test from 'node:test'; import assert from 'node:assert/strict';
import { applyBatch, MAX_TEXT } from '../operations.mjs';
import { createProject } from '../project.mjs';

const base = () => applyBatch(createProject({ assets: [{ id: 'a1', duration: 10, name: 'v.mp4' }] }), [{ op: 'add_clip', asset_id: 'a1' }, { op: 'add_text', text: 'Hola', start: 1, duration: 2 }, { op: 'add_text', text: 'Adiós', start: 4, duration: 3 }]).project;
const run = (p, ops) => { const r = applyBatch(p, ops); assert.ok(r.ok, r.message); return r.project; };

test('set_text cambia solo lo que se pide y mantiene el resto', () => {
  let p = run(base(), [{ op: 'set_text', text_id: 't2', text: 'Nuevo' }]); assert.deepEqual([p.texts[0].text, p.texts[0].start, p.texts[0].end], ['Nuevo', 1, 3]);
  p = run(p, [{ op: 'set_text', text_id: 't2', start: 2 }]); assert.deepEqual([p.texts[0].start, p.texts[0].end], [2, 4], 'mover conserva la duración');
  p = run(p, [{ op: 'set_text', text_id: 't2', duration: 5 }]); assert.deepEqual([p.texts[0].start, p.texts[0].end], [2, 7]);
});
test('el final se recorta a la duración del video, igual que add_text', () => {
  const p = run(base(), [{ op: 'set_text', text_id: 't2', start: 8, duration: 5 }]); assert.equal(p.texts[0].end, 10);
});
test('valida texto, tiempos y existencia', () => {
  const code = (op) => applyBatch(base(), [op]).code;
  assert.equal(code({ op: 'set_text', text_id: 'zz', text: 'x' }), 'unknown_text');
  assert.equal(code({ op: 'set_text', text_id: 't2' }), 'bad_text');
  assert.equal(code({ op: 'set_text', text_id: 't2', text: '   ' }), 'bad_text');
  assert.equal(code({ op: 'set_text', text_id: 't2', text: 'x'.repeat(MAX_TEXT + 1) }), 'bad_text');
  assert.equal(code({ op: 'set_text', text_id: 't2', start: -1 }), 'bad_time');
  assert.equal(code({ op: 'set_text', text_id: 't2', duration: 0 }), 'bad_time');
  assert.equal(code({ op: 'set_text', text_id: 't2', start: 10 }), 'out_of_range');
  assert.equal(applyBatch(base(), [{ op: 'set_text', text_id: 't2', text: 'x'.repeat(MAX_TEXT) }]).ok, true);
});
test('delete_text borra uno y los demás siguen; un id que no existe falla', () => {
  const p = run(base(), [{ op: 'delete_text', text_id: 't2' }]); assert.deepEqual(p.texts.map((t) => t.id), ['t3']);
  assert.equal(applyBatch(p, [{ op: 'delete_text', text_id: 't2' }]).code, 'unknown_text');
});
test('el lote es todo-o-nada', () => {
  const p = base(), r = applyBatch(p, [{ op: 'set_text', text_id: 't2', text: 'Nuevo' }, { op: 'delete_text', text_id: 'zz' }]);
  assert.equal(r.ok, false); assert.equal(r.failed_index, 1); assert.equal(p.texts[0].text, 'Hola');
});
