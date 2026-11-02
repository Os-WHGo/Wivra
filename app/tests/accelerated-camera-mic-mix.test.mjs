import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAcceleratedMultitrack,renderAcceleratedMultitrack}
 from '../accelerated-multitrack-renderer.mjs';

test('camera original audio and delayed microphone are both mixed into exported PCM',async()=>{
 const audio=[],starts=[];
 const oldDoc=globalThis.document,oldBuffer=globalThis.AudioBuffer;
 class PCM{
  constructor({length,sampleRate,numberOfChannels}){
   this.length=length;this.sampleRate=sampleRate;this.numberOfChannels=numberOfChannels;
   this.data=Array.from({length:numberOfChannels},()=>new Float32Array(length));
  }
  getChannelData(i){return this.data[i];}
 }
 class Source{constructor(url){this.url=url;}}
 class Input{
  constructor({source}){this.url=source.url;}
  async getPrimaryVideoTrack(){return this.url==='blob:camera'?{id:this.url}:null;}
  async getPrimaryAudioTrack(){return {id:this.url,getNumberOfChannels:async()=>1};}
  dispose(){}
 }
 class CanvasSink{
  async getCanvas(){return {canvas:{width:320,height:180}};}
 }
 class AudioBufferSink{
  constructor(track){this.track=track;}
  async *buffers(a,b){
   const sr=8000,begin=Math.max(0,Math.floor(a*sr)),end=Math.ceil(b*sr);
   if(end<=begin)return;
   const buffer=new PCM({length:end-begin,sampleRate:sr,numberOfChannels:1});
   buffer.data[0].fill(this.track.id==='blob:camera'?.2:.45);
   yield {timestamp:begin/sr,buffer};
  }
 }
 class Output{
  constructor({target}){this.target=target;}
  addVideoTrack(){}addAudioTrack(){}
  async start(){}
  async finalize(){
   const writer=this.target.stream.getWriter();
   await writer.write({position:0,data:new Uint8Array([1,2,3,4])});
   writer.releaseLock();
  }
 }
 const M={Input,UrlSource:Source,CanvasSink,AudioBufferSink,Output,
  CanvasSource:class{async add(){}},
  AudioBufferSource:class{async add(b){audio.push(b);}},
  StreamTarget:class{constructor(stream){this.stream=stream;}},
  Mp4OutputFormat:class{},WebMOutputFormat:class{},ALL_FORMATS:[],
  getFirstEncodableVideoCodec:async()=> 'avc',canEncodeAudio:async()=>true};
 const project={clips:[{id:'camera',asset_id:'camera',start:0,in:0,out:.5}],
  overlayClips:[],audioClips:[{id:'mic',asset_id:'mic',start:.2,in:0,out:.2}],
  texts:[],format:{aspect:'original'}};
 const media={camera:{url:'blob:camera',kind:'video',w:320,h:180,duration:2},
  mic:{url:'blob:mic',kind:'audio',duration:2}};
 globalThis.AudioBuffer=PCM;
 globalThis.document={createElement:()=>({
  getContext:()=>({fillRect(){},drawImage(){},save(){},restore(){},set fillStyle(v){}})
 })};
 try{
  const prepared=await prepareAcceleratedMultitrack({project,media,M,
   platform:'android',expectedAudio:true});
  assert.equal(prepared.audible.length,2);
  const result=await renderAcceleratedMultitrack({
   prepared,writeAt:async(pos,bytes)=>bytes.length,sampleRate:8000,fps:30
  });
  assert.equal(result.videoFrames,15);
  assert.equal(result.audioBlocks,1);
  assert.equal(audio.length,1);
  const left=audio[0].getChannelData(0);
  assert.ok(Math.abs(left[200]-.2)<.01);
  assert.ok(Math.abs(left[2400]-.65)<.01);
  assert.ok(Math.abs(left[3900]-.2)<.01);
  assert.equal(result.rendererReadyForProduction,false);
 }finally{globalThis.document=oldDoc;globalThis.AudioBuffer=oldBuffer;}
});
