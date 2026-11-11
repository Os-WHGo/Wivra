import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {recordExperimentalNativeAcceleratedCuts}
  from '../accelerated-native-cut-export.mjs';
import {planAcceleratedStorageReservation} from '../accelerated-storage-budget.mjs';

const project=()=>({
  clips:[{id:'c',asset_id:'v',start:0,in:0,out:0.5,volume:1}],
  overlayClips:[],audioClips:[],texts:[],format:{aspect:'original'}
});
const media={v:{kind:'video',url:'blob:sample',w:320,h:240}};
const supportedCodecProbes={
 videoEncoder:{isConfigSupported:async config=>({supported:true,config})},
 audioEncoder:{isConfigSupported:async config=>({supported:true,config})}
};

function mockM({audio=false,firstCodec='avc',aac=true}={}) {
  let disposals=0,cancelled=0,allocations=0;
  class Input {
    constructor(){allocations++;}
    async getPrimaryVideoTrack(){return {};}
    async getPrimaryAudioTrack(){return audio?{}:null;}
    async dispose(){disposals++;}
  }
  class CanvasSink {
    async *canvases(from,to){yield {timestamp:from,duration:to-from,canvas:{}};}
  }
  class AudioBufferSink {
    async *buffers(from,to){
      const length=Math.round((to-from)*48000);
      yield {timestamp:from,duration:to-from,buffer:{
        length,sampleRate:48000,numberOfChannels:1,
        getChannelData(){return new Float32Array(length);}
      }};
    }
  }
  class AudioBufferSource {
    constructor(config){
      config.onEncoderConfig?.({
        codec:config.fullCodecString,
        sampleRate:48000,numberOfChannels:2,bitrate:config.bitrate
      });
    }
    async add(){}
  }
  class CanvasSource{
    constructor(_canvas, config){
      config.onEncoderConfig?.({
        codec:config.fullCodecString,width:320,height:240,
        framerate:30,bitrate:config.bitrate,avc:{format:'avc'}
      });
    }
    async add(){}
  }
  class StreamTarget{constructor(writable){this.writable=writable;}}
  class Output {
    constructor({target}){this.target=target;}
    addVideoTrack(){}
    addAudioTrack(){}
    async start(){}
    async cancel(){cancelled++;}
    async finalize(){
      const w=this.target.writable.getWriter();
      await w.write({position:0,data:Uint8Array.from([0,0,0,16,102,116,121,112])});
      await w.write({position:1,data:Uint8Array.from([8,9])});
      w.releaseLock();
    }
  }
  return {
    get disposals(){return disposals;},get cancelled(){return cancelled;},
    get allocations(){return allocations;},
    Input,UrlSource:class {},ALL_FORMATS:[],CanvasSink,CanvasSource,
    AudioBufferSink,AudioBufferSource,
    StreamTarget,Output,Mp4OutputFormat:class{},WebMOutputFormat:class{},
    getFirstEncodableVideoCodec:async list=>list.includes(firstCodec)?firstCodec:null,
    canEncodeAudio:async codec=>codec==='aac'?aac:codec==='opus'
  };
}

function native({platform='android'}={}) {
  let bytes=new Uint8Array(0),maxEnd=0,writes=0;
  const ops=[],reservations=[];
  const host={
    platform,ops,reservations,
    async request({op,...params}){
      ops.push(op);
      if(op==='helloRandom')return {protocol:2,randomWrite:true};
      if(op==='beginRandom'){
        reservations.push(params.estimatedBytes);
        if(!Number.isSafeInteger(params.estimatedBytes) || params.estimatedBytes<=0)
          throw Error('Native protocol v2 refuses an empty storage reservation');
        return {token:56};
      }
      if(op==='abortRandom')return {ok:true};
      if(op==='finishRandom')return {
        verified:true,bytes:maxEnd,
        sha256:createHash('sha256').update(bytes).digest('hex'),
        media:{video:true,audio:false,durationMs:500}
      };
      throw Error('Unexpected operation '+op);
    },
    async sendWriteAt({seq,position,bytes:data}){
      const end=position+data.length;
      if(end>bytes.length){const copy=new Uint8Array(end);copy.set(bytes);bytes=copy;}
      bytes.set(data,position);maxEnd=Math.max(maxEnd,end);writes++;
      return {seq,writtenBytes:data.length,maxEnd};
    }
  };
  return host;
}

