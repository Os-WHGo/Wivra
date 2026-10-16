import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTION_FORMATS, createOfflineProduction, reorderOfflineProduction,
  reviewProductionShot, productionProgress, understandDirectorCommand
} from '../director-production-plan.mjs';
import {progress as checklistProgress, updateShot, validateProviderShotPlan} from '../shoot-checklist.mjs';

const plan = () => createOfflineProduction({
  title:'Mi recorrido', format:'vertical_minidoc', durationSeconds:61,
  locations:[
    {name:'Lugar A', script:'Texto proporcionado por quien graba'},
    {name:'Lugar B', note:'Dato pendiente de confirmar'},
    {name:'Lugar C', shootHint:'Graba un detalle del lugar'}
  ]
});
test('P0 gratuito: esquema portable y duración exacta, sin API, GPS ni inventar ruta', () => {
  const p=plan();
  assert.equal(p.shots.length,3);
  assert.deepEqual(p.shots.map(s=>s.targetSeconds),[21,20,20]);
  assert.equal(p.shots.reduce((n,s)=>n+s.targetSeconds,0),61);
  assert.equal(p.schema,'agentcut-shoot-plan-v0.1');
  assert.equal(p.production.route.geographicallyOptimized,false);
  assert.equal(p.production.route.gpsUsed,false);
  assert.equal(p.production.route.method,'user_order_only');
  assert.equal(p.shots[0].script,'Texto proporcionado por quien graba');
  assert.ok(p.shots.every(s=>s.suggestedRawSeconds>s.targetSeconds));
  assert.deepEqual(PRODUCTION_FORMATS,['reel','vertical_minidoc','vertical_series','vertical_film']);
});
test('No inventa nombres de lugares, historia, hechos ni guiones automáticos',()=>{
  const p=createOfflineProduction({title:'Viaje',locations:['Mi parque']});
  assert.equal(p.shots[0].script,'');
  assert.equal(p.shots[0].placeName,'Mi parque');
  assert.match(p.warnings.join(' '),/Datos y guion aportados por usuario/);
});
test('Orden manual, revisiones sin mutar objeto y progreso preciso',()=>{
  const first=plan();
  const reordered=reorderOfflineProduction(first,['shot-3','shot-1','shot-2']);
  assert.deepEqual(reordered.shots.map(s=>s.id),['shot-3','shot-1','shot-2']);
  assert.equal(first.shots[0].id,'shot-1');
  const approved=reviewProductionShot(reordered,'shot-3','accepted',{assetId:'a1',project:{assets:[{id:'a1'}]}});
  const skipped=reviewProductionShot(approved,'shot-1','skipped');
  assert.deepEqual(productionProgress(skipped),{
    accepted:1,skipped:1,total:3,remaining:1,nextShotId:'shot-2',linkedMedia:1,readyForManualReview:false
  });
  assert.equal(reordered.shots[0].state,'todo');
  assert.equal(reviewProductionShot(skipped,'shot-2','accepted').shots[2].assetId,null);
  assert.equal(checklistProgress(skipped).done,1);
  assert.equal(checklistProgress(skipped).remaining,1);
  assert.equal(skipped.shots[1].state,'skipped');
});
test('Rechaza vinculación inventada, orden parcial y estados arbitrarios',()=>{
  const p=plan();
  assert.throws(()=>reviewProductionShot(p,'shot-1','accepted',{assetId:'a1'}));
  assert.throws(()=>reviewProductionShot(p,'shot-1','skipped',{assetId:'a1',project:{assets:[{id:'a1'}]}}));
  assert.throws(()=>reviewProductionShot(p,'shot-9','accepted'));
  assert.throws(()=>reviewProductionShot(p,'shot-2','broadcast'));
  assert.throws(()=>reorderOfflineProduction(p,['shot-2','shot-2','shot-3']));
  assert.throws(()=>reorderOfflineProduction(p,['shot-2','shot-1']));
});
test('Valida campos y límites; no inventa enlaces externos ni pide una API',()=>{
  for(const format of ['empty','livestream']) assert.throws(()=>createOfflineProduction({title:'X',format,locations:['a']}));
  assert.throws(()=>createOfflineProduction({title:'X',durationSeconds:2,locations:['a','b','c']}));
  assert.throws(()=>createOfflineProduction({title:'X',locations:[{name:''}]}));
  assert.throws(()=>createOfflineProduction({title:'X',locations:Array(31).fill('x')}));
  assert.throws(()=>createOfflineProduction({title:'X',locations:[{name:'x',script:'x'.repeat(2201)}]}));
});
test('Órdenes de Director en distintos idiomas producen solamente intenciones, no ejecuciones',()=>{
  const examples=[
    ['Siguiente','next'],['NEXT SHOT!','next'],['Próximo','next'],['次へ','next'],
    ['repítE.','repeat'],['Répète','repeat'],['Wiederholen','repeat'],
    ['ya la hice','accepted'],['Fatto','accepted'],['拍好了','accepted'],
    ['no me gustó','retry'],['Retake','retry'],['撮り直し','retry'],
    ['saltar','skipped'],['Skip','skipped'],['Pular','skipped']
  ];
  for(const [utterance,action] of examples){
    const parsed=understandDirectorCommand(utterance);
    assert.equal(parsed?.action,action,utterance);
    assert.equal(parsed?.scope,'director_shot_plan',utterance);
  }
  assert.equal(understandDirectorCommand('publica en YouTube'),null);
  assert.equal(understandDirectorCommand('inicia transmisión'),null);
  assert.equal(understandDirectorCommand('el café me gustó'),null);
  assert.equal(understandDirectorCommand(''),null);
});

