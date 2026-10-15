// Auditoría CRUZADA de Wivra (15-10-2026). Tests de diagnóstico, NO pruebas de
// capacidades completas ni propuesta de cambio en motor del Editor de Claude.
// Los tres hallazgos se comprueban contra los módulos reales de esta rama.
// — ChatGPT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EDIT_TOOL } from '../ai-client.mjs';
import { parseManifest, importPlan, planImportOps } from '../capture-manifest.mjs';
import { localBasicCommand } from '../../core/in-app-agent.mjs';
import { createProject } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';

const base = createProject({ assets: [{ id: 'v1', name: 'sample.mov', duration: 12 }] });
const inserted = applyBatch(base, [{ op: 'add_clip', asset_id: 'v1', start: 0 }]);
assert.ok(inserted.ok, 'El editor debe poder importar un clip para probar la IA');

test('AUDIT-01: filtro ejecutable manualmente aún no está expuesto en EDIT_TOOL', (t) => {
  const filtered = applyBatch(inserted.project,
    [{ op: 'set_clip_filter', clip_id: 'c1', contrast: 0.2 }], inserted.project.revision);
  assert.equal(filtered.ok, true, 'El motor sí puede aplicar un filtro real');
  assert.ok(filtered.project.clips[0].filter, 'El filtro queda en el proyecto');
  const allowed = EDIT_TOOL.function.parameters.properties.ops.items.properties.op.enum;
  assert.ok(allowed.includes('trim_clip'), 'La IA tiene al menos cortes');
  assert.equal(allowed.includes('set_clip_filter'), false,
    'Diagnóstico de brecha actual: el esquema IA aún no ofrece filtro');
  t.diagnostic('BRECHA CONFIRMADA: motor aplica set_clip_filter; EDIT_TOOL solo ofrece subconjunto. Actualizar prueba cuando se integre.');
});

test('AUDIT-02: dos channelIndex de mismo estéreo aún generan dos clips del MISMO audio completo', (t) => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/manifest-v2-fixtures.json', import.meta.url), 'utf8'));
  const fixture = fx.cases.find(x => x.name === 'usb-stereo-two-transmitters-hypothetical');
  assert.ok(fixture, 'Fixture de contrato v2 disponible');
  const parsed = parseManifest(structuredClone(fixture.manifest));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.manifest.tracks.map(x => x.channelIndex), [0, 1]);
  const plan = importPlan(parsed.manifest, { useMuxed: false });
  const audioFile = plan.audioTracks[0].file;
  assert.equal(audioFile, plan.audioTracks[1].file);
  const proposed = planImportOps(plan, { videoStart: 0, assets: {
    [plan.videoFile]: { id: 'v1', duration: 12 },
    [audioFile]: { id: 'a1', duration: 12 },
  } });
  const audioOps = proposed.ops.filter(op => op.op === 'add_audio_clip');
  assert.equal(audioOps.length, 2);
  assert.deepEqual(audioOps.map(op => op.asset_id), ['a1', 'a1']);
  assert.ok(proposed.warnings.some(w => w.includes('canal')),
    'El editor reconoce y advierte que no extrae los canales');
  t.diagnostic('BRECHA CONFIRMADA: L/R son dos pistas lógicas que reproducen el archivo entero; evitar doble audio hasta separar realmente canales.');
});

test('AUDIT-03: fallback local procesa órdenes EXACTAS pero no entiende indicaciones narrativas', (t) => {
  const r = localBasicCommand('agrega un texto "Hola"', inserted.project);
  assert.equal(r.operations[0].op, 'add_text');
  assert.throws(
    () => localBasicCommand('selecciona los mejores momentos de mi viaje', inserted.project),
    /modo local básico/,
    'El fallback no se debe presentar como IA semántica');
  t.diagnostic('BRECHA CONFIRMADA: el fallback no consume tokens/API, pero no reconoce escenas ni prioriza clips.');
});

test.todo('ACCEPTANCE P0: herramienta IA descubre y valida filtros, capas, pista audio y exportación');
test.todo('ACCEPTANCE P0: editor reproduce realmente solo channelIndex L/R y exporta sin duplicado');
test.todo('ACCEPTANCE P1: captura real iPhone/Meta -> proyecto compartido -> export en Safari/iOS real');
