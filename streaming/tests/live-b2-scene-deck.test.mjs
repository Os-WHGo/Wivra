import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStudioState, preflightScene, cueScene, takePreview, pressDeck,
  updateAssetCache, observeEncoder, makeEditingLog
} from '../live/scene-deck.mjs';

const full = {x:0,y:0,width:1,height:1};
const tiny = {x:.12,y:.1,width:.3,height:.3};
const data = () => ({
  projectId:'walking-tour-1',
  assets:[
    {id:'meme-cat',kind:'image',source:'pack',cached:true},
    {id:'intro-video',kind:'video',source:'user',cached:true},
    {id:'optional-video',kind:'video',source:'provider',cached:false},
    {id:'intro-music',kind:'audio',source:'included',cached:true}
  ],
  scenes:[
    {id:'walk',layout:'single',layers:[{id:'main',kind:'camera',inputId:'rayban-dat',rect:full}]},
    {id:'reaction',layout:'pip',layers:[
      {id:'base',kind:'camera',inputId:'rayban-dat',rect:full},
      {id:'mini',kind:'video',assetId:'intro-video',rect:{...tiny}}
    ]},
    {id:'news',layout:'single',layers:[{id:'cg',kind:'cg',text:'Última hora',rect:full}]},
    {id:'remote',layout:'single',layers:[{id:'remote',kind:'video',assetId:'optional-video',rect:full}]}
  ],
  deck:[
    {slot:1,action:'take_scene',targetId:'walk'},
    {slot:2,action:'take_scene',targetId:'reaction'},
    {slot:3,action:'show_image',targetId:'meme-cat'},
    {slot:4,action:'play_video',targetId:'intro-video'},
    {slot:5,action:'clear_media'},
    {slot:6,action:'take_scene',targetId:'news'}
  ]
});
const cameras={readyCameraInputs:['rayban-dat']};

test('proyecto LIVE creado sin comenzar una transmisión ni grabar contenido', () => {
  const state=createStudioState(data());
  assert.equal(state.schema,'wivra-live-scene-deck-v1');
  assert.equal(state.canvas,'9:16');
  assert.equal(state.transport.status,'offline');
  assert.equal(state.programSceneId,null);
  assert.equal(makeEditingLog(state).mediaRecorded,false);
  assert.ok(!JSON.stringify(state).includes('https:'));
});

test('el operador prepara una escena solo si su cámara fue verificada', () => {
  const s=createStudioState(data());
  assert.deepEqual(preflightScene(s,'walk'),{
    ok:false,problems:['Cámara no verificada: rayban-dat']
  });
  assert.throws(()=>cueScene(s,'walk',1000),/No se puede preparar/);
  const preview=cueScene(s,'walk',1000,cameras);
  assert.equal(preview.previewSceneId,'walk');
  assert.equal(preview.programSceneId,null);
  assert.equal(preview.events[0].type,'scene-preview');
  assert.equal(s.events.length,0,'state is immutable');
});

test('cambiar de previsualización a programa no afirma emitir si el encoder está desconectado',()=>{
  let s=createStudioState(data());
  s=cueScene(s,'reaction',1000,cameras);
  s=takePreview(s,1050,cameras);
  assert.equal(s.programSceneId,'reaction');
  assert.equal(s.transport.status,'offline');
  assert.equal(s.events.at(-1).transportAtTake,'offline');
  assert.equal(makeEditingLog(s).mediaRecorded,false);
});

test('LIVE solo aparece tras confirmación externa explícita del encoder',()=>{
  let s=createStudioState(data());
  assert.throws(()=>observeEncoder(s,'live','encoder-stopped',0),/Cannot claim LIVE/);
  s=observeEncoder(s,'ready','encoder-ack',0);
  s=observeEncoder(s,'live','encoder-ack',15);
  assert.equal(s.transport.status,'live');
  s=pressDeck(s,6,150); // CG no necesita cámara ni red
  assert.equal(s.programSceneId,'news');
  assert.equal(s.events.at(-1).transportAtTake,'live');
  s=observeEncoder(s,'stopped','encoder-stopped',200);
  assert.equal(s.transport.status,'stopped');
  assert.equal(makeEditingLog(s).encoderValidated,false,'planner log is not proof of physical encoder');
});

