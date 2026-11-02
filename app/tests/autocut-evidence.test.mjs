import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTOCUT_TIMED_SCHEMA,normalizeTimedSpeech,bestTimedWindow,timedSpeechFromSingleClipCues } from '../autocut-evidence.mjs';
import { readFileSync } from 'node:fs';
import { makeAutoPicker } from '../autocut.mjs';
import { planQuickAssembly } from '../quick-assembly.mjs';
import { createProject } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';
const contract = (segments, extra = {}) => ({
  schema:AUTOCUT_TIMED_SCHEMA,source:'local_asr',granularity:'word',
  durationSeconds:60,segments,...extra
});
const speech = contract(Array.from({length:8},(_,i)=>({start:44+i,end:44.65+i,text:'palabra'})));

test('preferencia por palabras cronometradas, no por la mitad silenciosa',()=>{
  const r=bestTimedWindow(speech,0,60,10);
  assert.ok(r && r.moved,JSON.stringify(r));
  assert.ok(r.start>=41.5 && r.start<=44,JSON.stringify(r));
  assert.ok(r.start+10 >= 51.65);
  assert.equal(r.method,'timestamped_speech_boundaries');
});
test('AutoCut sigue usando la misma interfaz de picker y operaciones del editor',()=>{
  let p=createProject({assets:[{id:'a1',duration:60,name:'walking.mp4'}]});
  p=applyBatch(p,[{op:'add_clip',asset_id:'a1',start:0}]).project;
  const pick=makeAutoPicker(id=>id==='a1'?{timedSpeech:speech}:null);
  const pl=planQuickAssembly(p,{targetSeconds:10,pick});
  assert.equal(pl.ok,true);assert.equal(pl.picked,1);
  const applied=applyBatch(p,pl.ops);
  assert.equal(applied.ok,true,JSON.stringify(applied));
  assert.ok(applied.project.clips[0].in>=41.5);
  assert.ok(applied.project.clips[0].out>=51.65);
  assert.equal(applied.project.clips[0].out-applied.project.clips[0].in,10);
});
test('tiempos relativos al medio: un clip ya recortado no sale de sus límites',()=>{
  const evidence=contract([{start:49,end:50,text:'hola'},{start:51,end:53,text:'vista'}]);
  const r=bestTimedWindow(evidence,20,55,8);
  assert.ok(r && r.moved,JSON.stringify(r));
  assert.ok(r.start>=20 && r.start+8<=55);
});
test('no se trata ruido, diferencias visuales ni lenguaje inventado como palabras reales',()=>{
  assert.equal(bestTimedWindow({...contract([]),visualChanges:[{time:50,delta:0.9}]},0,60,10),null);
  assert.equal(bestTimedWindow({schema:'otra',segments:speech.segments},0,60,10),null);
  assert.equal(bestTimedWindow({...speech,source:'provider_untrusted'},0,60,10),null);
  assert.equal(bestTimedWindow({...speech,segments:[{start:50,end:65,text:'fuera'}]},0,60,10),null);
  assert.equal(bestTimedWindow({...speech,segments:[{start:5,end:7,text:''}]},0,60,10),null);
  assert.equal(bestTimedWindow({...speech,segments:[{start:50,end:51,text:'a',confidence:2}]},0,60,10),null);
  assert.equal(bestTimedWindow(speech,50,80,5),null);
  assert.equal(normalizeTimedSpeech({...speech,granularity:'inventada'}),null);
});
test('segmentos con tiempo de frase se distinguen de precisión por palabra',()=>{
  const r=bestTimedWindow(contract([{start:40,end:50,text:'frase aproximada'}],{granularity:'segment'}),0,60,12);
  assert.ok(r && r.moved);assert.equal(r.granularity,'segment');
});
test('evidencia inválida puede caer en el AutoCut actual de volumen sin alterar resultados anteriores',()=>{
  const env=new Float32Array(3000).fill(-80);
  for(let i=2000;i<2400;i++)env[i]=-20;
  const pick=makeAutoPicker(()=>({env,win:0.02,timedSpeech:{schema:'mal'}}));
  const start=pick({asset_id:'a1',in:0,out:60},8);
  assert.ok(Number.isFinite(start) && start >= 39 && start <= 41,'start='+start);
});
test('duraciones extensas siguen siendo analizables sin crear segmentos ficticios',()=>{
  const durationSeconds=2700,segments=[];
  for(let i=0;i<11500;i++)segments.push({start:i*.23,end:i*.23+.12,text:'w'});
  const r=bestTimedWindow(contract(segments,{durationSeconds}),0,2700,60);
  assert.ok(r && Number.isFinite(r.start),JSON.stringify(r));
  assert.ok(r.start>=0&&r.start<=2640);
});

