import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBoundedRandomMemoryWriter,recordExperimentalAcceleratedProject} from '../accelerated-memory-export.mjs';
import {recordProject} from '../export.mjs';
import {ACCELERATED_EXPORT_IMPLEMENTED} from '../export-engine-policy.mjs';

const project = () => ({clips:[{id:'a',asset_id:'v',start:0,in:0,out:1,volume:1}],
 overlayClips:[],audioClips:[],texts:[],format:{aspect:'original'}});
const media = {v:{kind:'video',url:'blob:synthetic',w:640,h:360}};

test('memory export permits real header patching but rejects holes/overrun',async()=>{
  const writer=createBoundedRandomMemoryWriter({maximumBytes:4096});
  await writer.writeAt(0,new Uint8Array([1,2,3]));
  await writer.writeAt(1,new Uint8Array([8]));
  assert.deepEqual([...writer.finalize()],[1,8,3]);
  assert.equal(writer.highWaterBytes,3);
  const holes=createBoundedRandomMemoryWriter({maximumBytes:4096});
  await holes.writeAt(100,new Uint8Array([1]));
  assert.throws(()=>holes.finalize(),/faltan bytes/);
  await assert.rejects(holes.writeAt(4095,new Uint8Array([1,2])),/Límite/);
});

function fakeSDK(){
  class Input {async getPrimaryVideoTrack(){return {};} async getPrimaryAudioTrack(){return null;}}
  class CanvasSink{async *canvases(a,b){yield {timestamp:a,duration:b-a,canvas:{}};}}
  class CanvasSource{async add(){}}
  class StreamTarget{constructor(writable){this.writable=writable;}}
  class Output{
    constructor({target}){this.target=target;}
    addVideoTrack(){}
    async start(){}
    async finalize(){
      const writer=this.target.writable.getWriter();
      await writer.write({position:0,data:new Uint8Array(1500).fill(7)});
      await writer.write({position:0,data:new Uint8Array([0,1,2])});
      writer.releaseLock();
    }
  }
  return {Input,UrlSource:class{},CanvasSink,CanvasSource,StreamTarget,Output,
   ALL_FORMATS:[],Mp4OutputFormat:class{},WebMOutputFormat:class{},
   getFirstEncodableVideoCodec:async()=> 'avc',canEncodeAudio:async()=>true};
}

test('the actual recordProject API can explicitly exercise accelerated cuts, never on auto',async()=>{
  const oldDocument=globalThis.document,oldVendor=globalThis.Mediabunny;
  globalThis.Mediabunny=fakeSDK();
  globalThis.document={createElement:()=>({getContext:()=>({drawImage(){}})})};
  try{
    const result=await recordProject({project:project(),media,saveMode:'memory',experimentalAccelerated:true});
    assert.equal(result.experimental,true);
    assert.equal(result.verifiedOnDevice,false);
    assert.equal(result.mime,'video/mp4');
    assert.equal(result.blob.size,1500);
    assert.equal(result.hasAudio,false);
    assert.equal((new Uint8Array(await result.blob.arrayBuffer()))[1],1);
    assert.equal(ACCELERATED_EXPORT_IMPLEMENTED,false);
    await assert.rejects(recordProject({project:project(),media,saveMode:'auto',
     experimentalAccelerated:true}),/todavía no dispone/);
  }finally {globalThis.document=oldDocument;globalThis.Mediabunny=oldVendor;}
});

test('experimental method rejects unsupported edits before silently dropping tracks',async()=>{
  const p=project();p.texts=[{start:0,end:1,text:'critical'}];
  await assert.rejects(recordExperimentalAcceleratedProject({project:p,media,M:fakeSDK()}),/other-tracks/);
  await assert.rejects(recordExperimentalAcceleratedProject({project:project(),media,M:null}),/Mediabunny/);
  const source=readFileSync(new URL('../export.mjs',import.meta.url),'utf8');
  assert.match(source,/if \(experimentalAccelerated === true\)/);
  assert.match(source,/saveMode !== 'memory'/);
  assert.match(source,/const engineSelection = selectExportEngine/);
  assert.doesNotMatch(source,/ACCELERATED_EXPORT_IMPLEMENTED = true/);
});
