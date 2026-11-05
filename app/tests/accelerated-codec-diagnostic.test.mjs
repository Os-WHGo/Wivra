import test from 'node:test';
import assert from 'node:assert/strict';
import {runAcceleratedCodecDiagnostic as diagnose,validateDiagnosticMp4}
 from '../accelerated-codec-diagnostic.mjs';

// Fault injection only: these codecs and sinks are mocks. The structural BMFF
// below has no decodable samples and is NEVER evidence of codec compatibility.
// Every deep-path test ends in an explicit failure or cancellation. — Codex
function structuralMp4() {
 const concat=(...parts)=>Uint8Array.from(parts.flatMap(p=>[...p]));
 const box=(type,payload)=>{
  const bytes=new Uint8Array(payload.length+8);
  new DataView(bytes.buffer).setUint32(0,bytes.length);
  bytes.set([...type].map(c=>c.charCodeAt(0)),4);bytes.set(payload,8);return bytes;
 };
 const header=(values,length=32)=>{
  const bytes=new Uint8Array(length),view=new DataView(bytes.buffer);
  for(const [position,value] of values)view.setUint32(position,value);
  return bytes;
 };
 const track=(id,type)=>{
  const handler=new Uint8Array(20);handler.set([...type].map(c=>c.charCodeAt(0)),8);
  return box('trak',concat(box('tkhd',header([[12,id]])),box('mdia',concat(
   box('mdhd',header([[12,48000],[16,48000]])),box('hdlr',handler)))));
 };
 return concat(box('ftyp',new Uint8Array(16)),box('moov',concat(
  box('mvhd',header([[12,1000],[16,1000]])),track(1,'vide'),track(2,'soun'))),
  box('mdat',new Uint8Array(1200)));
}

function mockRuntime(mode='empty-container') {
 const state={encoders:[],frames:[],audio:[],canvases:[],videoOrder:[],audioOrder:[],
  outputs:0,cancel:0,finalize:0,dispose:0,cancelled:false,nextCalls:0};
 const metadata=kind=>({decoderConfig:{codec:kind==='video'?'avc1.42E01F':'mp4a.40.2'}});
 class Frame {
  constructor(canvas,config){Object.assign(this,config);this.closed=false;state.frames.push(this);}
  close(){this.closed=true;}
 }
 class Audio {
  constructor(config){Object.assign(this,config);this.closed=false;state.audio.push(this);}
  close(){this.closed=true;}
 }
 const encoder=kind=>class {
  static async isConfigSupported(config){return {supported:true,config};}
  constructor(callbacks){this.callbacks=callbacks;this.state='unconfigured';this.pending=[];
   this.closed=0;this.flushes=0;this.encodeQueueSize=0;this.emitted=0;this.kind=kind;state.encoders.push(this);}
  configure(config){
   this.config=config;
   if(mode==='configure-failure'&&kind==='video')throw Error('private encoder detail');
   this.state='configured';
  }
  encode(sample){
   if(mode==='encode-queue-hang'&&kind==='video'){
    this.encodeQueueSize++;
    if(this.encodeQueueSize===4)setTimeout(()=>{state.cancelled=true;},30);
   }
   if(mode==='no-video-packets'&&kind==='video')return;
   if(mode==='oversized-packet'&&kind==='video'){
    this.callbacks.output({byteLength:8*1024*1024+1},metadata(kind));return;
   }
   this.pending.push({timestamp:sample.timestamp,duration:sample.duration??21333,
    byteLength:16,kind,index:this.emitted++});
  }
  async flush(){
   this.flushes++;
   if(mode==='b-frame-order'&&kind==='video'&&this.pending.length>=4)
    this.pending=[this.pending[0],this.pending[3],this.pending[1],this.pending[2],...this.pending.slice(4)];
   for(const chunk of this.pending)this.callbacks.output(chunk,metadata(kind));
   this.pending=[];
  }
  close(){this.closed++;this.state='closed';}
 };
 class StreamTarget{constructor(writable){this.writable=writable;}}
 class PacketSource {
  constructor(codec){this.kind=codec==='avc'?'video':'audio';}
  add(packet){
   state[this.kind+'Order'].push(packet.timestamp);
   if(mode==='mux-hang'){
    setTimeout(()=>{state.cancelled=true;},30);return new Promise(()=>{});
   }
   return Promise.resolve();
  }
  close(){}
 }
 class Output {
  constructor({target}){state.outputs++;this.target=target;}
  addVideoTrack(){}addAudioTrack(){}async start(){}
  async finalize(){
   state.finalize++;
   const writer=this.target.writable.getWriter();
   try{
    if(mode==='writer-overrun')await writer.write({position:8*1024*1024,data:new Uint8Array([1])});
    else await writer.write({position:0,data:mode==='audio-iterator-hang'?structuralMp4():new Uint8Array(1001)});
   }finally{writer.releaseLock();}
  }
  async cancel(){state.cancel++;}
 }
 class Input {
  async getTracks(){return [{type:'video',codec:'avc',getDisplayWidth:async()=>320,
   getDisplayHeight:async()=>240,computeDuration:async()=>1,
   getDecoderConfig:async()=>({codec:'avc1.42E01F'})},
  {type:'audio',codec:'aac',getSampleRate:async()=>48000,getNumberOfChannels:async()=>2,
   computeDuration:async()=>1,getDecoderConfig:async()=>({codec:'mp4a.40.2'})}];}
  dispose(){state.dispose++;}
 }
 class CanvasSink {
  async getCanvas(time){return {canvas:{getContext:()=>({getImageData:()=>({
   data:time<0.5?[200,0,0,255]:[0,0,200,255]})})}};}
 }
 class AudioBufferSink {
  buffers(){return {[Symbol.asyncIterator](){return this;},next(){
   state.nextCalls++;setTimeout(()=>{state.cancelled=true;},30);return new Promise(()=>{});
  }};}
 }
 const M={EncodedPacket:{fromEncodedChunk:chunk=>({...chunk,timestamp:chunk.timestamp/1e6})},
  Output,StreamTarget,EncodedVideoPacketSource:PacketSource,EncodedAudioPacketSource:PacketSource,
  Mp4OutputFormat:class{},Input,BufferSource:class{},ALL_FORMATS:[],CanvasSink,AudioBufferSink};
 const document={createElement(type){
  assert.equal(type,'canvas','A fault must prevent playback/positive completion');
  const canvas={width:0,height:0,getContext:()=>({fillRect(){},fillStyle:''})};
  state.canvases.push(canvas);return canvas;
 }};
 return {state,M,globals:{VideoEncoder:encoder('video'),AudioEncoder:encoder('audio'),
  VideoFrame:Frame,AudioData:Audio,document}};
}

