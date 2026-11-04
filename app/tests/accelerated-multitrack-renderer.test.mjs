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
 const voice=proj();voice.audioClips[0].role='voice_primary';voice.audioClips[0].out=2;
 await assert.rejects(prepareAcceleratedMultitrack({
  project:voice,media,M,imageFactory,expectedAudio:true
 }),/essential voice extends/);
 const caption=proj();caption.texts[0].end=2;
 await assert.rejects(prepareAcceleratedMultitrack({
  project:caption,media,M,imageFactory,expectedAudio:true
 }),/captions continue/);
 assert.equal(M.events.some(x=>x[0]==='start'),false);
});

test('preflight rejects a source whose real decoded duration ends before the trim',async()=>{
 const M=fakeM(),p=proj();
 const original=M.Input;
 M.Input=class extends original {
  async getPrimaryVideoTrack(){
   const track=await super.getPrimaryVideoTrack();
   if(track)track.computeDuration=async()=>.8;
   return track;
  }
 };
 await assert.rejects(prepareAcceleratedMultitrack({
  project:p,media,M,imageFactory,expectedAudio:true
 }),/decoded source media shorter/);
 assert.ok(M.events.some(event=>event[0]==='dispose'));
 assert.ok(!M.events.some(event=>event[0]==='start'));
});

test('preflight rejects a source whose first decoded sample starts after the trim',async()=>{
 const M=fakeM(),p=proj(),original=M.Input;
 M.Input=class extends original {
  async getPrimaryVideoTrack(){
   const track=await super.getPrimaryVideoTrack();
   if(track){
    track.computeDuration=async()=>2.2;
    track.getFirstTimestamp=async()=>.3;
   }
   return track;
  }
 };
 await assert.rejects(prepareAcceleratedMultitrack({
  project:p,media,M,imageFactory,expectedAudio:true
 }),/first decodable sample/);
 assert.ok(M.events.some(event=>event[0]==='dispose'));
});

test('iPhone accelerated preflight selects only H264/AAC MP4 with independent voice',async()=>{
 const M=fakeM();
 const prepared=await prepareAcceleratedMultitrack({
  project:proj(),media,M,imageFactory,platform:'ios',expectedAudio:true
 });
 assert.equal(prepared.codec.container,'mp4');
 assert.equal(prepared.codec.videoCodec,'avc');
 assert.equal(prepared.codec.audioCodec,'aac');
 assert.equal(prepared.audible.length,1);
 assert.equal(prepared.ledger.rendererReady,false);
 for(const item of prepared.used.values())await item.input?.dispose?.();
});

test('iPhone accelerated preflight rejects AVC if AAC voice encoder is missing',async()=>{
 const M=fakeM();
 M.canEncodeAudio=async()=>false;
 M.getFirstEncodableVideoCodec=async list=>
  list.includes('avc')?'avc':null;
 await assert.rejects(prepareAcceleratedMultitrack({
  project:proj(),media,M,imageFactory,platform:'ios',expectedAudio:true
 }),/preflight/);
 assert.equal(M.events.some(x=>x[0]==='start'),false);
});

test('GPU filter failure cannot silently export an unfiltered frame',async()=>{
 const M=fakeM(),p=proj(),{document}=context();
 p.clips[0].filter={sepia:.8};
 p.audioClips=[];
 const oldDocument=globalThis.document,oldFx=globalThis.fxRender;
 globalThis.document=document;
 const failedFilter=()=>null;
 globalThis.fxRender=failedFilter;
 try{
  const prepared=await prepareAcceleratedMultitrack({
   project:p,media,M,imageFactory,expectedAudio:false
  });
  await assert.rejects(renderAcceleratedMultitrack({
   prepared,writeAt:async(_at,bytes)=>bytes.length
  }),/GPU filter failed/);
  assert.equal(globalThis.fxRender,failedFilter);
  assert.equal(M.events.some(x=>x[0]==='finalize'),false);
 }finally{
  globalThis.document=oldDocument;
  globalThis.fxRender=oldFx;
 }
});

