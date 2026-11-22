// The editor stores audioClips[].track (rows 1..4) for layout only; the stable
// exporter mixes every row the same way. The accelerated preflight used to
// reject any project with an audio clip moved to another row. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject} from '../../core/project.mjs';
import {applyBatch} from '../../core/operations.mjs';
import {prepareAcceleratedMultitrack,renderAcceleratedMultitrack}
 from '../accelerated-multitrack-renderer.mjs';

class PCM{
 constructor({length,sampleRate,numberOfChannels}){
  this.length=length;this.sampleRate=sampleRate;this.numberOfChannels=numberOfChannels;
  this.data=Array.from({length:numberOfChannels},()=>new Float32Array(length));
 }
 getChannelData(i){return this.data[i];}
}
function sdk(audio){
 class Source{constructor(url){this.url=url;}}
 class Input{
  constructor({source}){this.url=source.url;}
  async getPrimaryVideoTrack(){return this.url==='blob:camera'?{id:this.url}:null;}
  async getPrimaryAudioTrack(){return {id:this.url,getNumberOfChannels:async()=>1};}
  dispose(){}
 }
 class CanvasSink{async getCanvas(){return {canvas:{width:320,height:180}};}}
 class AudioBufferSink{
  constructor(track){this.track=track;}
  async *buffers(a,b){
   const sr=8000,begin=Math.max(0,Math.floor(a*sr)),end=Math.ceil(b*sr);
   if(end<=begin)return;
   const buffer=new PCM({length:end-begin,sampleRate:sr,numberOfChannels:1});
   for(let i=0;i<buffer.length;i++)
    buffer.data[0][i]=(this.track.id==='blob:camera'?.2:.45)*Math.sin((begin+i)/7);
   yield {timestamp:begin/sr,buffer};
  }
 }
 class Output{
  constructor({target}){this.target=target;}
  addVideoTrack(source,{frameRate}={}){source.fps=frameRate??30;}addAudioTrack(){}
  async start(){}
  async finalize(){
   const writer=this.target.stream.getWriter();
   await writer.write({position:0,data:new Uint8Array([1,2,3,4])});
   writer.releaseLock();
  }
 }
 return {Input,UrlSource:Source,CanvasSink,AudioBufferSink,Output,
  CanvasSource:class{
   constructor(canvas,options={}){this.canvas=canvas;this.options=options;this.fps=30;}
   async add(){
    this.options.onEncoderConfig?.({codec:this.options.fullCodecString,
     width:this.canvas.width,height:this.canvas.height,
     framerate:this.fps,bitrate:this.options.bitrate,avc:{format:'avc'}});
   }
  },
  AudioBufferSource:class{
   constructor(options={}){this.options=options;}
   async add(b){
    this.options.onEncoderConfig?.({codec:this.options.fullCodecString,
     sampleRate:b.sampleRate,numberOfChannels:2,bitrate:this.options.bitrate});
    audio.push([...b.getChannelData(0)],[...b.getChannelData(1)]);
   }
  },
  StreamTarget:class{constructor(stream){this.stream=stream;}},
  Mp4OutputFormat:class{},WebMOutputFormat:class{},ALL_FORMATS:[],
  getFirstEncodableVideoCodec:async()=> 'avc',canEncodeAudio:async()=>true};
}
const media={camera:{url:'blob:camera',kind:'video',w:320,h:180,duration:2},
 mic:{url:'blob:mic',kind:'audio',duration:2},music:{url:'blob:music',kind:'audio',duration:2}};
const authored=(rows)=>({clips:[{id:'camera',asset_id:'camera',start:0,in:0,out:1}],
 overlayClips:[],texts:[],format:{aspect:'original'},
 audioClips:[{id:'mic',asset_id:'mic',start:.2,in:0,out:.5,role:'voice_primary',...(rows?{track:3}:{})},
  {id:'music',asset_id:'music',start:0,in:0,out:1,role:'music',volume:.5,...(rows?{track:2}:{})}]});

