import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {recordExperimentalNativeMultitrack as run,
  saveVerifiedAcceleratedVideoToPhotos}
  from '../accelerated-native-multitrack-export.mjs';

// Test-only codec implementations. The real native workflow MUST use
// WebView/WKWebView's VideoEncoder/AudioEncoder.isConfigSupported instead.
const originalVideoEncoder=globalThis.VideoEncoder;
const originalAudioEncoder=globalThis.AudioEncoder;
test.before(()=>{
 globalThis.VideoEncoder={isConfigSupported:async config=>({supported:true,config})};
 globalThis.AudioEncoder={isConfigSupported:async config=>({supported:true,config})};
});
test.after(()=>{
 if(originalVideoEncoder===undefined)delete globalThis.VideoEncoder;
 else globalThis.VideoEncoder=originalVideoEncoder;
 if(originalAudioEncoder===undefined)delete globalThis.AudioEncoder;
 else globalThis.AudioEncoder=originalAudioEncoder;
});

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

test('verified iPhone QA can save a new Photos copy only with explicit opt-in',async()=>{
 const host=fakeHost(),log=[],M=fakeM(log),old=globalThis.document;
 host.platform='ios';
 const native=host.request.bind(host);
 host.request=async message=>{
  if(message.op==='finishRandom')return {...await native(message),token:101};
  if(message.op==='savePhotos'){
   assert.equal(message.token,101);
   host.ops.push('savePhotos');
   return {savedToPhotos:true};
  }
  return native(message);
 };
 globalThis.document=documentFake();
 try {
  const out=await run({project:project(),media,M,host,expectAudio:false,
   experimentalAccelerated:true,saveToPhotos:true});
  assert.equal(out.saved.verified,true);
  assert.equal(out.verifiedOnDevice,false);
  assert.deepEqual(out.photos,{requested:true,saved:true,privateCopyPreserved:true});
  assert.deepEqual(host.ops,
   ['helloRandom','beginRandom','finishRandom','savePhotos']);
 }finally{globalThis.document=old;}
});

test('Photos denial never deletes the verified private output or advertises gallery success',async()=>{
 const host=fakeHost(),M=fakeM([]),old=globalThis.document;
 host.platform='ios';
 const native=host.request.bind(host);
 host.request=async message=>{
  if(message.op==='finishRandom')return {...await native(message),token:101};
  if(message.op==='savePhotos'){
   host.ops.push('savePhotos');
   throw Error('Permiso de Fotos denegado');
  }
  return native(message);
 };
 globalThis.document=documentFake();
 try {
  const out=await run({project:project(),media,M,host,expectAudio:false,
   experimentalAccelerated:true,saveToPhotos:true});
  assert.equal(out.verifiedNative,true);
  assert.equal(out.photos.saved,false);
  assert.equal(out.photos.privateCopyPreserved,true);
  assert.match(out.photos.error,/denegado/);
  assert.ok(!host.ops.includes('abortRandom'));
 }finally{globalThis.document=old;}
});

test('Photos never runs on default, Android, forged receipts or unconfirmed requests',async()=>{
 const host=fakeHost(),M=fakeM([]);
 await assert.rejects(run({project:project(),media,M,host,expectAudio:false,
  experimentalAccelerated:true,saveToPhotos:true}),/Fotos acelerado/);
 await assert.rejects(run({project:project(),media,M,host,expectAudio:false,
  experimentalAccelerated:true,saveToPhotos:'true'}),/Fotos acelerado/);
 assert.deepEqual(host.ops,[]);
 host.platform='ios';
 const fake={verified:true,token:101,bytes:100,
  sha256:'a'.repeat(64),media:{video:true,durationMs:400}};
 await assert.rejects(saveVerifiedAcceleratedVideoToPhotos({
  host,saved:fake}),/confirmación explícita/);
 await assert.rejects(saveVerifiedAcceleratedVideoToPhotos({
  host,saved:{...fake,sha256:'invalid'},userConfirmed:true}),/verificado/);
 assert.deepEqual(host.ops,[]);
});

