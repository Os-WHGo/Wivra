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

import { readFileSync } from 'node:fs';
test('UI and generated bundle require a deliberate override before exporting with missing audio',()=>{
  const engine = readFileSync(new URL('../export.mjs', import.meta.url),'utf8');
  assert.match(engine,/audioPreflight\.needsConfirmation && !allowIncompleteAudio/);
  assert.match(engine,/return \{ audioBlocked: true/);
  assert.match(engine,/stream\.getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  for(const file of ['../template.html','../dist/agentcut.html']){
    const s=readFileSync(new URL(file,import.meta.url),'utf8');
    assert.match(s,/id="expAllowAudioGaps"/,file);
    assert.match(s,/\$\('expAllowAudioGaps'\)\.checked = false/,file);
    assert.match(s,/if \(r\.audioBlocked\)/,file);
    assert.match(s,/allowIncompleteAudio: \$\('expAllowAudioGaps'\)\.checked/,file);
  }
});

test('a primary voice extending beyond the last picture is detected before MediaRecorder',()=>{
 const p={clips:[{asset_id:'v',start:0,in:0,out:10}],overlayClips:[],
   audioClips:[{id:'u1',asset_id:'a',role:'voice_primary',start:0,in:0,out:12}]};
 const r=exportAudioPreflight(p,media,{hasAudio:true,decodedAudioIds:['a']});
 assert.equal(r.needsConfirmation,true);
 assert.deepEqual(r.missingAudio,[]);
 assert.deepEqual(r.truncatedVoices,[{id:'u1',role:'voice_primary',secondsLost:2}]);
});
test('a recorded guest voice with a late capture offset cannot silently export as silence',()=>{
 const p={clips:[{asset_id:'v',start:0,in:0,out:8}],audioClips:[
   {id:'u2',asset_id:'b',role:'voice_guest',start:9,in:0,out:3}]};
 const r=exportAudioPreflight(p,media,{hasAudio:true,decodedAudioIds:['b']});
 assert.equal(r.needsConfirmation,true);
 assert.deepEqual(r.truncatedVoices,[{id:'u2',role:'voice_guest',secondsLost:4}]);
});
test('long background music and muted or zero-volume voices are not false export blockers',()=>{
 const p={clips:[{asset_id:'v',start:0,in:0,out:9}],audioClips:[
   {id:'m',asset_id:'a',role:'music',start:0,in:0,out:30},
   {id:'u',asset_id:'b',role:'voice_primary',start:0,in:0,out:25,muted:true}]};
 const r=exportAudioPreflight(p,media,{hasAudio:true,decodedAudioIds:['a']});
 assert.equal(r.needsConfirmation,false);
 assert.deepEqual(r.truncatedVoices,[]);
});
test('a guest voice ending at visual end or within 50ms does not require override',()=>{
 const p={clips:[{asset_id:'v',start:0,in:0,out:10}],audioClips:[
   {id:'u',asset_id:'b',role:'voice_guest',start:1,in:0,out:9.04}]};
 const r=exportAudioPreflight(p,media,{hasAudio:true,decodedAudioIds:['b']});
 assert.equal(r.needsConfirmation,false);
});
test('voice tail safety gate appears in both authoring and embedded export UI',()=>{
 const engine=readFileSync(new URL('../export.mjs',import.meta.url),'utf8');
 assert.match(engine,/const truncatedVoices = videoEnd > 0/);
 assert.match(engine,/truncatedVoices\.length > 0/);
 for(const f of ['../template.html','../dist/agentcut.html']){
   const html=readFileSync(new URL(f,import.meta.url),'utf8');
   assert.match(html,/r\.truncatedVoices\?\.length/);
   assert.match(html,/Acorta\/reubica las voces/);
   assert.match(html,/voz queda fuera del video/);
 }
});