test('Deck de un toque: toma, meme, video, limpiar y log temporal para edición',()=>{
  let s=createStudioState(data());
  s=pressDeck(s,1,200,cameras);
  s=pressDeck(s,3,205);
  assert.deepEqual(s.activeMedia,{assetId:'meme-cat',kind:'image'});
  s=pressDeck(s,4,240);
  assert.deepEqual(s.activeMedia,{assetId:'intro-video',kind:'video'});
  s=pressDeck(s,5,270);
  assert.equal(s.activeMedia,null);
  const log=makeEditingLog(s);
  assert.deepEqual(log.events.map(e=>e.type),[
    'scene-preview','scene-take','image-show','video-trigger','media-clear'
  ]);
  assert.deepEqual(log.events.map(e=>e.atMs),[200,200,205,240,270]);
  assert.ok(log.events.every((e,i)=>e.sequence===i+1));
});

test('asset descargable NO entra LIVE antes de estar en caché',()=>{
  let s=createStudioState(data());
  assert.equal(preflightScene(s,'remote').ok,false);
  assert.throws(()=>cueScene(s,'remote',100),/no descargado/);
  s=updateAssetCache(s,'optional-video',true,100);
  s=cueScene(s,'remote',110);
  assert.equal(s.previewSceneId,'remote');
  assert.equal(s.assets.find(a=>a.id==='optional-video').cached,true);
});

test('toma rechazada si falta cámara al ejecutarla aunque haya estado preparada',()=>{
  let s=cueScene(createStudioState(data()),'walk',100,cameras);
  assert.throws(()=>takePreview(s,200),/No se puede pasar/);
  assert.equal(s.programSceneId,null);
});

test('el reloj y el orden de eventos son deterministas, sin tiempos negativos o retrocesos',()=>{
  let s=createStudioState(data());
  assert.throws(()=>pressDeck(s,3,-1),/Event time/);
  s=pressDeck(s,3,30);
  assert.throws(()=>pressDeck(s,4,29),/Event time/);
  assert.throws(()=>pressDeck(s,4,NaN),/Event time/);
  assert.equal(s.events.length,1);
});

test('no se puede usar recurso remoto sin descarga, slot inexistente ni tipo incorrecto',()=>{
  const s=createStudioState(data());
  assert.throws(()=>pressDeck(s,0,0),/unassigned/);
  assert.throws(()=>pressDeck(s,9,0),/unassigned/);
  const spec=data();
  spec.deck=[{slot:4,action:'play_video',targetId:'meme-cat'}];
  assert.throws(()=>createStudioState(spec),/wrong asset type/);
  spec.deck=[{slot:4,action:'play_video',targetId:'optional-video'}];
  const s2=createStudioState(spec);
  assert.throws(()=>pressDeck(s2,4,0),/downloaded/);
});

test('geometría, compositor y referencias inválidas no pasan al planner',()=>{
  const spec=data();
  spec.scenes[1].layers[1].rect.width=1;
  assert.throws(()=>createStudioState(spec),/normalized/);
  spec.scenes[1].layers[1].rect=tiny;
  spec.scenes[1].layers[1].assetId='missing';
  assert.throws(()=>createStudioState(spec),/missing/);
  spec.scenes[1].layers[1].assetId='intro-video';
  spec.deck.push({slot:1,action:'show_image',targetId:'meme-cat'});
  assert.throws(()=>createStudioState(spec),/Duplicate deck slot/);
});

test('no se aceptan elementos de CGI ejecutable ni nombres de archivo o URL como media bytes',()=>{
  const spec=data();
  spec.assets[0]={id:'meme-cat',kind:'shader',source:'provider',cached:true};
  assert.throws(()=>createStudioState(spec),/Invalid asset/);
  const spec2=data();
  spec2.scenes[2].layers[0].text='x'.repeat(181);
  assert.throws(()=>createStudioState(spec2),/CG layer/);
});

test('no se agregan entradas inexistentes de cámaras Meta+frontal al cambiar el layout',()=>{
  const spec=data();
  spec.scenes[0].layers.push({id:'selfie',kind:'camera',inputId:'iphone-front',rect:{...tiny}});
  spec.scenes[0].layout='pip';
  const s=createStudioState(spec);
  const check=preflightScene(s,'walk',cameras);
  assert.equal(check.ok,false);
  assert.match(check.problems.join(','),/iphone-front/);
});
