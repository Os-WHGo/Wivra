// Simulated end-to-end media-contract integration, without pretending to play
// camera footage or exercise a real WebView / hardware microphone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseManifest, captureSelectionPlan, importPlan, planImportOps } from '../capture-manifest.mjs';
import { createProject } from '../../core/project.mjs';
import { Session } from '../../core/session.mjs';
import { makeSnapshot, readSnapshot } from '../persist.mjs';
import { exportPlan, exportAudioPreflight } from '../export.mjs';

const base = (overrides = {}) => ({
  schemaVersion: 2, captureID: 'synthetic-android-phone',
  cameraSource: 'android-phone-camerax', audioSource: 'android-usb-mic',
  selectedInputName: 'Test USB input (synthetic)', createdAtISO8601: '2026-10-17T14:00:00Z',
  originalVideoFile: 'Wivra_Phone_test.mp4',
  originalAudioFile: 'Wivra_Phone_test.wav', muxedVideoFile: null,
  tracks: [{ id: 'audio-1', kind: 'audio', role: 'voice_primary', source: 'android-usb-mic',
    file: 'Wivra_Phone_test.wav', channelIndex: null, channelCount: 1,
    sampleRateHz: 48000, startOffsetSeconds: 0.25 }],
  muxedFromTrackIDs: [], ...overrides
});
const normalized = src => {
  const r = parseManifest(src);
  assert.equal(r.ok,true,r.errors?.join('; '));
  return r.manifest;
};
const add = (plan, videoLength = 10, audioLength = 9) => {
  const s = new Session(createProject());
  s.addAsset({id:'v1',duration:videoLength,name:plan.videoFile,kind:'video'});
  const assets = {[plan.videoFile]:{id:'v1',duration:videoLength}};
  let n = 0;
  for(const t of plan.audioTracks) if(!assets[t.file]){
    const id='a'+(++n);
    s.addAsset({id,duration:audioLength,name:t.file,kind:'audio'});
    assets[t.file]={id,duration:audioLength};
  }
  const result = planImportOps(plan,{videoStart:0,assets});
  assert.deepEqual(result.skipped,[]);
  assert.equal(s.apply(result.ops).ok,true);
  return s;
};

test('Android MP4 + WAV → manifest → independent voice → persistence → safe export',()=>{
  const m=normalized(base());
  const ready=captureSelectionPlan(m,[
    {name:'capture.wivra.json',size:620},
    {name:m.videoFile,size:20_000},
    {name:m.tracks[0].file,size:50_000}
  ]);
  assert.equal(ready.ok,true);
  const s=add(importPlan(m),10,9);
  assert.equal(s.project.clips.length,1);
  assert.equal(s.project.audioClips.length,1);
  assert.equal(s.project.audioClips[0].start,0.25);
  const media={v1:{kind:'video'},a1:{kind:'audio'}};
  const state=readSnapshot(makeSnapshot({project:s.project,media,stored:['v1','a1']}));
  assert.equal(state.ok,true,state.errors?.join('; '));
  assert.equal(state.snapshot.project.audioClips[0].role,'voice_primary');
  assert.equal(exportPlan(state.snapshot.project).total,10);
  assert.equal(exportAudioPreflight(state.snapshot.project,media,
    {hasAudio:true,decodedAudioIds:['a1']}).needsConfirmation,false);
  assert.deepEqual(exportAudioPreflight(state.snapshot.project,media,
    {hasAudio:true,decodedAudioIds:[]}).missingAudio,['a1']);
});
test('iOS muxed MOV may replace missing CAF only if manifest confirms its presence',()=>{
  const m=normalized(base({
    captureID:'synthetic-ios',cameraSource:'meta-dat-hevc',audioSource:'ios-bluetooth-hfp',
    originalVideoFile:'walk.mov',originalAudioFile:'walk.caf',muxedVideoFile:'walk.synced.mov',
    tracks:[{id:'audio-1',kind:'audio',role:'voice_primary',
      source:'ios-bluetooth-hfp',file:'walk.caf',startOffsetSeconds:0.12}],
    muxedFromTrackIDs:['audio-1']
  }));
  const selection=captureSelectionPlan(m,['capture.wivra.json','walk.mov','walk.synced.mov']);
  assert.deepEqual(selection.candidates,[{name:'walk.synced.mov',muxed:true}]);
  const s=add(importPlan(m,{useMuxed:true}),12);
  assert.equal(s.project.audioClips.length,0,'the muxed voice is not imported twice');
  assert.equal(exportPlan(s.project).total,12);
  assert.equal(exportAudioPreflight(s.project,{v1:{kind:'video'}},
    {hasAudio:true}).needsConfirmation,false);
});
test('missing independent WAV blocks project edits; a large capture offset blocks voice-loss export',()=>{
  const m=normalized(base({tracks:[{...base().tracks[0],startOffsetSeconds:12}]}));
  assert.equal(captureSelectionPlan(m,[m.videoFile,'capture.wivra.json']).ok,false);
  const s=add(importPlan(m),10,4);
  const state=readSnapshot(makeSnapshot({project:s.project,media:{v1:{kind:'video'},a1:{kind:'audio'}}}));
  assert.equal(state.ok,true);
  const gate=exportAudioPreflight(state.snapshot.project,{v1:{kind:'video'},a1:{kind:'audio'}},
    {hasAudio:true,decodedAudioIds:['a1']});
  assert.equal(gate.needsConfirmation,true);
  assert.deepEqual(gate.truncatedVoices,[{id:'u2',role:'voice_primary',secondsLost:6}]);
});