test('applied GPU color filter preserves exact frame count without changing global preview',async()=>{
 const M=fakeM(),p=proj(),{document}=context();
 p.clips[0].filter={warmth:.5};
 p.audioClips=[];
 const oldDocument=globalThis.document,oldFx=globalThis.fxRender;
 let applications=0;
 const filtered=(src)=>{applications++;return src;};
 globalThis.document=document;globalThis.fxRender=filtered;
 try{
  const prepared=await prepareAcceleratedMultitrack({
   project:p,media,M,imageFactory,expectedAudio:false
  });
  const result=await renderAcceleratedMultitrack({
   prepared,writeAt:async(_at,bytes)=>bytes.length
  });
  assert.equal(result.videoFrames,18);
  assert.equal(applications,6);
  assert.equal(globalThis.fxRender,filtered);
 }finally{
  globalThis.document=oldDocument;
  globalThis.fxRender=oldFx;
 }
});

test('GPU failure on filtered overlay also prevents an incomplete publication',async()=>{
 const M=fakeM(),p=proj(),{document}=context();
 p.overlayClips[0].filter={vignette:.6};
 p.audioClips=[];
 const oldDoc=globalThis.document,oldFx=globalThis.fxRender;
 globalThis.document=document;globalThis.fxRender=()=>null;
 try{
  const prepared=await prepareAcceleratedMultitrack({
   project:p,media,M,imageFactory,expectedAudio:false
  });
  await assert.rejects(renderAcceleratedMultitrack({
   prepared,writeAt:async(_at,bytes)=>bytes.length
  }),/GPU filter failed/);
  assert.equal(M.events.some(x=>x[0]==='finalize'),false);
 }finally{globalThis.document=oldDoc;globalThis.fxRender=oldFx;}
});

test('accelerated QA preflight accepts explicit voice ducking and rejects invalid depths',async()=>{
 const M=fakeM(),valid=proj();
 valid.audioClips[0].role='voice_primary';
 valid.audioClips[0].ducking=.5;
 const prepared=await prepareAcceleratedMultitrack({
  project:valid,media,M,imageFactory,expectedAudio:true
 });
 assert.equal(prepared.audible[0].clip.ducking,.5);
 assert.equal(prepared.ledger.rendererReady,false);
 for(const item of prepared.used.values())await item.input?.dispose?.();
 for(const value of [-.2,1.2,NaN,'0.5']){
  const bad=structuredClone(valid);bad.audioClips[0].ducking=value;
  await assert.rejects(prepareAcceleratedMultitrack({
   project:bad,media,M,imageFactory,expectedAudio:true
  }),/invalid or unsupported voice ducking/);
 }
 const wrong=structuredClone(valid);
 wrong.audioClips[0].role='music';
 await assert.rejects(prepareAcceleratedMultitrack({
  project:wrong,media,M,imageFactory,expectedAudio:true
 }),/invalid or unsupported voice ducking/);
});

test('120-second accelerator canary preserves 120 cuts and 30 independent voices without production enablement',async()=>{
 const M=fakeM(),p=proj();
 p.clips=Array.from({length:120},(_,i)=>({
  id:'part'+i,asset_id:i%2?'main':'guest',start:i,in:0,out:1
 }));
 p.audioClips=Array.from({length:30},(_,i)=>({
  id:'voice'+i,asset_id:'mic',start:i*4+.12,
  in:0,out:1.88,role:'voice_primary',volume:.75
 }));
 const prepared=await prepareAcceleratedMultitrack({
  project:p,media,M,imageFactory,platform:'android',expectedAudio:true
 });
 assert.equal(prepared.totalSeconds,120);
 assert.equal(prepared.ledger.authoredItems,152);
 assert.equal(prepared.audible.length,30);
 assert.equal(prepared.ledger.rendererReady,false);
 for(const item of prepared.used.values())await item.input?.dispose?.();
 const tooLong=structuredClone(p);
 tooLong.clips.at(-1).start=180; // 181-second timeline exceeds QA-only 180s cap
 await assert.rejects(prepareAcceleratedMultitrack({
  project:tooLong,media,M,imageFactory,expectedAudio:true
 }),/timeline-duration/);
 const tooMany=structuredClone(p);
 for(let i=0;i<9;i++)tooMany.audioClips.push({
  id:'extra'+i,asset_id:'mic',start:i,in:0,out:1
 });
 await assert.rejects(prepareAcceleratedMultitrack({
  project:tooMany,media,M,imageFactory,expectedAudio:true
 }),/item-count/);
 assert.equal(M.events.some(x=>x[0]==='start'),false);
});

