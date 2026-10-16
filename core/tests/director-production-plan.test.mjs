import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRODUCTION_FORMATS, createOfflineProduction, reorderOfflineProduction,
  reviewProductionShot, productionProgress, understandDirectorCommand
} from '../director-production-plan.mjs';

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
  assert.equal(p.route.geographicallyOptimized,false);
  assert.equal(p.route.gpsUsed,false);
  assert.equal(p.route.method,'user_order_only');
  assert.equal(p.shots[0].script,'Texto proporcionado por quien graba');
  assert.ok(p.shots.every(s=>s.suggestedRawSeconds>s.targetSeconds));
  assert.deepEqual(PRODUCTION_FORMATS,['reel','vertical_minidoc','vertical_series','vertical_film']);
});
test('No inventa nombres de lugares, historia, hechos ni guiones automáticos',()=>{
  const p=createOfflineProduction({title:'Viaje',locations:['Mi parque']});
  assert.equal(p.shots[0].script,'');
  assert.equal(p.shots[0].placeName,'Mi parque');
  assert.match(p.notes.join(' '),/datos de los lugares provienen del usuario/);
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
  assert.equal(reviewProductionShot(skipped,'shot-2','accepted').shots[2].mediaAssetId,null);
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
test('Valida campos y límites; nunca inserta enlaces externos en un guion',()=>{
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
