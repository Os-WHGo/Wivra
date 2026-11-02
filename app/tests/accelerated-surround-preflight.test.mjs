import test from 'node:test';
import assert from 'node:assert/strict';
import {recordExperimentalNativeMultitrack} from '../accelerated-native-multitrack-export.mjs';

function fixture(channels){
  const seen=[],media={
    v:{kind:'video',url:'blob:v',w:640,h:360,duration:2},
    a:{kind:'audio',url:'blob:a',duration:2}
  };
  const project={clips:[{id:'video',asset_id:'v',start:0,in:0,out:.2}],
    audioClips:[{id:'voice',asset_id:'a',start:0,in:0,out:.2,role:'voice_primary'}],
    overlayClips:[],texts:[],format:{aspect:'original'}};
  class UrlSource{constructor(url){this.url=url;}}
  class Input{
    constructor({source}){this.url=source.url;}
    async getPrimaryVideoTrack(){return this.url==='blob:v'?{}:null;}
    async getPrimaryAudioTrack(){return this.url==='blob:a'?{
      getNumberOfChannels:async()=>channels
    }:null;}
    dispose(){seen.push('dispose:'+this.url);}
  }
  const M={Input,UrlSource,CanvasSink:class{},AudioBufferSink:class{},
    ALL_FORMATS:[],getFirstEncodableVideoCodec:async()=> 'avc',
    canEncodeAudio:async()=>true};
  const host={platform:'android',request:async()=>{seen.push('native-request');},
    sendWriteAt:async()=>{seen.push('native-write');}};
  return {project,media,M,host,seen};
}

test('surround dialogue channel is never silently dropped by native v2 stereo mixer',async()=>{
 const f=fixture(6);
 await assert.rejects(recordExperimentalNativeMultitrack({...f,
   expectAudio:true,experimentalAccelerated:true}),/Canales de audio no admitidos/);
 assert.ok(f.seen.includes('dispose:blob:v'));
 assert.ok(f.seen.includes('dispose:blob:a'));
 assert.equal(f.seen.some(x=>x.startsWith('native-')),false);
});

test('unknown audio channels fail closed before allocating a file',async()=>{
 const f=fixture(undefined);
 await assert.rejects(recordExperimentalNativeMultitrack({...f,
   expectAudio:true,experimentalAccelerated:true}),/Canales de audio no admitidos/);
 assert.equal(f.seen.some(x=>x.startsWith('native-')),false);
});
