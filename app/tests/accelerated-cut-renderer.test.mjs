import test from 'node:test';
import assert from 'node:assert/strict';
import { acceleratedCutEligibility, checkedRandomWrite,
  renderAcceleratedCuts, ACCELERATED_CUT_MAX_VIDEO_GAP_SECONDS } from '../accelerated-cut-renderer.mjs';

function project() {
  return { clips: [
    { id: 'a', asset_id: 'v', start: 0, in: 1, out: 1.5, volume: 1 },
    { id: 'b', asset_id: 'v', start: .5, in: 3, out: 3.5, volume: 1 }
  ], overlayClips: [], audioClips: [], texts: [], format: { aspect: 'original' } };
}
const media = { v: { url: 'blob:synthetic', kind: 'video', w: 640, h: 360 } };

test('Mediabunny accelerated cuts accept only a same-source lossless-semantics subset', () => {
  const good = acceleratedCutEligibility(project(), media);
  assert.equal(good.eligible, true);
  assert.equal(good.totalSeconds, 1);
  assert.deepEqual(good.cuts, [{ in:1,out:1.5 },{ in:3,out:3.5 }]);
  for (const change of [
    p => p.texts.push({ text:'Wivra' }),
    p => p.audioClips.push({ asset_id:'wav' }),
    p => p.overlayClips.push({ asset_id:'overlay' }),
    p => p.clips[1].start = 1,
    p => p.clips[1].speed = 2,
    p => p.clips[1].volume = 0.6,
    p => p.clips[0].muted = true,
    p => p.clips[0].filters = ['cinematic'],
    p => p.clips[0].opacity = 0.5,
    p => p.clips[0].look = 'cinematic',
    p => p.clips[0].newVisualEffect = 'future',
    p => p.clips[0].asset_id = 'other',
    p => p.format.aspect = '9:16'
  ]) {
    const p = project(); change(p);
    assert.equal(acceleratedCutEligibility(p, media).eligible, false);
  }
  assert.equal(acceleratedCutEligibility(project(),media,{maxSeconds:0.4}).eligible,false);
  assert.equal(acceleratedCutEligibility(project(),media,{maxCuts:1}).eligible,false);
  assert.equal(acceleratedCutEligibility(project(),media,{loudnessGainDb:2}).eligible,false);
});

test('random-access writer explicitly supports header patches but rejects corrupt/out-of-range writes',async()=>{
  const writes=[];const writer=checkedRandomWrite(async (pos,data)=>{writes.push({pos,bytes:[...data]});return data.length;});
  await writer.write(100,new Uint8Array([1,2,3]));
  await writer.write(0,new Uint8Array([4,5])); // patch earlier offset
  assert.equal(writer.writes,2);assert.equal(writer.highWaterBytes,103);
  assert.deepEqual(writes.map(x=>x.pos),[100,0]);
  for (const [pos,data] of [[-1,new Uint8Array([1])],[1.4,new Uint8Array([1])],
    [0,new Uint8Array([])],[Number.MAX_SAFE_INTEGER,new Uint8Array([1])],
    [0,new Uint8Array(5 * 1024 * 1024)]]) {
    await assert.rejects(writer.write(pos,data), /Invalid/);
  }
  const broken=checkedRandomWrite(async()=>0);
  await assert.rejects(broken.write(0,new Uint8Array([1])),/Incomplete/);
});

function fakeM({withAudio=true}={}) {
  const events = [];
  class Input {
    async getPrimaryVideoTrack() {return {};}
    async getPrimaryAudioTrack() {return withAudio ? {} : null;}
  }
  class CanvasSink {
    async *canvases(from,to) { yield {timestamp:from,duration:to-from,canvas:{}}; }
  }
  class AudioBufferSink {
    async *buffers(from,to) {
      const n=Math.round((to-from)*10);
      const channels=[new Float32Array(n).fill(0.2)];
      yield {timestamp:from,duration:to-from,buffer:{
        sampleRate:10, numberOfChannels:1,
        getChannelData(ch){return channels[ch];}
      }};
    }
  }
  class CanvasSource { async add(t,d) {events.push({type:'video',t,d});}}
  class AudioBufferSource {async add(b) {events.push({type:'audio',length:b.length});}}
  class StreamTarget {constructor(writable){this.writable=writable;}}
  class Output {
    constructor({target}){this.target=target;}
    addVideoTrack(){events.push({type:'video-track'});}
    addAudioTrack(){events.push({type:'audio-track'});}
    async start(){events.push({type:'start'});}
    async finalize(){
      const w=this.target.writable.getWriter();
      await w.write({position:0,data:new Uint8Array([1,2,3])});
      await w.write({position:1,data:new Uint8Array([8])}); // header patch
      w.releaseLock();
      events.push({type:'finish'});
    }
  }
  return {M: {Input, UrlSource: class{}, ALL_FORMATS:[], CanvasSink, AudioBufferSink,
    CanvasSource, AudioBufferSource, StreamTarget, Output,
    Mp4OutputFormat:class{},WebMOutputFormat:class{},
    getFirstEncodableVideoCodec: async()=> 'avc',canEncodeAudio: async codec=>codec==='aac'||codec==='opus'},
    events};
}

