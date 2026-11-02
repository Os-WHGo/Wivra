import test from 'node:test';
import assert from 'node:assert/strict';
import {recordProject} from '../export.mjs';

const project=()=>({
  clips:[{id:'c',asset_id:'v',start:0,in:0,out:1}],
  overlayClips:[],audioClips:[],texts:[],format:{aspect:'original'}
});
const media={v:{kind:'video',url:'blob:v',w:320,h:180,duration:2}};
const common=()=>({project:project(),media,saveMode:'auto',
  experimentalAccelerated:true,acceleratedExpectAudio:false});

test('production recordProject cannot activate QA even by requesting webcodecs',async()=>{
  const old=globalThis.WivraAcceleratedQA;
  let used=0;
  globalThis.WivraAcceleratedQA={recordOnNative:async()=>{used++;}};
  try{
    await assert.rejects(recordProject({...common(),
      experimentalAccelerated:false,exportEngine:'webcodecs'}),/MediaRecorder/);
    assert.equal(used,0);
  }finally{globalThis.WivraAcceleratedQA=old;}
});

test('recordProject QA native bridge fails closed in ordinary builds',async()=>{
  const old=globalThis.WivraAcceleratedQA;
  globalThis.WivraAcceleratedQA=undefined;
  try{
    await assert.rejects(recordProject(common()),/todavía no dispone de guardado nativo/);
  }finally{globalThis.WivraAcceleratedQA=old;}
});

test('recordProject native experimental route requires explicit verified audio intent',async()=>{
  const old=globalThis.WivraAcceleratedQA;
  let used=0;
  globalThis.WivraAcceleratedQA={recordOnNative:async()=>{used++;}};
  try{
    const args=common();delete args.acceleratedExpectAudio;
    await assert.rejects(recordProject(args),/presencia de audio/);
    await assert.rejects(recordProject({...common(),acceleratedExpectAudio:'false'}),/presencia de audio/);
    assert.equal(used,0);
  }finally{globalThis.WivraAcceleratedQA=old;}
});

test('QA native route refuses loudness override and incomplete media acknowledgments',async()=>{
  const old=globalThis.WivraAcceleratedQA;
  let used=0;
  globalThis.WivraAcceleratedQA={recordOnNative:async()=>{used++;}};
  try{
    for(const opt of [
      {loudnessGainDb:4},{loudnessGainDb:NaN},
      {allowIncompleteAudio:true},{allowIncompleteOverlay:true},
      {saveMode:'broken'}
    ])await assert.rejects(recordProject({...common(),...opt}),/sin paridad/);
    assert.equal(used,0);
  }finally{globalThis.WivraAcceleratedQA=old;}
});

test('recordProject QA passes original timeline and cancellation into real v2 entry',async()=>{
  const old=globalThis.WivraAcceleratedQA;
  let received,called=0;
  globalThis.WivraAcceleratedQA={recordOnNative:async args=>{
    received=args;called++;
    return {experimental:true,verifiedNative:true,verifiedOnDevice:false};
  }};
  const cancelled=()=>false,progress=()=>{};
  try{
    const outcome=await recordProject({...common(),fps:24,
      isCancelled:cancelled,onProgress:progress,acceleratedExpectAudio:true});
    assert.equal(outcome.verifiedNative,true);
    assert.equal(called,1);
    assert.equal(received.project.clips[0].asset_id,'v');
    assert.equal(received.media,media);
    assert.equal(received.expectAudio,true);
    assert.equal(received.isCancelled,cancelled);
    assert.equal(received.onProgress,progress);
    assert.equal(received.experimentalAccelerated,true);
    assert.equal(received.fps,24);
  }finally{globalThis.WivraAcceleratedQA=old;}
});
