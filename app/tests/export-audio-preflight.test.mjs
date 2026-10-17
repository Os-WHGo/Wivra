import test from 'node:test';
import assert from 'node:assert/strict';
import { exportAudioPreflight } from '../export.mjs';
const media={v:{kind:'video'},a:{kind:'audio'},b:{kind:'audio'},still:{kind:'image'}};
const project={clips:[{asset_id:'v'}],overlayClips:[],
  audioClips:[{asset_id:'a',role:'voice_primary'},{asset_id:'b',role:'voice_guest'}]};
test('preflight catches one missing microphone track before MediaRecorder starts',()=>{
  const r=exportAudioPreflight(project,media,{hasAudio:true,decodedAudioIds:['a']});
  assert.equal(r.needsConfirmation,true);
  assert.deepEqual(r.missingAudio,['b']);
  assert.equal(r.unavailableAudio,false);
});
test('preflight distinguishes missing AudioContext from valid decoded tracks',()=>{
  const r=exportAudioPreflight(project,media,{hasAudio:false,decodedAudioIds:[]});
  assert.equal(r.needsConfirmation,true);
  assert.equal(r.unavailableAudio,true);
  assert.deepEqual(r.missingAudio,['a','b']);
});
test('all WAVs decode and audio stream is available: no forced warning',()=>{
  const r=exportAudioPreflight(project,media,{hasAudio:true,decodedAudioIds:['a','b']});
  assert.equal(r.needsConfirmation,false);
  assert.deepEqual(r.missingAudio,[]);
});
test('muted voice/video or photo-only projects do not invent missing sound',()=>{
  const p={clips:[{asset_id:'still'}],audioClips:[{asset_id:'a',muted:true}]};
  const r=exportAudioPreflight(p,media,{hasAudio:false,decodedAudioIds:[]});
  assert.equal(r.needsConfirmation,false);
  assert.equal(r.unavailableAudio,false);
});
test('video with requested sound and missing AudioContext is not silently exported',()=>{
  const r=exportAudioPreflight({clips:[{asset_id:'v'}],audioClips:[]},media,{hasAudio:false});
  assert.equal(r.needsConfirmation,true);
  assert.equal(r.unavailableAudio,true);
});
