import test from 'node:test';
import assert from 'node:assert/strict';
import {createCodecDiagnosticJournal as journal} from '../accelerated-codec-diagnostic-journal.mjs';

const key='wivra.qa.codec-diagnostic.v1';
const configuration={width:320,height:240,fps:30};
function memoryStorage(initial){
 const data=new Map(initial===undefined?[]:[[key,initial]]),operations=[];
 return {data,operations,getItem(k){operations.push(['get',k]);return data.get(k)??null;},
  setItem(k,value){operations.push(['set',k]);data.set(k,value);},
  removeItem(k){operations.push(['remove',k]);data.delete(k);}};
}
const completed=['environment','exact-support','encode','mux','container','decode','playback'];

test('synthetic receipt survives a reload and consumes interrupted stage once',()=>{
 const storage=memoryStorage(),first=journal(storage);
 assert.equal(first.begin(configuration),true);
 assert.equal(first.stage('environment'),true);
 assert.equal(first.stage('exact-support'),true);
 const reloaded=journal(storage),report=reloaded.recover();
 assert.equal(report.code,'diagnostic-interrupted');assert.equal(report.failedStage,'encode');
 assert.equal(report.outcome,'failed');assert.equal(report.synthetic,true);
 assert.equal(report.productionEligible,false);assert.equal(report.physicalDeviceVerified,false);
 assert.deepEqual(report.stages,[{stage:'environment',status:'passed'},
  {stage:'exact-support',status:'passed'},{stage:'encode',status:'failed',code:'diagnostic-interrupted'}]);
 assert.equal(report.configuration.video.codec,'avc1.42E01F');
 assert.equal(report.configuration.video.width,320);assert.equal(report.configuration.video.framerate,30);
 assert.equal(report.configuration.audio.codec,'mp4a.40.2');
 assert.equal(storage.data.has(key),false);assert.equal(reloaded.recover(),null);
 assert.equal(journal(storage).recover(),null);
});

test('receipt records only allowlisted configuration and stage fields',()=>{
 const storage=memoryStorage(),j=journal(storage);
 j.begin({...configuration,userAgent:'Mozilla/private-model',url:'https://private.example/token',
  project:{secret:true},error:'secret-stack',timestamp:'private'});
 const record=JSON.parse(storage.data.get(key));
 assert.deepEqual(record,{schemaVersion:1,synthetic:true,pending:true,...configuration,
  lastCompleted:null,nextStage:'environment'});
 assert.doesNotMatch(storage.data.get(key),/private|Mozilla|https|project|secret|timestamp/);
 const report=journal(storage).recover();
 assert.doesNotMatch(JSON.stringify(report),/private|Mozilla|https|project|secret|timestamp|OOM|crash/);
 assert.ok(storage.operations.every(([,usedKey])=>usedKey===key),'Only dedicated QA key is touched');
});

test('only sequential completed callbacks advance and full completion removes pending receipt',()=>{
 const storage=memoryStorage(),j=journal(storage);j.begin(configuration);
 for(const stage of ['encode','unknown','playback','https://private.example'])
  assert.equal(j.stage(stage),false);
 assert.equal(JSON.parse(storage.data.get(key)).nextStage,'environment');
 for(const [i,stage] of completed.entries()){
  assert.equal(j.stage(stage),true);assert.equal(j.stage(stage),false);
  if(i<completed.length-1){
   const record=JSON.parse(storage.data.get(key));
   assert.equal(record.lastCompleted,stage);assert.equal(record.nextStage,completed[i+1]);
  }
 }
 assert.equal(storage.data.has(key),false);assert.equal(j.recover(),null);
});

test('new run resets prior progression and clear does not retain completion claims',()=>{
 const storage=memoryStorage(),j=journal(storage);j.begin(configuration);
 j.stage('environment');j.stage('exact-support');j.stage('encode');
 assert.equal(j.begin({width:1920,height:1080,fps:60}),true);
 const report=journal(storage).recover();
 assert.equal(report.failedStage,'environment');assert.equal(report.stages.length,1);
 assert.equal(report.configuration.video.codec,'avc1.64002A');
 j.begin(configuration);assert.equal(j.clear(),true);assert.equal(j.recover(),null);
 assert.equal(j.stage('environment'),false);
});

test('missing, throwing and full storage stay advisory and do not throw',()=>{
 for(const storage of [undefined,null,{},
  {getItem(){throw Error('private storage error');},setItem(){throw Error('quota');},removeItem(){throw Error('blocked');}}]){
  const j=journal(storage);
  assert.equal(j.begin(configuration),false);assert.equal(j.stage('environment'),false);
  assert.equal(j.clear(),false);assert.equal(j.recover(),null);
 }
 const storage=memoryStorage(),j=journal(storage);j.begin(configuration);
 storage.setItem=()=>{throw Error('quota');};
 assert.equal(j.stage('environment'),false);assert.equal(storage.data.has(key),false);
});

test('recovery is once per instance even if storage removal is blocked',()=>{
 const storage=memoryStorage(),first=journal(storage);first.begin(configuration);
 storage.removeItem=()=>{throw Error('blocked');};
 const resumed=journal(storage);
 assert.equal(resumed.recover().code,'diagnostic-interrupted');
 assert.equal(resumed.recover(),null);
});

test('malformed, oversized and contradictory receipts are ignored and removed',()=>{
 const storage=memoryStorage();journal(storage).begin(configuration);
 const base=JSON.parse(storage.data.get(key));
 for(const raw of ['{', 'x'.repeat(2049),'null','[]',
  JSON.stringify({...base,schemaVersion:2}),JSON.stringify({...base,synthetic:false}),
  JSON.stringify({...base,pending:false}),JSON.stringify({...base,width:321}),
  JSON.stringify({...base,nextStage:'encode'}),JSON.stringify({...base,lastCompleted:'unrecognized'}),
  JSON.stringify({...base,lastCompleted:'playback',nextStage:'playback'}),
  JSON.stringify({...base,url:'https://private.example'}),
  JSON.stringify({...base,lastCompleted:'environment',nextStage:'environment'})]){
  const bad=memoryStorage(raw);assert.equal(journal(bad).recover(),null,raw.slice(0,90));
  assert.equal(bad.data.has(key),false);
 }
});

test('invalid requested dimensions/FPS cannot write a pending receipt',()=>{
 for(const bad of [{},null,{width:320,height:240,fps:12},{width:320,height:241,fps:30},
  {width:1920,height:1920,fps:30},{width:4096,height:2160,fps:30},
  {width:'320',height:240,fps:30}]){
  const storage=memoryStorage(),j=journal(storage);
  assert.equal(j.begin(bad),false);assert.equal(storage.data.has(key),false);
 }
});
