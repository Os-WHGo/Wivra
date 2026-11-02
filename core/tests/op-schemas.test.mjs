import test from 'node:test'; import assert from 'node:assert/strict';
import { OPERATION_NAMES } from '../operations.mjs';
import { OP_SCHEMAS, OP_SCHEMA_NAMES, opsFlat, opsOneOf, opsPrompt } from '../op-schemas.mjs';
import { TOOLS } from '../tools.mjs';
import { EDIT_TOOL, SYSTEM, aiProjectSummary } from '../../app/ai-client.mjs';
import { createProject } from '../project.mjs';
import { applyBatch } from '../operations.mjs';

test('cada operación del motor tiene esquema y cada esquema tiene operación', () => {
  assert.deepEqual([...OP_SCHEMA_NAMES].sort(), [...OPERATION_NAMES].sort());
  for (const n of OPERATION_NAMES) { const s = OP_SCHEMAS[n]; assert.ok(s.desc && Array.isArray(s.props), n); for (const r of s.required) assert.ok(s.props.includes(r), `${n}: ${r} requerido pero no declarado`); }
});
test('la herramienta de la IA (chat directo y herramientas) expone todas las operaciones', () => {
  const flat = EDIT_TOOL.function.parameters.properties.ops.items;
  assert.deepEqual([...flat.properties.op.enum].sort(), [...OPERATION_NAMES].sort());
  assert.ok(!/oneOf|"const"/.test(JSON.stringify(EDIT_TOOL)), 'el esquema del chat directo sigue plano');
  const variants = TOOLS.find((t) => t.name === 'edit_apply').parameters.properties.ops.items.oneOf;
  assert.deepEqual(variants.map((v) => v.properties.op.const).sort(), [...OPERATION_NAMES].sort());
  for (const n of OPERATION_NAMES) assert.ok(SYSTEM.includes(`- ${n} `), `el prompt no menciona ${n}`);
  for (const k of Object.keys(flat.properties)) assert.ok(flat.properties[k], k);
});
test('el resumen para la IA incluye capas, audio, formato y filtros, pero no direcciones del video', () => {
  let p = createProject({ assets: [{ id: 'a1', duration: 10, name: 'v.mp4', url: 'blob:SECRET' }, { id: 'a2', duration: 5, name: 'm.mp3', url: 'blob:SECRET2' }] });
  for (const ops of [[{ op: 'add_clip', asset_id: 'a1' }], [{ op: 'add_overlay_clip', asset_id: 'a1' }], [{ op: 'add_audio_clip', asset_id: 'a2' }], [{ op: 'set_format', aspect: '9:16' }], [{ op: 'set_clip_filter', clip_id: 'c1', look: 'noir' }]]) { const r = applyBatch(p, ops); assert.ok(r.ok, JSON.stringify(r)); p = r.project; }
  const s = aiProjectSummary(p), j = JSON.stringify(s);
  assert.equal(s.format.aspect, '9:16'); assert.equal(s.overlayClips.length, 1); assert.equal(s.audioClips.length, 1); assert.equal(s.clips[0].filter.look, 'noir');
  assert.ok(!j.includes('blob:'));
});
test('un lote hecho con los nombres de las propiedades del esquema lo acepta el validador', () => {
  let p = createProject({ assets: [{ id: 'a1', duration: 10, name: 'v.mp4' }] }); p = applyBatch(p, [{ op: 'add_clip', asset_id: 'a1' }]).project;
  const r = applyBatch(p, [{ op: 'set_clip_fx', clip_id: 'c1', intro: 'fade', dur: 0.5 }, { op: 'set_clip_filter', clip_id: 'c1', look: 'warm', vignette: 0.2 }]); assert.ok(r.ok, JSON.stringify(r));
  assert.ok(opsOneOf().length === OPERATION_NAMES.length && opsFlat() && opsPrompt().split('\n').length === OPERATION_NAMES.length);
});