test('main source lookup preserves original sequence when timeline array is unsorted',async()=>{
 const M=fakeM(),p=proj(),{document}=context();
 p.clips=[...p.clips].reverse();
 p.audioClips=[];p.overlayClips=[];
 const prior=globalThis.document;
 globalThis.document=document;
 try {
  const prepared=await prepareAcceleratedMultitrack({
   project:p,media,M,imageFactory,expectedAudio:false
  });
  const result=await renderAcceleratedMultitrack({
   prepared,fps:30,writeAt:async(_pos,b)=>b.length
  });
  assert.equal(result.videoFrames,18);
  const decoded=M.events.filter(e=>e[0]==='decode-video');
  assert.equal(decoded[0][1],'blob:main');
  assert.equal(decoded.at(-1)[1],'blob:guest');
 }finally{globalThis.document=prior;}
});

test('180-second 120-cut 30-voice accelerated canary stays QA-only and enforces the next millisecond',async()=>{
 const M=fakeM(),p=proj();
 p.clips=Array.from({length:120},(_,i)=>({
  id:'c'+i,asset_id:i%2?'main':'guest',start:i*1.5,in:0,out:1.5
 }));
 p.audioClips=Array.from({length:30},(_,i)=>({
  id:'voice'+i,asset_id:'mic',start:i*6+.12,
  in:0,out:1.88,role:'voice_primary',volume:.75
 }));
 const prepared=await prepareAcceleratedMultitrack({
  project:p,media,M,imageFactory,expectedAudio:true
 });
 assert.equal(prepared.totalSeconds,180);
 assert.equal(prepared.ledger.authoredItems,152);
 assert.equal(prepared.ledger.rendererReady,false);
 assert.equal(prepared.audible.length,30);
 for(const item of prepared.used.values())await item.input?.dispose?.();
 const excessive=structuredClone(p);
 excessive.clips.at(-1).out=1.51;
 await assert.rejects(prepareAcceleratedMultitrack({
  project:excessive,media,M,imageFactory,expectedAudio:true
 }),/timeline-duration/);
});

test('same-source simultaneous layers preserve distinct decoded times and reuse bounded slots',async()=>{
 const M=fakeM();let sinks=0;
 M.CanvasSink=class {
  constructor(){sinks++;this.canvas={width:640,height:360,time:null};}
  async getCanvas(t){this.canvas.time=t;return {canvas:this.canvas};}
 };
 const p=proj();p.audioClips=[];p.texts=[];
 p.clips=[{id:'main',asset_id:'main',start:0,in:0,out:.2}];
 p.overlayClips=[1,2].map(i=>({id:'ov'+i,asset_id:'main',
  start:0,in:i,out:i+.2,scale:.2,x:.5,y:.5}));
 const painted=[],{document}=context();
 const canvas=document.createElement(),g=canvas.getContext();
 g.drawImage=source=>painted.push(source.time);
 const prior=globalThis.document;
 globalThis.document={createElement:()=>canvas};
 try{
  const prepared=await prepareAcceleratedMultitrack({project:p,media,M});
  const result=await renderAcceleratedMultitrack({prepared,fps:30,
   writeAt:async(pos,bytes)=>bytes.length});
  assert.equal(result.videoFrames,6);
  assert.equal(sinks,3); // three simultaneous surfaces, not three per frame
  for(let k=0;k<6;k++){
   const times=painted.slice(k*3,k*3+3);
   assert.equal(times.length,3);
   for(let i=0;i<3;i++)assert.ok(Math.abs(times[i]-(k/30+i))<1e-9);
  }
 }finally{globalThis.document=prior;}
});

test('unknown transition/shape and visual audio edits fail before opening output',async()=>{
 for(const change of [
  p=>{p.effects={name:'future-effect'};},
  p=>{p.transitions={name:'future-wipe'};},
  p=>{p.clips[0].fxIn='future-wipe';},
  p=>{p.overlayClips[0].fxOut='future-wipe';},
  p=>{p.clips[0].fxDur=NaN;},
  p=>{p.overlayClips[0].shape='future-mask';},
  p=>{p.audioClips[0].fxIn='fade';},
  p=>{p.audioClips[0].filter={exposure:1};}
 ]){
  const p=proj(),M=fakeM();change(p);
  await assert.rejects(prepareAcceleratedMultitrack({project:p,media,M,imageFactory}),
   /preflight/);
  assert.equal(M.events.some(e=>e[0]==='start'),false);
 }
 for(const fx of ['none','fade','slide','zoom']){
  const p=proj(),M=fakeM();p.clips[0].fxIn=fx;p.clips[0].fxDur=.1;
  const prepared=await prepareAcceleratedMultitrack({project:p,media,M,imageFactory});
  assert.equal(prepared.project.clips[0].fxIn,fx);
  for(const item of prepared.used.values())await item.input?.dispose?.();
 }
});

