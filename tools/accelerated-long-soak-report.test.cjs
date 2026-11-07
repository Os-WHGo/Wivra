// QA-only contract for complete long-duration evidence. No device claims.
const test=require('node:test'),assert=require('node:assert/strict');
const {MINUTES,validateAcceleratedSoakReport}=require('./accelerated-long-soak-report.cjs');
function report(minutes=10){
 const seconds=minutes*60,bytes=223344;
 return {
  type:'Wivra synthetic multitrack accelerated QA',
  scope:'Chromium Linux software media, not physical Android/iOS/Meta',
  mediabunny:'pinned 1.61.6',projectSeconds:seconds,
  browser:{result:{engine:'webcodecs-mediabunny-multitrack-experimental',
   container:'webm',videoCodec:'vp9',audioCodec:'opus',verifiedOnDevice:false,
   rendererReadyForProduction:false,width:320,height:240,videoFrames:seconds*30,
   audioBlocks:seconds,durationSeconds:seconds,outputBytes:bytes,writes:4},renderSeconds:12},
  resources:{samples:[{elapsedSeconds:0,rssMiB:200,cpuLifetimePct:90,processes:4,outputBytes:0,writes:0},
   {elapsedSeconds:12,rssMiB:400,cpuLifetimePct:135,processes:6,outputBytes:bytes,writes:4}],
   errors:[],overBudget:false,rssBudgetMiB:4096,peakRssMiB:400,
   peakCpuLifetimePct:135,peakOutputBytes:bytes},
  nativeSimulated:{bytes,writes:4},
  ffprobe:{duration:seconds+.02,video:true,audio:true,codecs:['video:vp9','audio:opus']},
  containerInspection:{video:true,audio:true,declaresDuration:true,
   seekIndex:true,container:'webm',durationMs:seconds*1000+20},
  scenes:{firstOrange:true,secondBlue:true,preservedBlackGap:true,
   tailTransition:{previousAtSeconds:seconds-seconds/120-.25,
    finalAtSeconds:seconds-.25,previousRGB:[220,120,10],
    finalRGB:[10,80,210],previousOrange:true,finalBlue:true}},
  audio:{beforeVoice:0,afterVoice:.06,tailVoice:.06,recordedSeconds:seconds+.02,voiceGap:0,voiceAfter:.06,voiceTail:.06,musicStart:.06,musicMid:.06,musicTail:.06}
 };
}
test('requires all 10/20/30/60min reports with exact frames, audio and measured resources',()=>{
 assert.deepEqual(MINUTES,[10,20,30,60]);
 for(const m of MINUTES){
  const r=validateAcceleratedSoakReport(report(m),m);
  assert.equal(r.frames,m*1800);assert.equal(r.samples,2);
  assert.equal(r.lastDecodedSeconds,m*60-.25);
 }
});
for(const [name,mutate] of [
 ['fake phone validation',r=>{r.browser.result.verifiedOnDevice=true;}],
 ['missing last transition',r=>{delete r.scenes.tailTransition;}],
 ['wrong last-frame timestamp',r=>{r.scenes.tailTransition.finalAtSeconds-=2;}],
 ['wrong penultimate timestamp',r=>{r.scenes.tailTransition.previousAtSeconds-=5;}],
 ['missing decoded final frame',r=>{r.scenes.tailTransition.finalRGB=[];}],
 ['final scene wrong color',r=>{r.scenes.tailTransition.finalRGB=[200,15,10];}],
 ['penultimate scene wrong color',r=>{r.scenes.tailTransition.previousRGB=[1,10,220];}],
 ['false last scene claim',r=>{r.scenes.tailTransition.finalBlue=false;}],
 ['fabricated penultimate color',r=>{r.scenes.tailTransition.previousRGB=[-4,99,1];}],
 ['incomplete voice',r=>{r.audio.voiceTail=0;}],
 ['missing continuous music tail',r=>{r.audio.musicTail=0;}],
 ['missing continuous music mid',r=>{r.audio.musicMid=0;}],
 ['audio duration mismatch',r=>{r.audio.recordedSeconds++;}],
 ['missing seek index',r=>{r.containerInspection.seekIndex=false;}],
 ['lost frames',r=>{r.browser.result.videoFrames--;}],
 ['lost audio blocks',r=>{r.browser.result.audioBlocks--;}],
 ['output mismatch',r=>{r.resources.peakOutputBytes--;}],
 ['missing samples',r=>{r.resources.samples=[];}],
 ['over-budget',r=>{r.resources.overBudget=true;}],
 ['invented memory peak',r=>{r.resources.peakRssMiB=999;}],
 ['monitor stopped early',r=>{r.resources.samples[1].elapsedSeconds=3;}],
 ['false MP4 declaration',r=>{r.browser.result.container='mp4';}],
 ['wrong timeline duration',r=>{r.projectSeconds++;}],
 ['monitor reported an error',r=>{r.resources.errors.push('ps failed');}],
 ['unknown codec',r=>{r.ffprobe.codecs=['video:h264','audio:aac'];}]
])test('refuses '+name,()=>{
 const r=report();mutate(r);
 assert.throws(()=>validateAcceleratedSoakReport(r,10),/Invalid accelerated QA evidence/);
});