async function usingMocks(mode,action) {
 const runtime=mockRuntime(mode),saved=new Map();
 for(const [key,value] of Object.entries(runtime.globals)){
  saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));
  Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
 }
 try{return await action(runtime);}
 finally{for(const [key,descriptor] of saved){
  if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];
 }}
}
const run=({M,state},extra={})=>diagnose({M,timeoutMs:1000,isCancelled:()=>state.cancelled,...extra});
function assertResourcesClosed(state){
 assert.ok(state.encoders.every(e=>e.state==='closed'&&e.closed===1),'Every allocated encoder closes once');
 assert.ok(state.frames.every(f=>f.closed),'Every submitted VideoFrame closes');
 assert.ok(state.audio.every(a=>a.closed),'Every submitted AudioData closes');
 assert.ok(state.canvases.every(c=>c.width===0&&c.height===0),'Canvas backing surface releases');
}

test('mock initialization failure closes both allocated encoders without opening output',async()=>{
 await usingMocks('configure-failure',async runtime=>{
  const report=await run(runtime);
  assert.equal(report.code,'encode-error');assert.equal(report.failedStage,'encode');
  assert.equal(report.outcome,'failed');assert.equal(runtime.state.outputs,0);
  assertResourcesClosed(runtime.state);assert.doesNotMatch(JSON.stringify(report),/private encoder detail/);
 });
});

test('AAC support initialization completes before video registry probing',async()=>{
 await usingMocks('configure-failure',async runtime=>{
  let initialized=false;const order=[];
  globalThis.AudioEncoder.isConfigSupported=async config=>{
   order.push('audio-start');await new Promise(resolve=>setTimeout(resolve,10));
   initialized=true;order.push('audio-ready');return {supported:true,config};
  };
  globalThis.VideoEncoder.isConfigSupported=async config=>{
   assert.equal(initialized,true,'Video registration must wait for the shared media registry');
   order.push('video');return {supported:true,config};
  };
  const report=await run(runtime);
  assert.deepEqual(order,['audio-start','audio-ready','video']);
  assert.equal(report.failedStage,'encode');assert.equal(report.code,'encode-error');
 });
});

