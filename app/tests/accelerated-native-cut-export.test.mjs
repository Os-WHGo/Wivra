import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {recordExperimentalNativeAcceleratedCuts}
  from '../accelerated-native-cut-export.mjs';

const project=()=>({
  clips:[{id:'c',asset_id:'v',start:0,in:0,out:0.5,volume:1}],
  overlayClips:[],audioClips:[],texts:[],format:{aspect:'original'}
});
const media={v:{kind:'video',url:'blob:sample',w:320,h:240}};

function mockM({audio=false,firstCodec='avc',aac=true}={}) {
  let disposals=0,cancelled=0;
  class Input {
    async getPrimaryVideoTrack(){return {};}
    async getPrimaryAudioTrack(){return audio?{}:null;}
    async dispose(){disposals++;}
  }
  class CanvasSink {
    async *canvases(from,to){yield {timestamp:from,duration:to-from,canvas:{}};}
  }
  class CanvasSource{async add(){}}
  class StreamTarget{constructor(writable){this.writable=writable;}}
  class Output {
    constructor({target}){this.target=target;}
    addVideoTrack(){}
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
    Input,UrlSource:class {},ALL_FORMATS:[],CanvasSink,CanvasSource,
    StreamTarget,Output,Mp4OutputFormat:class{},WebMOutputFormat:class{},
    getFirstEncodableVideoCodec:async list=>list.includes(firstCodec)?firstCodec:null,
    canEncodeAudio:async codec=>codec==='aac'?aac:codec==='opus'
  };
}

function native({platform='android'}={}) {
  let bytes=new Uint8Array(0),maxEnd=0,writes=0;
  const ops=[];
  const host={
    platform,ops,
    async request({op,...params}){
      ops.push(op);
      if(op==='helloRandom')return {protocol:2,randomWrite:true};
      if(op==='beginRandom')return {token:56};
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
    project:project(),media,M:mockM(),host,experimentalAccelerated:true
  }),/declararse explícitamente/);
  const multi=project();multi.audioClips.push({id:'music'});
  await assert.rejects(recordExperimentalNativeAcceleratedCuts({
    project:multi,media,M:mockM(),host,expectAudio:false,
    experimentalAccelerated:true
  }),/other-tracks/);
  assert.deepEqual(host.ops,[]);
});

test('codec audio preflight fails closed before a native file exists',async()=>{
  const host=native(),M=mockM({audio:true});
  await assert.rejects(recordExperimentalNativeAcceleratedCuts({
    project:project(),media,M,host,expectAudio:false,
    experimentalAccelerated:true
  }),/pista de audio/);
  assert.equal(M.disposals,1,'track probe decoder must close after rejection');
  const ios=native({platform:'ios'});
  await assert.rejects(recordExperimentalNativeAcceleratedCuts({
    project:project(),media,M:mockM({firstCodec:'vp8'}),host:ios,
    expectAudio:false,experimentalAccelerated:true
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
      experimentalAccelerated:true,
      onProgress(){throw Error('stale UI observer');}
    });
    assert.equal(M.disposals,2,'preflight and render decoder must both close');
    assert.equal(M.cancelled,0,'completed encoder must not be canceled');
    assert.equal(result.mime,'video/mp4');
    assert.equal(result.verifiedNative,true);
    assert.equal(result.verifiedOnDevice,false);
    assert.equal(result.render.writes,2);
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
  experimentalAccelerated:true
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
   experimentalAccelerated:true
  }),/video decode failed/);
  assert.equal(M.disposals,2);
  assert.equal(M.cancelled,1);
  assert.deepEqual(host.ops,['helloRandom','beginRandom','abortRandom']);
 }finally{globalThis.document=prior;}
});
