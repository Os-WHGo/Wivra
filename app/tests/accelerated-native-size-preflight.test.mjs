import test from 'node:test';
import assert from 'node:assert/strict';
import {recordExperimentalNativeMultitrack} from '../accelerated-native-multitrack-export.mjs';

test('unusable output-size estimate frees decoder before any native write',async()=>{
 const seen=[];
 class Input{
  async getPrimaryVideoTrack(){return {computeDuration:async()=>2};}
  async getPrimaryAudioTrack(){return null;}
  dispose(){seen.push('disposed');}
 }
 const M={Input,UrlSource:class{},CanvasSink:class{},AudioBufferSink:class{},
  ALL_FORMATS:[],getFirstEncodableVideoCodec:async()=> 'avc',
  canEncodeAudio:async()=>true};
 const host={platform:'android',request:async()=>{seen.push('native');},
  sendWriteAt:async()=>{seen.push('write');}};
 const project={clips:[{id:'a',asset_id:'v',start:0,in:0,out:.25}],
  overlayClips:[],audioClips:[],texts:[],format:{aspect:'original'}};
 const media={v:{kind:'video',url:'blob:v',duration:2,w:320,h:180}};
 for(const estimatedBytes of [-1,Number.MAX_SAFE_INTEGER]){
  await assert.rejects(recordExperimentalNativeMultitrack({
   project,media,M,host,expectAudio:false,experimentalAccelerated:true,
   estimatedBytes
  }),/Tamaño estimado|Duración\/tamaño/);
 }
 assert.equal(seen.filter(x=>x==='disposed').length,2);
 assert.equal(seen.includes('native'),false);
 assert.equal(seen.includes('write'),false);
});