test('early renderer failures dispose all inputs and cancel an allocated output exactly once',async()=>{
 for(const failure of ['fps','canvas','encoder']){
  const M=fakeM(),p=proj();let cancels=0;
  const BaseOutput=M.Output;
  M.Output=class extends BaseOutput{async cancel(){cancels++;}};
  if(failure==='encoder')M.CanvasSource=class{constructor(){throw Error('encoder setup failed');}};
  const prior=globalThis.document;
  globalThis.document=failure==='canvas'
   ?{createElement(){throw Error('canvas allocation failed');}}:context().document;
  try{
   const prepared=await prepareAcceleratedMultitrack({project:p,media,M,imageFactory});
   await assert.rejects(renderAcceleratedMultitrack({prepared,
    fps:failure==='fps'?0:30,writeAt:async(pos,bytes)=>bytes.length}),
    /frame rate|canvas allocation|encoder setup/);
   assert.equal(M.events.filter(e=>e[0]==='dispose').length,3);
   assert.equal(cancels,failure==='encoder'?1:0);
   assert.equal(M.events.some(e=>e[0]==='finalize'),false);
  }finally{globalThis.document=prior;}
 }
});

test('preflight budgets retained shared-source surfaces using decoded dimensions and temporal overlap',async()=>{
 const p=proj();p.audioClips=[];p.texts=[];
 p.clips=[{id:'main',asset_id:'main',start:0,in:0,out:2}];
 p.overlayClips=Array.from({length:13},(_,i)=>({id:'layer'+i,
  asset_id:'main',start:0,in:0,out:.1,x:.5,y:.5,scale:.2}));
 const sdk=()=>{
  const M=fakeM(),Base=M.Input;
  M.Input=class extends Base{async getPrimaryVideoTrack(){return {
   getDisplayWidth:async()=>1920,getDisplayHeight:async()=>1080};}};
  return M;
 };
 const M=sdk();
 await assert.rejects(prepareAcceleratedMultitrack({project:p,media,M}),/surfaces exceed memory budget/);
 assert.equal(M.events.filter(e=>e[0]==='dispose').length,1);
 assert.equal(M.events.some(e=>e[0]==='start'),false);
 // Same 13 authored overlays, but no overlap: only main + one inset retained.
 p.overlayClips.forEach((c,i)=>{c.start=i*.1;});
 const prepared=await prepareAcceleratedMultitrack({project:p,media,M:sdk()});
 assert.equal(prepared.used.get('main').canvasOptions.width,1920);
 assert.equal(prepared.used.get('main').canvasOptions.height,1080);
 await prepared.used.get('main').input.dispose();
});

test('preparation snapshots authoring and rejects reuse without disposing a running export',async()=>{
 const M=fakeM(),p=proj(),prior=globalThis.document,priorAudio=globalThis.AudioBuffer;
 globalThis.document=context().document;globalThis.AudioBuffer=PCM;
 try{
  const prepared=await prepareAcceleratedMultitrack({project:p,media,M,imageFactory});
  p.clips[0].asset_id='new-unvalidated-source';
  p.texts[0].text='changed after validation';
  assert.equal(prepared.project.clips[0].asset_id,'main');
  assert.equal(prepared.project.texts[0].text,'Wivra');
  let release;
  const blocked=new Promise(resolve=>{release=resolve;});
  const Base=M.CanvasSource;
  M.CanvasSource=class extends Base{async add(...args){await blocked;return super.add(...args);}};
  const first=renderAcceleratedMultitrack({prepared,sampleRate:8000,
   writeAt:async(pos,bytes)=>bytes.length});
  await assert.rejects(renderAcceleratedMultitrack({prepared,
   writeAt:async(pos,bytes)=>bytes.length}),/already consumed/);
  assert.equal(M.events.filter(e=>e[0]==='dispose').length,0);
  release();
  assert.equal((await first).videoFrames,18);
  assert.equal(M.events.filter(e=>e[0]==='dispose').length,3);
  await assert.rejects(renderAcceleratedMultitrack({prepared,
   writeAt:async(pos,bytes)=>bytes.length}),/already consumed/);
  assert.equal(M.events.filter(e=>e[0]==='dispose').length,3);
 }finally{globalThis.document=prior;globalThis.AudioBuffer=priorAudio;}
});