test('El plan offline ES el checklist existente, no un segundo sistema',()=>{
 const p=plan();
 assert.equal(p.schema,'agentcut-shoot-plan-v0.1');
 const original=validateProviderShotPlan({shots:[{title:'Lugar',direction:'Graba',durationSeconds:12}]},{subject:'Mi viaje'});
 assert.equal(original.schema,p.schema);
 // The original editor API can update a new offline production shot.
 const changed=updateShot(p,'shot-1',{note:'Cámara de calle'});
 assert.equal(changed.shots[0].note,'Cámara de calle');
 assert.equal(changed.production.title,'Mi recorrido');
 assert.equal(changed.shots[0].state,'todo');
});
test('Repetir toma no cuenta como capturada; saltar tampoco inventa un video',()=>{
 const p=plan();
 const retry=reviewProductionShot(p,'shot-1','retry');
 assert.equal(retry.shots[0].state,'retry');
 assert.equal(checklistProgress(retry).remaining,3);
 const skipped=reviewProductionShot(retry,'shot-2','skipped');
 assert.equal(checklistProgress(skipped).done,0);
 assert.equal(checklistProgress(skipped).remaining,2);
 assert.equal(productionProgress(skipped).skipped,1);
 assert.equal(productionProgress(skipped).linkedMedia,0);
 assert.equal(productionProgress(skipped).readyForManualReview,false);
 const accepted=reviewProductionShot(skipped,'shot-3','accepted',{assetId:'video-1',project:{assets:[{id:'video-1'}]}});
 const approved=reviewProductionShot(accepted,'shot-1','accepted',{assetId:'video-2',project:{assets:[{id:'video-2'}]}});
 assert.equal(checklistProgress(approved).remaining,0);
 assert.equal(checklistProgress(approved).done,2);
 assert.equal(productionProgress(approved).linkedMedia,2);
 assert.equal(productionProgress(approved).readyForManualReview,true);
});
test('No mezcla un plan externo desconocido con el adaptador de producción',()=>{
 const other=validateProviderShotPlan({shots:[{title:'X',direction:'Y',durationSeconds:5}]},{subject:'X'});
 assert.throws(()=>productionProgress(other));
 assert.throws(()=>reorderOfflineProduction(other,['shot-1']));
 assert.throws(()=>reviewProductionShot(other,'shot-1','accepted'));
});
