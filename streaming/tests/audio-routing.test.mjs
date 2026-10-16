import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudioRoutingPlan,portableAudioCapabilities} from '../audio-routing.mjs';

const mic=(id='src-mic1')=>({
  id,kind:'microphone',captureVerified:true,isolated:true
});
const music=(id='src-music1')=>({
  id,kind:'music',captureVerified:true,isolated:true
});

test('mobile and desktop hosts share one portable descriptor, no fake desktop app',()=>{
  const capabilities=portableAudioCapabilities();
  assert.deepEqual(capabilities.hosts,['ios','android','windows','macos','linux']);
  assert.equal(capabilities.audioEngineImplemented,false);
  assert.equal(capabilities.desktopApplicationImplemented,false);
  for(const host of capabilities.hosts){
    const p=createAudioRoutingPlan({host,inputs:[mic(),music()]});
    assert.equal(p.host,host);
    assert.equal(p.schemaVersion,'wivra-audio-routing-1');
    assert.equal(p.nativeAudioVerified,false);
    assert.equal(p.remoteAudioPublished,false);
    assert.equal(p.copyrightClearanceVerified,false);
  }
});
test('music in LIVE and isolated archive but absent in candidate VOD',()=>{
  const p=createAudioRoutingPlan({platform:'twitch',host:'macos',inputs:[mic(),music()]});
  assert.deepEqual(p.feeds.live,['src-mic1','src-music1']);
  assert.deepEqual(p.feeds.vod,['src-mic1']);
  assert.deepEqual(p.feeds.archive,['src-mic1','src-music1']);
  assert.equal(p.cleanVODCandidate,true);
  assert.equal(p.vodDelivery,'local-clean-recording-only');
  assert.ok(p.warnings.some(w=>w.includes('NOT been verified')));
  assert.throws(()=>p.feeds.live.push('src-new'),TypeError);
});
test('native Twitch VOD track requires explicit verified output adapter',()=>{
  const p=createAudioRoutingPlan({platform:'twitch',host:'windows',
    inputs:[mic(),music()],adapterCapabilities:{dedicatedVODAudioVerified:true}});
  assert.equal(p.vodDelivery,'twitch-native-vod-track-capability');
  assert.equal(p.remoteAudioPublished,false);
  for(const platform of ['youtube','kick','tiktok','instagram','facebook','custom']){
    const plan=createAudioRoutingPlan({platform,host:'linux',inputs:[mic(),music()]});
    assert.equal(plan.vodDelivery,'local-clean-recording-only');
    assert.ok(plan.warnings.some(w=>w.includes('No universal remote')));
    assert.throws(()=>createAudioRoutingPlan({
      platform,inputs:[mic()],adapterCapabilities:{dedicatedVODAudioVerified:true}
    }),/only been established for Twitch/);
  }
});
test('mixed mic containing background music cannot claim clean VOD',()=>{
  const p=createAudioRoutingPlan({
    inputs:[{...mic(),isolated:false},music()]
  });
  assert.deepEqual(p.feeds.vod,['src-mic1']);
  assert.equal(p.cleanVODCandidate,false);
  assert.ok(p.warnings.some(w=>w.includes('cannot be removed by routing')));
});
test('explicit VOD music inclusion is accepted but never described as clean',()=>{
  const p=createAudioRoutingPlan({inputs:[mic(),{
    ...music(),routing:{live:true,vod:true,archive:true}
  }]});
  assert.equal(p.cleanVODCandidate,false);
  assert.equal(p.musicExcludedFromVOD,false);
  assert.ok(p.warnings.some(w=>w.includes('contains a music input')));
});
test('do not claim unauthorized captures, guess sources, or ingest private tokens',()=>{
  assert.throws(()=>createAudioRoutingPlan({inputs:[{
    ...mic(),captureVerified:false
  }]}),/explicitly verified/);
  assert.throws(()=>createAudioRoutingPlan({inputs:[{
    ...mic(),token:'abc'
  }]}),/private fields/);
  assert.throws(()=>createAudioRoutingPlan({inputs:[
    mic(),mic()
  ]}),/unique/);
  assert.throws(()=>createAudioRoutingPlan({inputs:[{
    ...music(),routing:{live:true,vod:false}
  }]}),/all three/);
  assert.throws(()=>createAudioRoutingPlan({
    platform:'kwai',inputs:[mic()]
  }),/Unsupported LIVE platform/);
  assert.throws(()=>createAudioRoutingPlan({
    host:'browser-unverified',inputs:[mic()]
  }),/Unsupported audio host/);
});
test('source consent and safety warnings also apply when video stays local',()=>{
  const p=createAudioRoutingPlan({host:'android',platform:'youtube',inputs:[]});
  assert.deepEqual(p.feeds.archive,[]);
  assert.ok(p.warnings.some(w=>w.includes('permission to broadcast')));
  assert.ok(p.warnings.some(w=>w.includes('silent VOD')));
  assert.equal(p.cleanVODCandidate,false);
});