test('experimental native writer requires explicit consent and cuts-only parity before opening',async()=>{
  const host=native();
  await assert.rejects(recordExperimentalNativeAcceleratedCuts({
    project:project(),media,M:mockM(),host,expectAudio:false
  }),/autorización experimental/);
  await assert.rejects(recordExperimentalNativeAcceleratedCuts({
    project:project(),media,M:mockM(),host,experimentalAccelerated:true,...supportedCodecProbes
  }),/declararse explícitamente/);
  const multi=project();multi.audioClips.push({id:'music'});
  await assert.rejects(recordExperimentalNativeAcceleratedCuts({
    project:multi,media,M:mockM(),host,expectAudio:false,
    experimentalAccelerated:true,...supportedCodecProbes
  }),/other-tracks/);
  assert.deepEqual(host.ops,[]);
});

test('codec audio preflight fails closed before a native file exists',async()=>{
  const host=native(),M=mockM({audio:true});
  await assert.rejects(recordExperimentalNativeAcceleratedCuts({
    project:project(),media,M,host,expectAudio:false,
    experimentalAccelerated:true,...supportedCodecProbes
  }),/pista de audio/);
  assert.equal(M.disposals,1,'track probe decoder must close after rejection');
  const ios=native({platform:'ios'});
  await assert.rejects(recordExperimentalNativeAcceleratedCuts({
    project:project(),media,M:mockM({firstCodec:'vp8'}),host:ios,
    expectAudio:false,experimentalAccelerated:true,...supportedCodecProbes
  }),/iPhone requiere MP4/);
  assert.deepEqual(host.ops,[]);
  assert.deepEqual(ios.ops,[]);
});

test('experimental cut-only renderer drives bounded v2 random writes and verified finish',async()=>{
  const host=native(),M=mockM();
  const prev=globalThis.document;
  globalThis.document={createElement(){
    return {width:0,height:0,getContext(){return {drawImage(){}};}};
  }};
  try {
    const result=await recordExperimentalNativeAcceleratedCuts({
      project:project(),media,M,host,expectAudio:false,
      experimentalAccelerated:true,...supportedCodecProbes,
      onProgress(){throw Error('stale UI observer');}
    });
    assert.equal(M.disposals,2,'preflight and render decoder must both close');
    assert.equal(M.cancelled,0,'completed encoder must not be canceled');
    assert.equal(result.mime,'video/mp4');
    assert.equal(result.verifiedNative,true);
    assert.equal(result.verifiedOnDevice,false);
    assert.equal(result.render.writes,2);
    const budget=planAcceleratedStorageReservation({
      seconds:.5,width:320,height:240,fps:30
    });
    assert.deepEqual(host.reservations,[budget.estimatedBytes]);
    assert.ok(budget.estimatedBytes>0);
    assert.deepEqual(host.ops,['helloRandom','beginRandom','finishRandom']);
  }finally{globalThis.document=prev;}
});

test('failed cut preflight disposes decoder and never opens native media file',async()=>{
 const M=mockM(),host=native();
 const Base=M.Input;
 M.Input=class extends Base {
  async getPrimaryVideoTrack(){throw Error('decoder track probe interrupted');}
 };
 await assert.rejects(recordExperimentalNativeAcceleratedCuts({
  project:project(),media,M,host,expectAudio:false,
  experimentalAccelerated:true,...supportedCodecProbes
 }),/decoder track probe interrupted/);
 assert.equal(M.disposals,1);
 assert.deepEqual(host.ops,[]);
});

