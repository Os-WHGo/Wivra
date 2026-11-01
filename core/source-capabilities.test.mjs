import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceCandidate, applyEvidence, canUseForLocalComposition,
  canStartDirectLive, validateMultiSourcePlan} from './source-capabilities.mjs';

const source = (id, modes = ['local-frames']) =>
  createSourceCandidate({id,kind:'wearable-vendor',outputModes:modes});
const frames = id => ({provenance:'runtime',sessionId:id,permissionGranted:true,
  validFrames:40,measuredFPS:24,width:504,height:896,lastFrameAgeSeconds:0.2});

test('catalog and marketing do not constitute runtime compatibility', () => {
  for (const id of ['mentra','vive-eagle','rokid','rayneo','android-xr','snap',
                    'vuzix','solos','brilliant','xg-glass']) {
    const item = source(id);
    assert.ok(Object.values(item.capabilities).every(s => s === 'unknown'));
    assert.equal(canUseForLocalComposition(item),false);
    const researched = applyEvidence(item,'cameraFrames',{
      ...frames('probe'),provenance:'documentation'
    });
    assert.equal(researched.capabilities.cameraFrames,'unknown');
  }
});

test('real DAT frames require permission, freshness and measured frames', () => {
  const item = source('meta-gen2');
  const confirmed = applyEvidence(item,'cameraFrames',frames('meta-session'));
  assert.equal(confirmed.capabilities.cameraFrames,'ready');
  assert.equal(canUseForLocalComposition(confirmed),true);
  assert.equal(item.capabilities.cameraFrames,'unknown');
  assert.equal(applyEvidence(item,'cameraFrames',{
    ...frames('meta-session'),lastFrameAgeSeconds:6
  }).capabilities.cameraFrames,'experimental');
  assert.equal(applyEvidence(item,'cameraFrames',{
    ...frames('meta-session'),permissionGranted:false
  }).capabilities.cameraFrames,'unknown');
});

test('direct RTMP transport does not supply PiP frames or guarantee LIVE', () => {
  const item = source('mentra-live',['direct-stream']);
  assert.equal(canUseForLocalComposition(applyEvidence(item,'cameraFrames',
    frames('session'))),false);
  assert.equal(canStartDirectLive(applyEvidence(item,'directLive',{
    provenance:'runtime',sessionId:'session',permissionGranted:true,
    userConfirmed:true,remoteIngestConfirmed:false
  })),false);
  assert.equal(canStartDirectLive(applyEvidence(item,'directLive',{
    provenance:'runtime',sessionId:'session',permissionGranted:true,
    userConfirmed:true,remoteIngestConfirmed:true
  })),true);
});

test('two sources require verified compositor and concurrent runtime observations', () => {
  const one=applyEvidence(source('front'),'cameraFrames',frames('front'));
  const two=applyEvidence(source('meta'),'cameraFrames',frames('meta'));
  assert.equal(validateMultiSourcePlan([one]).ok,true);
  assert.equal(validateMultiSourcePlan([one,two]).ok,false);
  assert.equal(validateMultiSourcePlan([one,two],{compositorValidated:true}).ok,false);
  const concurrent = item => applyEvidence(item,'concurrentVideo',{
    provenance:'runtime',sessionId:item.evidence.cameraFrames.sessionId,
    permissionGranted:true,
    vendorCapabilityExposed:true,simultaneousFrameSources:2,compositorValidated:true
  });
  assert.equal(validateMultiSourcePlan([concurrent(one),concurrent(two)],
    {compositorValidated:true}).ok,true);
  assert.equal(validateMultiSourcePlan([one,one]).ok,false);
});

test('a verified media import remains separate from live camera access', () => {
  const item=source('clip',['recorded-media']);
  const imported=applyEvidence(item,'mediaImport',{
    provenance:'runtime',sessionId:'import',permissionGranted:true,
    userConfirmed:true,localFileVerified:true,fileBytes:420000,durationMs:5000
  });
  assert.equal(imported.capabilities.mediaImport,'ready');
  assert.equal(canUseForLocalComposition(imported),false);
});

test('a new session invalidates all readiness from earlier sessions', () => {
  const one=applyEvidence(source('wearable'),'cameraFrames',frames('session-one'));
  assert.equal(one.capabilities.cameraFrames,'ready');
  const next=applyEvidence(one,'directLive',{
    provenance:'runtime',sessionId:'session-two',permissionGranted:true,
    userConfirmed:false,remoteIngestConfirmed:false
  });
  assert.equal(next.capabilities.cameraFrames,'unknown');
  assert.equal(next.capabilities.directLive,'experimental');
  assert.equal(canUseForLocalComposition(next),false);
});

test('audio-only glasses can confirm an authorized microphone without video capability', () => {
  const item=createSourceCandidate({
    id:'meta-audio',kind:'wearable-vendor',provider:'Meta',outputModes:[]
  });
  const audio=applyEvidence(item,'audioFrames',{
    provenance:'runtime',sessionId:'audio-1',permissionGranted:true,
    validAudioSamples:512,sampleRateHz:48000,channelCount:1,lastAudioAgeSeconds:0.2
  });
  assert.equal(audio.capabilities.audioFrames,'ready');
  assert.equal(audio.capabilities.cameraFrames,'unknown');
  assert.equal(canUseForLocalComposition(audio),false);
  const denied=applyEvidence(item,'audioFrames',{
    provenance:'runtime',sessionId:'audio-1',permissionGranted:false,
    validAudioSamples:512,sampleRateHz:48000,channelCount:1,lastAudioAgeSeconds:0.2
  });
  assert.notEqual(denied.capabilities.audioFrames,'ready');
});
