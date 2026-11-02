import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {recordExperimentalNativeMultitrack as run}
  from '../accelerated-native-multitrack-export.mjs';

const project=()=>({
 clips:[{id:'c',asset_id:'v',start:0,in:0,out:.4}],
 overlayClips:[],audioClips:[],texts:[],
 format:{aspect:'original',fit:'contain'}
});
const media={v:{url:'blob:test',kind:'video',w:320,h:180,duration:2}};
function fakeM(log) {
 class Input {
  async getPrimaryVideoTrack(){return {};}
  async getPrimaryAudioTrack(){return null;}
  dispose(){log.push('input-dispose');}
 }
 class CanvasSink {
  async getCanvas(t){return {timestamp:t,canvas:{width:320,height:180}};}
 }
 class CanvasSource {async add(){log.push('frame');}}
 class AudioBufferSink {}
 class StreamTarget {constructor(writable){this.writable=writable;}}
 class Output {
  constructor({target}){this.target=target;}
  addVideoTrack(){}
  async start(){log.push('start');}
  async cancel(){log.push('cancel');}
  async finalize(){
   const w=this.target.writable.getWriter();
   await w.write({position:0,data:Uint8Array.from([0,0,0,16,102,116,121,112,1,2,3,4])});
   await w.write({position:8,data:Uint8Array.from([9,10,11,12])});
   w.releaseLock();
   log.push('finalize');
  }
 }
 return {Input,UrlSource:class{},CanvasSink,CanvasSource,AudioBufferSink,
  StreamTarget,Output,ALL_FORMATS:[],Mp4OutputFormat:class{},
  WebMOutputFormat:class{},getFirstEncodableVideoCodec:async()=> 'avc',
  canEncodeAudio:async()=>true};
}
function fakeHost() {
 const ops=[],buffer=new Uint8Array(1024);
 let high=0;
 return {platform:'android',ops,
  async request(request){
   ops.push(request.op);
   if(request.op==='helloRandom')return {protocol:2,randomWrite:true};
   if(request.op==='beginRandom')return {token:101};
   if(request.op==='abortRandom')return {};
   if(request.op==='finishRandom'){
    return {verified:true,bytes:high,
     sha256:createHash('sha256').update(buffer.subarray(0,high)).digest('hex'),
     media:{video:true,audio:false,durationMs:400}};
   }
   throw Error('Unexpected native request');
  },
  async sendWriteAt({seq,position,bytes}){
   buffer.set(bytes,position);
   high=Math.max(high,position+bytes.length);
   return {seq,writtenBytes:bytes.length,maxEnd:high};
  }
 };
}
function documentFake(){
 return {createElement(){
  return {width:320,height:180,getContext(){
   return {fillRect(){},drawImage(){},save(){},restore(){},set fillStyle(v){}};
  }};
 }};
}
test('experimental native multitrack is opt-in and preflights before any native session',async()=>{
 const host=fakeHost(),M=fakeM([]);
 await assert.rejects(run({project:project(),media,M,host,expectAudio:false}),
   /experimental explícito/);
 await assert.rejects(run({project:project(),media,M,host,
   experimentalAccelerated:true}),/declararse explícitamente/);
 const absent=project();absent.clips[0].asset_id='missing';
 await assert.rejects(run({project:absent,media,M,host,expectAudio:false,
   experimentalAccelerated:true}),/preflight/);
 assert.deepEqual(host.ops,[]);
});
test('a real bounded video render travels through random v2 and verifies native final bytes',async()=>{
 const host=fakeHost(),log=[],M=fakeM(log),old=globalThis.document;
 globalThis.document=documentFake();
 try {
  const saved=await run({project:project(),media,M,host,expectAudio:false,
   experimentalAccelerated:true});
  assert.equal(saved.verifiedNative,true);
  assert.equal(saved.verifiedOnDevice,false);
  assert.equal(saved.rendererReadyForProduction,false);
  assert.equal(saved.saved.verified,true);
  assert.equal(saved.render.videoFrames,12);
  assert.deepEqual(host.ops,['helloRandom','beginRandom','finishRandom']);
  assert.equal(log.includes('finalize'),true);
  assert.equal(log.includes('cancel'),false);
  assert.equal(log.includes('input-dispose'),true);
 }finally{globalThis.document=old;}
});
test('mid-render cancellation aborts v2, cancels encoder and never commits media',async()=>{
 const host=fakeHost(),log=[],M=fakeM(log),old=globalThis.document;
 globalThis.document=documentFake();
 let cancelled=false;
 try{
  await assert.rejects(run({project:project(),media,M,host,
   experimentalAccelerated:true,expectAudio:false,
   isCancelled:()=>cancelled,
   onProgress:()=>{cancelled=true;}
  }),/cancelled/);
  assert.ok(host.ops.includes('abortRandom'));
  assert.ok(!host.ops.includes('finishRandom'));
  assert.ok(log.includes('cancel'));
 }finally{globalThis.document=old;}
});
test('iOS codec refusal never opens a native file and leaves v1 untouched',async()=>{
 const host=fakeHost();host.platform='ios';
 const M=fakeM([]);M.getFirstEncodableVideoCodec=async list=>
  list.includes('vp8')?'vp8':null;
 await assert.rejects(run({project:project(),media,M,host,expectAudio:false,
  experimentalAccelerated:true}),/requires H264/);
 assert.deepEqual(host.ops,[]);
});

test('a canvas paint error cannot silently drop frames or publish a partial',async()=>{
 const host=fakeHost(),log=[],M=fakeM(log),old=globalThis.document;
 globalThis.document={createElement(){return {getContext(){
  return {fillRect(){},drawImage(){throw Error('GPU lost');},
   save(){},restore(){},set fillStyle(v){}};
 }};}};
 try{
  await assert.rejects(run({project:project(),media,M,host,
   experimentalAccelerated:true,expectAudio:false}),/could not be painted/);
  assert.ok(host.ops.includes('abortRandom'));
  assert.ok(!host.ops.includes('finishRandom'));
  assert.ok(log.includes('cancel'));
 }finally{globalThis.document=old;}
});