test('real frame/audio timing loop can render A/V cuts and patch file offsets',async()=>{
  const {M,events}=fakeM();
  const prior=globalThis.document, oldAudio=globalThis.AudioBuffer;
  globalThis.document={createElement(){return {width:0,height:0,getContext(){return {
    drawImage(){}, fillText(){}, set fillStyle(x){}, set font(x){}, set textAlign(x){}
  };}};}};
  globalThis.AudioBuffer=class {constructor({length,sampleRate,numberOfChannels}){
    this.length=length;this.sampleRate=sampleRate;this.numberOfChannels=numberOfChannels;
  }copyToChannel(){}};
  try{
    let positions=[];
    const result=await renderAcceleratedCuts({M,sourceUrl:'blob:synthetic',width:640,height:360,
      cuts:[{in:1,out:1.5},{in:3,out:3.5}],expectedAudio:true,
      writeAt:async(pos,data)=>{positions.push(pos);return data.length;}});
    assert.equal(result.engine,'webcodecs-mediabunny');
    assert.equal(result.container,'mp4');
    assert.equal(result.audioCodec,'aac');
    assert.equal(result.durationSeconds,1);
    assert.equal(result.frames,2);
    assert.equal(result.audioBuffers,2);
    assert.deepEqual(positions,[0,1]);
    assert.deepEqual(events.filter(x=>x.type==='video').map(x=>x.t),[0,.5]);
    assert.ok(events.some(x=>x.type==='finish'));
  }finally{globalThis.document=prior;globalThis.AudioBuffer=oldAudio;}
});

test('never silently drop source audio, output parts, or missing native random access',async()=>{
  const {M}=fakeM({withAudio:false});
  await assert.rejects(renderAcceleratedCuts({M,sourceUrl:'blob:a',width:640,height:360,
    cuts:[{in:0,out:1}],writeAt:async()=>1,expectedAudio:true}),/Source audio disappeared/);
  await assert.rejects(renderAcceleratedCuts({M,sourceUrl:'blob:a',width:640,height:360,
    cuts:[{in:0,out:1}],writeAt:null}),/Random-access native writer required/);
  await assert.rejects(renderAcceleratedCuts({M,sourceUrl:'blob:a',width:640,height:360,
    cuts:[{in:0,out:1}],writeAt:async()=>1,isCancelled:()=>true}),/cancelled/);
});

test('cut renderer rejects missing first, interior or final video frames before publishing',async()=>{
 assert.equal(ACCELERATED_CUT_MAX_VIDEO_GAP_SECONDS,.1);
 const invalidSequences=[
  [{timestamp:1.3,duration:.2,canvas:{}}],
  [{timestamp:1,duration:.15,canvas:{}},{timestamp:1.35,duration:.15,canvas:{}}],
  [{timestamp:1,duration:.2,canvas:{}}],
  [{timestamp:NaN,duration:.5,canvas:{}}],
  [{timestamp:1,duration:Infinity,canvas:{}}]
 ];
 const old=globalThis.document;
 globalThis.document={createElement(){return {width:0,height:0,getContext(){
  return {drawImage(){}};
 }};}};
 try{
  for(const frames of invalidSequences){
   const {M,events}=fakeM({withAudio:false});
   M.CanvasSink=class {async *canvases(){for(const frame of frames)yield frame;}};
   let chunks=0;
   await assert.rejects(renderAcceleratedCuts({
    M,sourceUrl:'blob:synthetic',width:640,height:360,
    cuts:[{in:1,out:1.5}],expectedAudio:false,
    writeAt:async(_pos,data)=>{chunks++;return data.byteLength;}
   }),/frame gap|ends before|timestamp or duration/);
   assert.equal(chunks,0,'failed decode must not finalize a native file');
   assert.ok(!events.some(x=>x.type==='finish'));
  }
 }finally{globalThis.document=old;}
});

test('cut renderer accepts contiguous variable frame durations without requiring fixed FPS source',async()=>{
 const {M}=fakeM({withAudio:false});
 M.CanvasSink=class {async *canvases(){
  yield {timestamp:1,duration:.08,canvas:{}};
  yield {timestamp:1.08,duration:.24,canvas:{}};
  yield {timestamp:1.32,duration:.18,canvas:{}};
 }};
 const old=globalThis.document;
 globalThis.document={createElement(){return {width:0,height:0,getContext(){
  return {drawImage(){}};
 }};}};
 try{
  const res=await renderAcceleratedCuts({
   M,sourceUrl:'blob:synthetic',width:640,height:360,
   cuts:[{in:1,out:1.5}],expectedAudio:false,
   writeAt:async(_pos,data)=>data.byteLength
  });
  assert.equal(res.frames,3);
  assert.equal(res.durationSeconds,.5);
  assert.ok(res.writes>0);
 }finally{globalThis.document=old;}
});