test('failed cut rendering cancels encoder, releases both sources and aborts only new partial',async()=>{
 const M=mockM(),host=native(),prior=globalThis.document;
 M.CanvasSink=class {async *canvases(){throw Error('video decode failed');}};
 globalThis.document={createElement(){return {
  getContext(){return {drawImage(){}};}
 };}};
 try{
  await assert.rejects(recordExperimentalNativeAcceleratedCuts({
   project:project(),media,M,host,expectAudio:false,
   experimentalAccelerated:true,...supportedCodecProbes
  }),/video decode failed/);
  assert.equal(M.disposals,2);
  assert.equal(M.cancelled,1);
  assert.deepEqual(host.ops,['helloRandom','beginRandom','abortRandom']);
 }finally{globalThis.document=prior;}
});

test('mobile cut export rejects missing or downgraded video codec before opening v2 file',async()=>{
 for(const videoEncoder of [
  null,
  {isConfigSupported:async()=>({supported:false})},
  {isConfigSupported:async c=>({supported:true,config:{...c,framerate:24}})}
 ]) {
  const host=native(),M=mockM();
  await assert.rejects(recordExperimentalNativeAcceleratedCuts({
   project:project(),media,M,host,expectAudio:false,
   experimentalAccelerated:true,...supportedCodecProbes,videoEncoder
  }),/Preflight WebCodecs móvil/);
  assert.equal(M.disposals,1);
  assert.deepEqual(host.ops,[]);
 }
});

test('mobile cut preflight confirms 96kbps AAC stereo and rejects incompatible audio configuration',async()=>{
 const host=native(),M=mockM({audio:true});
 const captured=[];
 const audioEncoder={isConfigSupported:async c=>{
  captured.push(c);
  return {supported:true,config:{...c,numberOfChannels:1}};
 }};
 await assert.rejects(recordExperimentalNativeAcceleratedCuts({
  project:project(),media,M,host,expectAudio:true,
  experimentalAccelerated:true,...supportedCodecProbes,audioEncoder
 }),/Preflight WebCodecs móvil/);
 assert.equal(captured.length,1);
 assert.equal(captured[0].bitrate,96000);
 assert.equal(captured[0].numberOfChannels,2);
 assert.equal(M.disposals,1);
 assert.deepEqual(host.ops,[]);
});

test('changing codec between probe and render aborts temporary output instead of publishing a wrong format',async()=>{
 const host=native(),M=mockM(),prev=globalThis.document;
 let probes=0;
 M.getFirstEncodableVideoCodec=async()=>++probes===1?'avc':'vp9';
 globalThis.document={createElement(){return {
  getContext(){return {drawImage(){}};}
 };}};
 try{
  await assert.rejects(recordExperimentalNativeAcceleratedCuts({
   project:project(),media,M,host,expectAudio:false,
   experimentalAccelerated:true,...supportedCodecProbes
  }),/difieren del preflight nativo/);
  assert.equal(M.disposals,2);
  assert.deepEqual(host.ops,['helloRandom','beginRandom','abortRandom']);
 }finally{globalThis.document=prev;}
});


test('real cut encoder configuration mismatch aborts partial instead of publishing media',async()=>{
 const host=native(),M=mockM(),prior=globalThis.document;
 M.CanvasSource=class {
  constructor(_canvas,config){
   assert.equal(config.fullCodecString,'avc1.42E01F');
   assert.equal(typeof config.onEncoderConfig,'function');
   config.onEncoderConfig({
    codec:config.fullCodecString,width:320,height:240,framerate:24,
    bitrate:2000000,avc:{format:'avc'}
   });
  }
  async add(){}
 };
 globalThis.document={createElement(){return {
  getContext(){return {drawImage(){}};}
 };}};
 try{
  await assert.rejects(recordExperimentalNativeAcceleratedCuts({
   project:project(),media,M,host,expectAudio:false,
   experimentalAccelerated:true,...supportedCodecProbes
  }),/configuración del codificador de corte no coincide/);
  assert.equal(M.disposals,2);
  assert.equal(M.cancelled,1,'created Output is cancelled when encoder setup rejects');
  assert.deepEqual(host.ops,['helloRandom','beginRandom','abortRandom']);
 }finally{globalThis.document=prior;}
});