test('SRT importado: convierte tiempo de timeline a tiempo de MEDIO con offset y recorte, sin fingir ASR',()=>{
  const asset={id:'a1',duration:60,name:'walk.mp4'};
  let project=applyBatch(createProject({assets:[asset]}),[{op:'add_clip',asset_id:'a1',start:5}]).project;
  project=applyBatch(project,[{op:'trim_clip',clip_id:project.clips[0].id,in:10,out:60}]).project;
  const r=timedSpeechFromSingleClipCues(project,[{start:7,end:9,text:'paisaje'},{start:58,end:65,text:'fuera'}]);
  assert.equal(r.assetId,'a1');
  assert.equal(r.evidence.source,'timestamped_import');
  assert.equal(r.evidence.granularity,'segment');
  assert.deepEqual(r.evidence.segments,[{start:12,end:14,text:'paisaje'}]);
});
test('Nunca asociar automáticamente subtítulos de varios clips a un asset único',()=>{
  let p=createProject({assets:[{id:'a1',duration:60},{id:'a2',duration:30}]});
  p=applyBatch(p,[{op:'add_clip',asset_id:'a1',start:0},{op:'add_clip',asset_id:'a2',start:60}]).project;
  assert.equal(timedSpeechFromSingleClipCues(p,[{start:10,end:11,text:'uno'}]),null);
  assert.equal(timedSpeechFromSingleClipCues({...p,clips:[]},[{start:10,end:11,text:'uno'}]),null);
});
test('Rechazar audio inexistente, cue sin texto o tiempos fuera de la toma',()=>{
  let p=applyBatch(createProject({assets:[{id:'a1',duration:60,name:'walk.mp4'}]}),[{op:'add_clip',asset_id:'a1'}]).project;
  assert.equal(timedSpeechFromSingleClipCues(p,[{start:61,end:62,text:'fuera'}]),null);
  assert.equal(timedSpeechFromSingleClipCues(p,[{start:1,end:2,text:''}]),null);
  assert.equal(timedSpeechFromSingleClipCues(p,[]),null);
  assert.equal(timedSpeechFromSingleClipCues(p,[{start:9,end:9,text:'malo'}]),null);
  const valid=timedSpeechFromSingleClipCues(p,[{start:44,end:52,text:'voz'}]);
  const pick=makeAutoPicker(id=>id==='a1'?{timedSpeech:valid.evidence}:null);
  const result=planQuickAssembly(p,{targetSeconds:10,pick});
  assert.equal(result.ok,true);assert.equal(result.picked,1);
  assert.ok(result.items[0].to[0]>40);
});
test('Importación SRT/VTT se asocia a AutoCut solamente mediante importación satisfactoria y sesión activa',()=>{
  const html=readFileSync(new URL('../template.html',import.meta.url),'utf8');
  assert.match(html,/const timed = timedSpeechFromSingleClipCues\(session\.project, r\.cues\)/);
  assert.match(html,/const res = run\(ops\); if \(!res\.ok\)/);
  assert.match(html,/siTimed\.get\(session\)/);
  assert.match(html,/timedSpeech: captions/);
});
