import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAcceleratedMultitrack,renderAcceleratedMultitrack}
 from '../accelerated-multitrack-renderer.mjs';

class PCM {
 constructor({length,sampleRate,numberOfChannels}) {
  this.length=length;this.sampleRate=sampleRate;
  this.numberOfChannels=numberOfChannels;
  this.data=Array.from({length:numberOfChannels},()=>new Float32Array(length));
 }
 getChannelData(i){return this.data[i];}
}
function fakeM() {
 const events=[];
 class UrlSource {constructor(url){this.url=url;}}
 class Input {
  constructor({source}){this.url=source.url;}
  async getPrimaryVideoTrack(){
   return this.url==='blob:main'||this.url==='blob:guest'?{url:this.url}:null;
  }
  async getPrimaryAudioTrack(){return this.url==='blob:mic'?{url:this.url}:null;}
  dispose(){events.push(['dispose',this.url]);}
 }
 class CanvasSink {
  constructor(track){this.track=track;}
  async getCanvas(t){
   events.push(['decode-video',this.track.url,+t.toFixed(4)]);
   return {timestamp:t,duration:1/30,canvas:{width:640,height:360}};
  }
 }
 class AudioBufferSink {
  async *buffers(from,to) {
   const rate=8000,begin=Math.floor(from*rate),end=Math.ceil(to*rate);
   if(end<=begin)return;
   const buffer=new PCM({length:end-begin,sampleRate:rate,numberOfChannels:1});
   buffer.data[0].fill(.5);
   yield {timestamp:begin/rate,duration:(end-begin)/rate,buffer};
  }
 }
 class CanvasSource {async add(t,d){events.push(['video',+t.toFixed(4),+d.toFixed(4)]);}}
 class AudioBufferSource {async add(b){
  events.push(['audio',b.length,b.getChannelData(0)[0],b.getChannelData(0)[1000]]);
 }}
 class StreamTarget {constructor(writable){this.writable=writable;}}
 class Output {
  constructor({target}){this.target=target;}
  addVideoTrack(){events.push(['video-track']);}
  addAudioTrack(){events.push(['audio-track']);}
  async start(){events.push(['start']);}
  async finalize(){
   const writer=this.target.writable.getWriter();
   await writer.write({position:0,data:Uint8Array.from([0,0,0,16,102,116,121,112,1,2,3,4])});
   await writer.write({position:8,data:Uint8Array.from([9,10,11,12])});
   writer.releaseLock();events.push(['finalize']);
  }
 }
 return {events,Input,UrlSource,CanvasSink,AudioBufferSink,CanvasSource,
  AudioBufferSource,StreamTarget,Output,ALL_FORMATS:[],
  Mp4OutputFormat:class{},WebMOutputFormat:class{},
  getFirstEncodableVideoCodec:async list=>list.includes('avc')?'avc':null,
  canEncodeAudio:async c=>c==='aac'};
}
const media={
 main:{kind:'video',url:'blob:main',w:640,h:360,duration:3},
 guest:{kind:'video',url:'blob:guest',w:640,h:360,duration:3},
 mic:{kind:'audio',url:'blob:mic',duration:3},
 picture:{kind:'image',url:'blob:still',w:40,h:40}
};
const proj=()=>({
 clips:[
  {id:'c1',asset_id:'main',start:0,in:0,out:.2},
  {id:'c2',asset_id:'guest',start:.2,in:1,out:1.4}],
 overlayClips:[{id:'ov',asset_id:'picture',start:.1,in:0,out:.35,
  x:.5,y:.5,scale:.2,opacity:.8,track:2}],
 audioClips:[{id:'voice',asset_id:'mic',start:.12,in:.5,out:.9,volume:1}],
 texts:[{id:'txt',text:'Wivra',start:.15,end:.4}],
 format:{aspect:'original',fit:'contain'}
});
const imageFactory=async()=>({naturalWidth:40,naturalHeight:40});
function context() {
 const draw=[];
 const g={
  fillRect(...args){draw.push(['black',...args]);},
  drawImage(...args){draw.push(['frame',args.length]);},
  save(){},restore(){},translate(){},beginPath(){},rect(){},clip(){},
  measureText(t){return {width:t.length*7};},
  fillText(t){draw.push(['caption',t]);},strokeText(){},
  set fillStyle(v){},set globalAlpha(v){},
  get globalAlpha(){return 1;}
 };
 return {draw,document:{createElement(){return {getContext(){return g;}};}}};
}
test('actual multi-source composition renders overlay/caption frames and offset voice audio',async()=>{
 const M=fakeM(),p=proj(),{draw,document}=context();
 const prior=globalThis.document,priorAudio=globalThis.AudioBuffer;
 globalThis.document=document;globalThis.AudioBuffer=PCM;
 try {
  const prepared=await prepareAcceleratedMultitrack({project:p,media,M,
   imageFactory,platform:'android',expectedAudio:true});
  assert.equal(prepared.ledger.valid,true);
  assert.equal(prepared.ledger.rendererReady,false);
  assert.equal(prepared.codec.container,'mp4');
  assert.equal(prepared.audible.length,1);
  const writes=[];
  const result=await renderAcceleratedMultitrack({prepared,fps:30,sampleRate:8000,
   writeAt:async(pos,data)=>{writes.push([pos,data.length]);return data.length;}});
  assert.equal(result.container,'mp4');
  assert.equal(result.videoFrames,18);
  assert.equal(result.audioBlocks,1);
  assert.ok(result.overlaysRendered>0);
  assert.equal(result.verifiedOnDevice,false);
  assert.equal(result.rendererReadyForProduction,false);
  assert.ok(draw.some(x=>x[0]==='caption'&&x[1]==='Wivra'));
  assert.ok(M.events.some(x=>x[0]==='decode-video'&&x[1]==='blob:main'));
  assert.ok(M.events.some(x=>x[0]==='decode-video'&&x[1]==='blob:guest'));
  const audio=M.events.find(x=>x[0]==='audio');
  assert.equal(audio[1],4800);
  assert.equal(audio[2],0);
  assert.ok(audio[3]>.45);
  assert.deepEqual(writes.map(x=>x[0]),[0,8]);
 }finally {globalThis.document=prior;globalThis.AudioBuffer=priorAudio;}
});
test('fail closed before starting output when WAV, source, effects or format are missing',async()=>{
 const M=fakeM(),p=proj();
 for(const change of [
  x=>{x.audioClips[0].asset_id='gone';},
  x=>{x.clips[1].asset_id='gone';},
  x=>{x.clips[0].unknownEffect='cannotDrop';},
  x=>{x.effects=[{effect:'cinematic'}];},
  x=>{x.overlayClips[0].ducking=.3;},
  x=>{x.format.aspect='arbitrary';}
 ]){
  const copy=structuredClone(p);change(copy);
  await assert.rejects(prepareAcceleratedMultitrack({
    project:copy,media,M,imageFactory,expectedAudio:true}),/preflight/);
 }
 await assert.rejects(prepareAcceleratedMultitrack({
  project:p,media,M,imageFactory,expectedAudio:false}),/audio presence differs/);
 assert.equal(M.events.some(x=>x[0]==='start'),false);
});
test('iPhone fails codec preflight for WebM before any native random writer exists',async()=>{
 const M=fakeM();M.getFirstEncodableVideoCodec=async list=>list.includes('vp8')?'vp8':null;
 await assert.rejects(prepareAcceleratedMultitrack({
  project:proj(),media,M,imageFactory,platform:'ios'}),/requires H264/);
});
test('missing frame aborts rather than silently publishing black output',async()=>{
 const M=fakeM(),p=proj(),prior=globalThis.document;
 const {document}=context();globalThis.document=document;
 const oldAudio=globalThis.AudioBuffer;globalThis.AudioBuffer=PCM;
 const canvas=M.CanvasSink;
 M.CanvasSink=class extends canvas{
  async getCanvas(t){if(t>.19)return null;return super.getCanvas(t);}
 };
 try{
  const prepared=await prepareAcceleratedMultitrack({
   project:p,media,M,imageFactory});
  await assert.rejects(renderAcceleratedMultitrack({
   prepared,fps:30,sampleRate:8000,
   writeAt:async(pos,bytes)=>bytes.length}),/Missing decoded/);
  assert.equal(M.events.some(x=>x[0]==='finalize'),false);
 }finally{globalThis.document=prior;globalThis.AudioBuffer=oldAudio;}
});

test('accelerator refuses truncated narration and captions before native file creation',async()=>{
 const M=fakeM();
 const voice=proj();voice.audioClips[0].out=2;
 await assert.rejects(prepareAcceleratedMultitrack({
  project:voice,media,M,imageFactory,expectedAudio:true
 }),/essential voice extends/);
 const caption=proj();caption.texts[0].end=2;
 await assert.rejects(prepareAcceleratedMultitrack({
  project:caption,media,M,imageFactory,expectedAudio:true
 }),/captions continue/);
 assert.equal(M.events.some(x=>x[0]==='start'),false);
});
