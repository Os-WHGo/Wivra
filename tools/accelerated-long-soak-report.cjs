// Wivra: offline report integrity audit for Linux Chromium WebCodecs QA.
// Never equate this evidence with iPhone, Android or Ray-Ban physical testing.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const MINUTES=Object.freeze([10,20,30,60]);
const requireQA=(ok,message)=>{if(!ok)throw Error('Invalid accelerated QA evidence: '+message);};
const finite=n=>typeof n==='number'&&Number.isFinite(n);
function validateAcceleratedSoakReport(report,minutes){
 requireQA(MINUTES.includes(minutes),'unexpected duration');
 const seconds=minutes*60;
 requireQA(report?.type==='Wivra synthetic multitrack accelerated QA','report type');
 requireQA(report.scope==='Chromium Linux software media, not physical Android/iOS/Meta','scope');
 requireQA(report.mediabunny==='pinned 1.61.6','SDK pin');
 requireQA(report.projectSeconds===seconds,'timeline seconds');
 const browser=report.browser,result=browser?.result,res=report.resources;
 requireQA(result?.engine==='webcodecs-mediabunny-multitrack-experimental','engine');
 requireQA(result.container==='webm'&&result.videoCodec==='vp9'&&result.audioCodec==='opus','actual Linux codecs');
 requireQA(result.verifiedOnDevice===false&&result.rendererReadyForProduction===false,'unsafe production claim');
 requireQA(result.width===320&&result.height===240,'fixture dimensions');
 requireQA(result.durationSeconds===seconds&&result.videoFrames===seconds*30&&
   result.audioBlocks===seconds,'frames/audio blocks');
 requireQA(Number.isSafeInteger(result.outputBytes)&&result.outputBytes>1000&&
   Number.isSafeInteger(result.writes)&&result.writes>0,'empty output');
 requireQA(report.nativeSimulated?.bytes===result.outputBytes&&
   report.nativeSimulated.writes===result.writes,'random write mismatch');
 requireQA(finite(browser.renderSeconds)&&browser.renderSeconds>0,'render timer');
 requireQA(report.ffprobe?.video===true&&report.ffprobe.audio===true&&
   report.ffprobe.codecs?.includes('video:vp9')&&
   report.ffprobe.codecs?.includes('audio:opus')&&
   finite(report.ffprobe.duration)&&Math.abs(report.ffprobe.duration-seconds)<=.3,'ffprobe');
 requireQA(report.containerInspection?.container==='webm'&&
   report.containerInspection.video===true&&report.containerInspection.audio===true&&
   report.containerInspection.declaresDuration===true&&report.containerInspection.seekIndex===true&&
   Math.abs(report.containerInspection.durationMs-seconds*1000)<=300,'container/seek');
 requireQA(report.scenes?.firstOrange===true&&report.scenes.secondBlue===true&&
   report.scenes.preservedBlackGap===true,'visual parity');
 requireQA(finite(report.audio?.beforeVoice)&&report.audio.beforeVoice<.02&&
   finite(report.audio.afterVoice)&&report.audio.afterVoice>.015&&
   finite(report.audio.tailVoice)&&report.audio.tailVoice>.015,'voice continuity');
 requireQA(res&&Array.isArray(res.samples)&&res.samples.length>=2&&
   Array.isArray(res.errors)&&res.errors.length===0&&res.overBudget===false,'resource telemetry');
 requireQA(finite(res.rssBudgetMiB)&&res.rssBudgetMiB>0&&res.rssBudgetMiB<=4096&&
   finite(res.peakRssMiB)&&res.peakRssMiB>0&&res.peakRssMiB<=res.rssBudgetMiB&&
   finite(res.peakCpuLifetimePct)&&res.peakCpuLifetimePct>=0,'resource budget and peaks');
 requireQA(res.peakOutputBytes===result.outputBytes,'observed bytes');
 let last=-1,maxRss=0,maxOutput=0;
 for(const s of res.samples){
  requireQA(finite(s.elapsedSeconds)&&s.elapsedSeconds>=last&&
    finite(s.rssMiB)&&s.rssMiB>0&&finite(s.cpuLifetimePct)&&s.cpuLifetimePct>=0&&
    Number.isSafeInteger(s.processes)&&s.processes>=1&&
    Number.isSafeInteger(s.outputBytes)&&s.outputBytes>=0&&
    Number.isSafeInteger(s.writes)&&s.writes>=0,'invalid resource sample');
  last=s.elapsedSeconds;maxRss=Math.max(maxRss,s.rssMiB);
  maxOutput=Math.max(maxOutput,s.outputBytes);
 }
 requireQA(Math.abs(maxRss-res.peakRssMiB)<=.02&&
   maxOutput===result.outputBytes,'telemetry max values not reproduced');
 requireQA(last>=browser.renderSeconds-5,'resource monitoring ended too early');
 return {minutes,renderSeconds:Number(browser.renderSeconds.toFixed(2)),
   peakRssMiB:res.peakRssMiB,cpuLifetimePct:res.peakCpuLifetimePct,
   samples:res.samples.length,frames:result.videoFrames,
   audioBlocks:result.audioBlocks,outputBytes:result.outputBytes,
   ffprobeSeconds:report.ffprobe.duration};
}
function validateAcceleratedSoakDirectory(directory){
 return MINUTES.map(minutes=>validateAcceleratedSoakReport(
   JSON.parse(fs.readFileSync(path.join(directory,
    'wivra-accelerated-soak-'+minutes+'min.json'),'utf8')),minutes));
}
if(require.main===module){
 try{
  const rows=validateAcceleratedSoakDirectory(process.argv[2]||'.');
  const summary=['### Wivra Linux QA: four validated long-form evidence files',
   '| Video | Render (s) | Peak RSS (MiB) | CPU lifetime % | Samples | Frames | Audio blocks | Bytes |',
   '|---|---:|---:|---:|---:|---:|---:|---:|',
   ...rows.map(x=>'| '+x.minutes+' min | '+x.renderSeconds+' | '+x.peakRssMiB+
    ' | '+x.cpuLifetimePct+' | '+x.samples+' | '+x.frames+' | '+x.audioBlocks+
    ' | '+x.outputBytes+' |'),
   '',
   'Chromium/Linux WebM VP9/Opus, NOT mobile H264/AAC MP4, physical Ray-Ban, iOS or Android.',''].join('\n');
  process.stdout.write(summary+'\n');
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
 }catch(error){console.error(error.stack||error);process.exitCode=1;}
}
module.exports={MINUTES,validateAcceleratedSoakReport,validateAcceleratedSoakDirectory};
