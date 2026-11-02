import test from 'node:test';
import assert from 'node:assert/strict';
import {exportPlan} from '../export.mjs';
import {analyzeAcceleratedMultitrackParity as analyze,
  ACCELERATED_MULTITRACK_PARITY_VERSION as VERSION}
  from '../accelerated-multitrack-parity.mjs';

const video={kind:'video',url:'blob:video',w:640,h:360,duration:30};
const media={v:video,v2:{...video,url:'blob:v2'},
  mic:{kind:'audio',url:'blob:mic',duration:10},
  picture:{kind:'image',url:'blob:picture'}};
const empty=()=>({clips:[],overlayClips:[],audioClips:[],texts:[],
  format:{aspect:'original',fit:'contain'}});

test('multi-lane ledger preserves independent audio, overlays, captions and every authored control',()=>{
  const project=empty();
  project.clips=[
    {id:'v1',asset_id:'v',start:0,in:0,out:1,volume:.65},
    {id:'v2',asset_id:'v2',start:1,in:4,out:5}
  ];
  project.overlayClips=[{id:'ol',asset_id:'picture',start:.25,in:0,out:2.25,
    opacity:.75,crop:[.1,.2,.9,.8],shape:'heart',customFutureEffect:'retain'}];
  project.audioClips=[{id:'voice',asset_id:'mic',start:.12,in:.2,out:2.7,
    volume:1.3,role:'voice_primary',ducking:.6}];
  project.texts=[{id:'title',start:.4,end:2.4,text:'Director',
    style:{zone:'top',color:'white'}}];
  project.effects=[{id:'filter',kind:'cinematic',strength:.7}];
  project.transitions=[{id:'fade',seconds:.12}];
  const result=analyze(project,media);
  assert.equal(result.valid,true);
  assert.equal(result.rendererReady,false);
  assert.equal(result.version,VERSION);
  assert.equal(result.totalSeconds,2);
  assert.equal(result.authoredItems,5);
  assert.equal(result.tracks.length,4);
  assert.equal(result.captions.length,1);
  assert.equal(result.tracks[2].renderEnd,2);
  assert.equal(result.tracks[3].renderEnd,2);
  assert.equal(result.tracks[3].visibleDuration,1.88);
  assert.deepEqual(result.tracks[2].authored,project.overlayClips[0]);
  assert.deepEqual(result.tracks[3].authored,project.audioClips[0]);
  assert.deepEqual(result.captions[0].authored,project.texts[0]);
  assert.deepEqual(result.authoredEffects,project.effects);
  assert.deepEqual(result.authoredTransitions,project.transitions);
  assert.equal(result.cutOnlyExperimentalEligible,false);
  assert.equal(result.needsParity.overlays,true);
  assert.equal(result.needsParity.independentAudio,true);
  assert.equal(result.needsParity.captions,true);
  assert.equal(result.needsParity.multipleVideoAssets,true);
  assert.equal(result.needsParity.textsBeyondEnd,true);
  assert.deepEqual(result.assets.map(a=>a.assetId),['v','v2','picture','mic']);
});

test('speed and gap timestamps keep exact original precision, not centisecond rounding',()=>{
  const project=empty();
  project.clips=[
    {id:'slow',asset_id:'v',start:0,in:0,out:.6,speed:.5},
    {id:'fast',asset_id:'v',start:1.207,in:2,out:4,speed:2}
  ];
  const analyzed=analyze(project,media);
  assert.equal(analyzed.valid,true);
  assert.equal(analyzed.totalSeconds,2.207);
  assert.deepEqual(analyzed.segments.map(x=>x.type),['clip','gap','clip']);
  assert.ok(Math.abs(analyzed.segments[1].duration-.007)<1e-10);
  assert.equal(analyzed.tracks[0].duration,1.2);
  assert.equal(analyzed.tracks[1].duration,1);
  assert.equal(analyzed.tracks[1].sourceIn,2);
  assert.equal(analyzed.tracks[1].sourceOut,4);
  assert.deepEqual(analyzed.segments.map(x=>x.duration),
    exportPlan(project).segments.map(x=>x.dur));
  assert.equal(analyzed.needsParity.speeds,true);
  assert.equal(analyzed.cutOnlyExperimentalEligible,false);
});

test('81 segmented cuts remain ordered with no accumulated rounding and no production activation',()=>{
  const project=empty(),length=.333;
  project.clips=Array.from({length:81},(_,i)=>({
    id:'part'+i,asset_id:'v',start:i*length,
    in:2+i*length,out:2+(i+1)*length
  }));
  const result=analyze(project,media);
  assert.equal(result.valid,true);
  assert.equal(result.tracks.length,81);
  assert.equal(result.cutOnlyExperimentalEligible,false); // 81 exceeds cut-only 80-clip gate
  assert.equal(result.rendererReady,false);
  assert.ok(Math.abs(result.totalSeconds-26.973)<1e-9);
  assert.ok(result.segments.filter(s=>s.type==='gap')
    .reduce((sum,g)=>sum+g.duration,0)<1e-9);
});

test('fail closed for missing WAV, overlaid media, illegal speeds and overlapping main clips',()=>{
  const p=empty();
  p.clips=[{id:'a',asset_id:'v',start:0,in:0,out:2}];
  p.audioClips=[{id:'mic',asset_id:'mic',start:0,in:0,out:1}];
  assert.equal(analyze(p,{v:video}).reason,'missing-or-unsupported-asset');
  const badSpeed=structuredClone(p);badSpeed.audioClips[0].speed=50;
  assert.equal(analyze(badSpeed,media).reason,'invalid-clip');
  const overlap=structuredClone(p);
  overlap.clips.push({id:'b',asset_id:'v2',start:1,in:2,out:3});
  assert.equal(analyze(overlap,media).reason,'main-video-overlap');
  const broken=structuredClone(p);broken.texts=[{start:5,end:4,text:'invalid'}];
  assert.equal(analyze(broken,media).reason,'invalid-text');
  const badLane=structuredClone(p);badLane.overlayClips=[{id:'o',asset_id:'mic',start:0,in:0,out:1}];
  assert.equal(analyze(badLane,media).reason,'missing-or-unsupported-asset');
});

test('analysis accepts a 60-minute timing ledger but never claims a 60-minute render verified',()=>{
  const project=empty();
  project.clips=[{id:'long',asset_id:'v',start:0,in:0,out:3600}];
  const longMedia={...media,v:{...video,duration:3800}};
  const result=analyze(project,longMedia);
  assert.equal(result.valid,true);
  assert.equal(result.totalSeconds,3600);
  assert.equal(result.cutOnlyExperimentalEligible,false); // cut-only renderer cap stays 120s
  assert.equal(result.rendererReady,false);
  assert.equal(analyze(project,longMedia,{maxTimelineSeconds:1800}).reason,'timeline-duration');
  assert.equal(analyze(project,media).reason,'source-media-too-short');
});
