import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeAcceleratedMultitrackParity} from '../accelerated-multitrack-parity.mjs';
const base = () => ({clips:[{id:'still',asset_id:'photo',start:0,in:0,out:2}],overlayClips:[],audioClips:[],texts:[],format:{aspect:'original'}});
const media = {photo:{url:'blob:photo',kind:'image',w:1080,h:1920}};
test('main still images are eligible for parity ledger without losing timeline duration',()=>{
 const outcome=analyzeAcceleratedMultitrackParity(base(),media);
 assert.equal(outcome.valid,true);
 assert.equal(outcome.totalSeconds,2);
 assert.equal(outcome.tracks[0].sourceKind,'image');
 assert.equal(outcome.rendererReady,false);
});

test('an animated GIF is rejected before any decoder or native output starts',async()=>{
 const {prepareAcceleratedMultitrack}=await import('../accelerated-multitrack-renderer.mjs');
 const project=base();
 const M={Input:class{},UrlSource:class{},CanvasSink:class{},AudioBufferSink:class{}};
 await assert.rejects(prepareAcceleratedMultitrack({
  project,media:{photo:{...media.photo,gif:true}},M,
  imageFactory:async()=>({naturalWidth:1080,naturalHeight:1920}),
  expectedAudio:false
 }),/animated GIF/);
});

test('main photo preflight resolves output dimensions without a video decoder',async()=>{
 const {prepareAcceleratedMultitrack}=await import('../accelerated-multitrack-renderer.mjs');
 const M={Input:class{},UrlSource:class{},CanvasSink:class{},AudioBufferSink:class{},
   getFirstEncodableVideoCodec:async()=> 'avc',canEncodeAudio:async()=>true};
 const prepared=await prepareAcceleratedMultitrack({
  project:base(),media,M,expectedAudio:false,
  imageFactory:async()=>({naturalWidth:1080,naturalHeight:1920})
 });
 assert.equal(prepared.codec.container,'mp4');
 assert.equal(prepared.totalSeconds,2);
 assert.equal(prepared.used.get('photo').kind,'image');
 assert.equal(prepared.used.get('photo').input,undefined);
});