test('unsupported AAC still records independent AVC configuration evidence without allocating encoders',async()=>{
 await usingMocks('configure-failure',async runtime=>{
  globalThis.AudioEncoder.isConfigSupported=async config=>({supported:false,config});
  const report=await run(runtime);
  assert.deepEqual(report.codecSupport,{video:'exact-configuration-supported',audio:'unsupported'});
  assert.equal(report.code,'codec-unsupported');assert.equal(runtime.state.encoders.length,0);
 });
});

test('mock missing video packets and oversized encoded chunks cannot reach mux completion',async()=>{
 for(const [mode,code] of [['no-video-packets','encode-error'],['oversized-packet','resource-limit']])
  await usingMocks(mode,async runtime=>{
   const report=await run(runtime);
   assert.equal(report.code,code);assert.equal(report.outcome,'failed');
   assert.equal(runtime.state.outputs,0);assertResourcesClosed(runtime.state);
  });
});

test('mock B-frame presentation times preserve each track emitted decode order',async()=>{
 await usingMocks('b-frame-order',async runtime=>{
  const report=await run(runtime),order=runtime.state.videoOrder;
  assert.equal(report.failedStage,'container');assert.equal(report.code,'invalid-container');
  assert.equal(order.length,30);
  assert.deepEqual(order.slice(0,4),[0,.1,.033333,.066667]);
  assert.ok(order[1]>order[2],'Fixture contains reordered presentation timestamps');
  assert.ok(runtime.state.encoders.every(e=>e.flushes===1),'Each codec drains only at EOF, avoiding repeated AAC priming');
  assertResourcesClosed(runtime.state);
 });
});

test('mock random-write overrun cancels output and never records a passed mux stage',async()=>{
 await usingMocks('writer-overrun',async runtime=>{
  const report=await run(runtime);
  assert.equal(report.code,'mux-error');assert.equal(report.outcome,'failed');
  assert.equal(runtime.state.cancel,1);assert.equal(runtime.state.finalize,1);
  assert.equal(report.stages.some(s=>s.stage==='mux'&&s.status==='passed'),false);
  assertResourcesClosed(runtime.state);
 });
});

test('mock stalled mux operation observes cancellation and releases the single-run lock',async()=>{
 await usingMocks('mux-hang',async runtime=>{
  const report=await run(runtime);
  assert.equal(report.outcome,'cancelled');assert.equal(report.failedStage,'mux');
  assert.equal(runtime.state.cancel,1);assert.equal(runtime.state.finalize,0);
  assertResourcesClosed(runtime.state);
 });
 await usingMocks('no-video-packets',async runtime=>{
  const retry=await run(runtime);assert.equal(retry.code,'encode-error');
  assert.notEqual(retry.code,'diagnostic-busy');
 });
});

test('mock stalled encoder queue remains bounded at four frames and cancellation closes resources',async()=>{
 await usingMocks('encode-queue-hang',async runtime=>{
  const report=await run(runtime);
  assert.equal(report.outcome,'cancelled');assert.equal(report.failedStage,'encode');
  assert.equal(runtime.state.frames.length,4);assert.equal(runtime.state.audio.length,0);
  assert.equal(runtime.state.outputs,0);assertResourcesClosed(runtime.state);
 });
});

test('mock stalled decoded-audio iterator remains cancellable and disposes input',async()=>{
 await usingMocks('audio-iterator-hang',async runtime=>{
  const report=await run(runtime);
  assert.equal(report.outcome,'cancelled');assert.equal(report.failedStage,'decode');
  assert.equal(runtime.state.nextCalls,1);assert.equal(runtime.state.dispose,1);
  assert.equal(report.stages.some(s=>s.stage==='decode'&&s.status==='passed'),false);
  assert.equal(report.productionEligible,false);assert.equal(report.physicalDeviceVerified,false);
  assertResourcesClosed(runtime.state);
 });
});

test('diagnostic MP4 structural validator rejects oversized/non-byte input and invalid duration',()=>{
 for(const bytes of [null,new ArrayBuffer(2000),new Uint8Array(8*1024*1024+1)])
  assert.throws(()=>validateDiagnosticMp4(bytes),e=>e.diagnosticCode==='invalid-container');
 for(const seconds of [0,-1,NaN,Infinity])
  assert.throws(()=>validateDiagnosticMp4(structuralMp4(),seconds),e=>e.diagnosticCode==='invalid-container');
 assert.throws(()=>validateDiagnosticMp4(structuralMp4(),2),e=>e.diagnosticCode==='invalid-container');
});
