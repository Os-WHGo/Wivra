import test from 'node:test';
import assert from 'node:assert/strict';
import { createDirectorBrief, recordInstruction, describeAsset, addShotIdea } from '../creative-director.mjs';
import { createProject } from '../project.mjs';
import { DIRECTOR_DRAFT_KEY, createDirectorDraftRecord, restoreDirectorDraftRecord, directorAITaskContext } from '../director-intake.mjs';

test('idea primero y luego importar videos: persiste objetivos sin guardar medios', () => {
  let b = createDirectorBrief({ mode: 'guided', goal: 'Recorrido urbano de principio a fin', notes: 'Humor seco', platforms: ['reels'] });
  b = recordInstruction(b, 'Conserva el inicio y el último bus', {source: 'dictated'});
  b = recordInstruction(b, 'Mejor el inicio con desayuno', {kind:'correction'});
  const saved = createDirectorDraftRecord(b);
  assert.ok(DIRECTOR_DRAFT_KEY.includes('wivra-director'));
  const restored = restoreDirectorDraftRecord(saved);
  assert.equal(restored.goal, b.goal);
  assert.deepEqual(restored.utterances.map(x => x.text), b.utterances.map(x => x.text));
  assert.equal(restored.utterances[1].kind, 'correction');
  assert.equal(restored.notes, 'Humor seco');
  assert.deepEqual(restored.assetDescriptions, {});
});
test('descripción vinculada al video no persiste cuando el video no se guarda', () => {
  const project = createProject({assets: [{id: 'a1', name: 'Puerto.mov', duration: 20, url: 'blob:PRIVATE'}]});
  let b = createDirectorBrief({ goal: 'Historia de mi regreso', mode: 'guided' });
  b = describeAsset(b, project, {assetId: 'a1', description: 'Hay barcos y personas'});
  const serialized = createDirectorDraftRecord(b);
  assert.ok(!serialized.includes('Puerto.mov'));
  assert.ok(!serialized.includes('blob:PRIVATE'));
  assert.ok(!serialized.includes('a1'));
  assert.deepEqual(restoreDirectorDraftRecord(serialized).assetDescriptions, {});
  const ctx = directorAITaskContext(b, project);
  assert.equal(ctx.descriptions[0].evidence, 'unverified_user_report');
  assert.equal(ctx.descriptions[0].assetId, 'a1');
});
test('planificar antes de grabar conserva lista de ideas', () => {
  let b = createDirectorBrief({goal:'Quiero grabar un tutorial',mode:'preproduction'});
  b = addShotIdea(b,{description:'Plano de apertura',durationSeconds:3});
  const restored = restoreDirectorDraftRecord(createDirectorDraftRecord(b));
  assert.deepEqual(restored.shotIdeas.map(s=>s.description), ['Plano de apertura']);
});
test('un borrador corrupto o sobre el límite no pasa a la IA', () => {
  assert.throws(()=>restoreDirectorDraftRecord('{"schema":"otra"}'),/compatible/);
  assert.throws(()=>restoreDirectorDraftRecord('{invalido'),/JSON/);
  const b = createDirectorBrief({ goal: 'Mi video' });
  b.utterances = Array.from({length:51},(_,i)=>({text:'x',source:'typed',kind:'request',order:i+1}));
  assert.throws(()=>restoreDirectorDraftRecord(JSON.stringify({...JSON.parse(createDirectorDraftRecord(b))})),/inválidas/);
  assert.equal(directorAITaskContext(null,createProject()),null);
});
test('el contexto enviado por el usuario no contiene URL ni medios binarios', () => {
  const project = createProject({assets:[{id:'a1',name:'cámara.mov',url:'data:SECRET',duration:10}]});
  const b = createDirectorBrief({ goal: 'Video de paseo' });
  const ctx = directorAITaskContext(b,project);
  assert.ok(!JSON.stringify(ctx).includes('SECRET'));
  assert.match(ctx.limits,/NO pruebas/);
});