async function renderPcm(project,options={}){
 const audio=[];
 const oldDoc=globalThis.document,oldBuffer=globalThis.AudioBuffer;
 globalThis.AudioBuffer=PCM;
 globalThis.document={createElement:()=>({
  getContext:()=>({fillRect(){},drawImage(){},save(){},restore(){},set fillStyle(v){}})})};
 try{
  const prepared=await prepareAcceleratedMultitrack({project,media,M:sdk(audio),
   platform:'android',expectedAudio:true});
  const result=await renderAcceleratedMultitrack({prepared,
   writeAt:async(_p,bytes)=>bytes.length,sampleRate:8000,fps:30,...options});
  return {result,audio};
 }finally{globalThis.document=oldDoc;globalThis.AudioBuffer=oldBuffer;}
}

test('audio rows do not change the accelerated mix', async()=>{
 const flat=await renderPcm(authored(false));
 const rows=await renderPcm(authored(true));
 assert.equal(rows.result.audioBlocks,flat.result.audioBlocks);
 assert.ok(flat.audio.length>0);
 assert.deepEqual(rows.audio,flat.audio);
 assert.ok(rows.audio[0].some(v=>Math.abs(v)>.01),'mix is not silent');
});

test('projects whose editor moved audio to rows 2..4 pass preflight; invalid rows fail', async()=>{
 const project=createProject({assets:[{id:'camera',kind:'video',duration:2},
  {id:'mic',kind:'audio',duration:2}]});
 const r=applyBatch(project,[{op:'add_clip',asset_id:'camera',start:0},
  {op:'add_audio_clip',asset_id:'mic',start:0,out:1,role:'voice_primary',track:2}],project.revision);
 assert.equal(r.ok,true,JSON.stringify(r));
 const added=r.project??project;
 const moved=applyBatch(added,[{op:'set_audio_clip',clip_id:added.audioClips[0].id,track:4}],
  added.revision);
 assert.equal(moved.ok,true,JSON.stringify(moved));
 const edited=moved.project??added;
 assert.equal(edited.audioClips[0].track,4);
 const probe={Input:class{constructor(){throw Error('PREFLIGHT_PASSED');}},UrlSource:class{},
  CanvasSink:class{},AudioBufferSink:class{}};
 await assert.rejects(prepareAcceleratedMultitrack({project:edited,media,M:probe,platform:'qa'}),
  /PREFLIGHT_PASSED/);
 for(const track of [0,5,1.5,'2',-1]){
  const bad=structuredClone(edited);bad.audioClips[0].track=track;
  await assert.rejects(prepareAcceleratedMultitrack({project:bad,media,M:probe,platform:'qa'}),
   /invalid audio track row/,String(track));
 }
});

// "Volumen del video": the editor measures one gain (loudnessPlan) and both
// engines apply it as a single master gain, clamped to +/-12 dB, ignored
// below 0.05 dB, without compressor or limiter. — Claude
test('accelerated loudness applies the same single master gain as the stable exporter',async()=>{
 const flat=await renderPcm(authored(false));
 const scaled=(db)=>flat.audio.map(ch=>ch.map(v=>Math.fround(v*10**(db/20))));
 const plus=await renderPcm(authored(false),{loudnessGainDb:6});
 assert.equal(plus.result.loudnessGainDb,6);
 assert.deepEqual(plus.audio,scaled(6));
 const minus=await renderPcm(authored(false),{loudnessGainDb:-3.5});
 assert.deepEqual(minus.audio,scaled(-3.5));
 const tiny=await renderPcm(authored(false),{loudnessGainDb:.04});
 assert.equal(tiny.result.loudnessGainDb,0);
 assert.deepEqual(tiny.audio,flat.audio);
 const clamped=await renderPcm(authored(false),{loudnessGainDb:30});
 assert.equal(clamped.result.loudnessGainDb,12);
 assert.deepEqual(clamped.audio,scaled(12));
 await assert.rejects(renderPcm(authored(false),{loudnessGainDb:NaN}),/invalid loudness gain/);
});