test('manual zero or insufficient storage estimate is rejected before decoding or native begin',async()=>{
 const minimum=planAcceleratedStorageReservation({
  seconds:.5,width:320,height:240,fps:30
 }).estimatedBytes;
 for(const estimatedBytes of [0,1,minimum-1,-1,Infinity,16*1024**3+1]){
  const host=native(),M=mockM();
  await assert.rejects(recordExperimentalNativeAcceleratedCuts({
   project:project(),media,M,host,expectAudio:false,
   estimatedBytes,experimentalAccelerated:true,...supportedCodecProbes
  }),/Reserva manual/);
  assert.equal(M.allocations,0);
  assert.deepEqual(host.ops,[]);
 }
});

test('explicit sufficient reserve is passed unchanged to native v2',async()=>{
 const host=native(),M=mockM(),old=globalThis.document;
 const min=planAcceleratedStorageReservation({
  seconds:.5,width:320,height:240,fps:30
 }).estimatedBytes;
 globalThis.document={createElement(){return {
  getContext(){return {drawImage(){}};}
 };}};
 try {
  const result=await recordExperimentalNativeAcceleratedCuts({
   project:project(),media,M,host,expectAudio:false,
   estimatedBytes:min+4096,experimentalAccelerated:true,...supportedCodecProbes
  });
  assert.equal(result.saved.verified,true);
  assert.deepEqual(host.reservations,[min+4096]);
  assert.equal(M.disposals,2);
 }finally{globalThis.document=old;}
});

test('unsafe dimensions fail before opening codec probe or allocating native session',async()=>{
 const huge=project(),oversized={...media,v:{...media.v,w:8192,h:8192}};
 const host=native(),M=mockM();
 await assert.rejects(recordExperimentalNativeAcceleratedCuts({
  project:huge,media:oversized,M,host,expectAudio:false,
  experimentalAccelerated:true,...supportedCodecProbes
 }),/Parámetros de reserva acelerada/);
 assert.equal(M.allocations,0);
 assert.deepEqual(host.ops,[]);
});

test('native cut export rejects finalization when real video encoder never acknowledges config',async()=>{
 const host=native(),M=mockM(),prior=globalThis.document;
 let started=0;
 M.CanvasSource=class{async add(){started++;}};
 globalThis.document={createElement(){return {getContext(){return {drawImage(){}};}};}};
 try{
  await assert.rejects(recordExperimentalNativeAcceleratedCuts({
   project:project(),media,M,host,expectAudio:false,
   experimentalAccelerated:true,...supportedCodecProbes
  }),/codificador nativo no confirmó/);
  assert.ok(started>0);
  assert.equal(M.disposals,2);
  assert.equal(M.cancelled,1);
  assert.deepEqual(host.ops,['helloRandom','beginRandom','abortRandom']);
 }finally{globalThis.document=prior;}
});

test('native cut MP4 refuses missing AAC encoder confirmation even when video config was verified',async()=>{
 const host=native(),M=mockM({audio:true}),priorDoc=globalThis.document,
  priorAudio=globalThis.AudioBuffer;
 let attempted=0;
 M.AudioBufferSource=class {async add(){attempted++;}};
 globalThis.document={createElement(){return {getContext(){return {drawImage(){}};}};}};
 globalThis.AudioBuffer=class{
  constructor(options){this.length=options.length;}
  copyToChannel(){}
 };
 try{
  await assert.rejects(recordExperimentalNativeAcceleratedCuts({
   project:project(),media,M,host,expectAudio:true,
   experimentalAccelerated:true,...supportedCodecProbes
  }),/codificador nativo no confirmó/);
  assert.equal(attempted,1);
  assert.equal(M.disposals,2);
  assert.equal(M.cancelled,1);
  assert.deepEqual(host.ops,['helloRandom','beginRandom','abortRandom']);
 }finally{globalThis.document=priorDoc;globalThis.AudioBuffer=priorAudio;}
});