test('native v2 rejects misleading tiny storage estimates before opening or claiming success',async()=>{
 const host=fakeHost(),log=[],M=fakeM(log),old=globalThis.document;
 globalThis.document=documentFake();
 try {
  await assert.rejects(run({project:project(),media,M,host,expectAudio:false,
   experimentalAccelerated:true,estimatedBytes:1
  }),/Reserva manual insuficiente/);
  assert.deepEqual(host.ops,[]);
  assert.ok(log.includes('input-dispose'));
 }finally{globalThis.document=old;}
});

test('native v2 sends automatic conservative reservation and preserves exact output-byte verification',async()=>{
 const host=fakeHost(),log=[],M=fakeM(log),old=globalThis.document;
 const original=host.request.bind(host);let estimated=null;
 host.request=async request=>{
  if(request.op==='beginRandom')estimated=request.estimatedBytes;
  return original(request);
 };
 globalThis.document=documentFake();
 try {
  const res=await run({project:project(),media,M,host,expectAudio:false,
   experimentalAccelerated:true});
  assert.ok(Number.isSafeInteger(estimated) && estimated>=16*1024*1024);
  assert.equal(res.verifiedNative,true);
  assert.equal(res.saved.bytes,res.render.outputBytes);
  assert.deepEqual(host.ops,['helloRandom','beginRandom','finishRandom']);
 }finally{globalThis.document=old;}
});

test('oversized explicit reservation does not create a temp native file',async()=>{
 const host=fakeHost(),log=[],M=fakeM(log),old=globalThis.document;
 globalThis.document=documentFake();
 try {
  await assert.rejects(run({project:project(),media,M,host,expectAudio:false,
   experimentalAccelerated:true,estimatedBytes:17*1024**3
  }),/Reserva manual insuficiente/);
  assert.deepEqual(host.ops,[]);
 }finally{globalThis.document=old;}
});

test('optimistic Mediabunny but missing WebCodecs encoder fails before any v2 native file is opened',async()=>{
 const host=fakeHost(),M=fakeM([]),previous=globalThis.VideoEncoder;
 globalThis.VideoEncoder={isConfigSupported:async()=>({supported:false})};
 try {
  await assert.rejects(run({project:project(),media,M,host,expectAudio:false,
   experimentalAccelerated:true}),/Preflight WebCodecs móvil/);
  assert.deepEqual(host.ops,[]);
 }finally{globalThis.VideoEncoder=previous;}
});
test('native preflight explicitly returns codec capability evidence after verified render',async()=>{
 const host=fakeHost(),M=fakeM([]),prior=globalThis.document;
 globalThis.document=documentFake();
 try{
  const result=await run({project:project(),media,M,host,
   expectAudio:false,experimentalAccelerated:true});
  assert.deepEqual(result.codecCapabilities,{
   supported:true,platform:'android',videoCodec:'avc',
   audioCodec:null,container:'mp4',width:320,height:180,
   fps:30,sampleRate:48000,audioChecked:false
  });
 }finally{globalThis.document=prior;}
});

test('WebCodecs claiming success with a changed AVC frame size never opens native v2',async()=>{
 const host=fakeHost(),log=[],M=fakeM(log),prior=globalThis.VideoEncoder;
 globalThis.VideoEncoder={
  isConfigSupported:async config=>({
   supported:true,config:{...config,width:config.width+16}
  })
 };
 try {
  await assert.rejects(run({project:project(),media,M,host,expectAudio:false,
   experimentalAccelerated:true}),/no confirmó resolución, FPS, perfil y bitrate exactos/);
  assert.deepEqual(host.ops,[]);
  assert.ok(log.includes('input-dispose'));
 } finally {
  globalThis.VideoEncoder=prior;
 }
});
