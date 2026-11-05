import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runAcceleratedCodecMatrix,auditAcceleratedCodecMatrix,WIVRA_CODEC_MATRIX_CASES}
  from '../accelerated-codec-matrix.mjs';

const STAGES=['environment','exact-support','encode','mux','container','decode','playback'];
const clone=value=>JSON.parse(JSON.stringify(value));
function pass({width,height,fps},runtime={platform:'desktop',runtime:'desktop-chromium',
  evidence:'user-agent-hint',physicalDeviceVerified:false}) {
  return {schemaVersion:1,synthetic:true,productionEligible:false,physicalDeviceVerified:false,
    outcome:'passed',runtime,configuration:{
      video:{codec:'avc1.42E01F',avc:{format:'avc'},width,height,framerate:fps},
      audio:{codec:'mp4a.40.2',numberOfChannels:2,sampleRate:48000}},
    observedCodecs:{video:'avc1.42e01f',audio:'mp4a.40.2'},
    stages:STAGES.map(stage=>({stage,status:'passed'}))};
}
test('W71: exact six cases, never converted into device or production proof',async()=>{
 const calls=[];
 const report=await runAcceleratedCodecMatrix({diagnose:async params=>{
   calls.push([params.width,params.height,params.fps]);return pass(params);
 }});
 assert.deepEqual(calls,WIVRA_CODEC_MATRIX_CASES.map(x=>[x.width,x.height,x.fps]));
 assert.equal(report.outcome,'passed');
 assert.equal(report.fullMatrixPassed,true);
 assert.equal(report.productionEligible,false);
 assert.equal(report.physicalDeviceVerified,false);
 assert.equal(report.longFormVerified,false);
 assert.equal(report.nativeStorageVerified,false);
 assert.equal(report.environmentVerified,false);
 assert.deepEqual(auditAcceleratedCodecMatrix(report),
  {valid:true,syntheticMatrixPassed:true,physicalDeviceAccepted:false,productionApproved:false});
});
test('W71: unsupported AVC case is retained; next cases still run',async()=>{
 let runs=0;
 const report=await runAcceleratedCodecMatrix({diagnose:async params=>{
   runs++;
   if(runs===3)return {...pass(params),outcome:'failed',code:'codec-unsupported',
    failedStage:'exact-support',stages:[{stage:'exact-support',status:'failed'}]};
   return pass(params);
 }});
 assert.equal(runs,6);
 assert.equal(report.fullMatrixPassed,false);
 assert.equal(report.outcome,'failed');
 assert.deepEqual(report.cases[2].outcome,'failed');
 assert.equal(report.cases[2].code,'codec-unsupported');
 assert.deepEqual(auditAcceleratedCodecMatrix(report),
  {valid:true,syntheticMatrixPassed:false,physicalDeviceAccepted:false,productionApproved:false});
});
test('W71: exact audio, video, dimensions and all seven stages are required',async()=>{
 for(const mutate of [
   report=>{report.configuration.video.width=500;},
   report=>{report.configuration.video.codec='vp09.00.10.08';},
   report=>{report.configuration.audio.codec='opus';},
   report=>{report.observedCodecs.audio='opus';},
   report=>{report.stages.pop();},
   report=>{report.stages[5].status='skipped';},
   report=>{report.physicalDeviceVerified=true;},
   report=>{report.productionEligible=true;},
   report=>{delete report.synthetic;}
 ]) {
   let call=0;
   const result=await runAcceleratedCodecMatrix({diagnose:async p=>{
     call++;const v=pass(p);if(call===1)mutate(v);return v;
   }});
   assert.equal(result.cases[0].code,'invalid-evidence');
   assert.equal(result.fullMatrixPassed,false);
 }
});
test('W71: cancellation stops sequence and marks the rest as never executed',async()=>{
 let abort=false,completed=0;
 const report=await runAcceleratedCodecMatrix({diagnose:async p=>pass(p),
  isCancelled:()=>abort,onCaseDone:()=>{
    completed++;if(completed===2)abort=true;
  }});
 assert.equal(completed,2);
 assert.equal(report.outcome,'cancelled');
 assert.equal(report.cases.filter(x=>x.outcome==='not-run').length,4);
 assert.equal(auditAcceleratedCodecMatrix(report).valid,true);
});
test('W71: runtime changes during a run refuse a matrix-wide success',async()=>{
 let call=0;
 const report=await runAcceleratedCodecMatrix({diagnose:async p=>{
   call++;return pass(p,{platform:call===2?'android':'ios',
     runtime:call===2?'android-system-webview':'ios-wkwebview',
     evidence:'app-bridge-observed',physicalDeviceVerified:false});
 }});
 assert.equal(report.contextConsistent,false);
 assert.equal(report.outcome,'failed');
 assert.equal(report.code,'context-changed');
 assert.equal(auditAcceleratedCodecMatrix(report).valid,true);
});
test('W71: concurrent call is rejected and first run releases its lock',async()=>{
 let release;
 const waiting=new Promise(resolve=>{release=resolve;});
 const first=runAcceleratedCodecMatrix({diagnose:p=>waiting.then(()=>pass(p))});
 const busy=await runAcceleratedCodecMatrix({diagnose:async p=>pass(p)});
 assert.equal(busy.code,'diagnostic-busy');
 release();
 const complete=await first;
 assert.equal(complete.fullMatrixPassed,true);
 const again=await runAcceleratedCodecMatrix({diagnose:async p=>pass(p)});
 assert.equal(again.fullMatrixPassed,true);
});
test('W71: arbitrary exception text and platform strings never enter saved evidence',async()=>{
 let calls=0;
 const report=await runAcceleratedCodecMatrix({diagnose:async p=>{
   calls++;
   if(calls===1)throw Error('https://private.example/photo.mov user-agent Mozilla/5.0');
   return pass(p,{platform:'ios',runtime:'ios-wkwebview',
     evidence:'app-bridge-observed',deviceModel:'private phone name',
     physicalDeviceVerified:true});
 }});
 const json=JSON.stringify(report);
 assert.doesNotMatch(json,/https?:|Mozilla\/|private phone name|photo\.mov/);
 assert.equal(report.cases[0].code,'invalid-evidence');
 assert.equal(report.runtime.physicalDeviceVerified,false);
 assert.equal(report.physicalDeviceVerified,false);
});
test('W71: downloaded report tampering cannot impersonate acceptance',async()=>{
 const clean=await runAcceleratedCodecMatrix({diagnose:async p=>pass(p)});
 for(const alter of [
   report=>{report.productionEligible=true;},
   report=>{report.physicalDeviceVerified=true;},
   report=>{report.longFormVerified=true;},
   report=>{report.cases[0].fps=24;},
   report=>{report.cases[1].outcome='not-run';},
   report=>{report.cases.pop();},
   report=>{report.fullMatrixPassed=false;},
   report=>{report.cases[2].code='pretend-approved';}
 ]) {
   const changed=clone(clean);alter(changed);
   assert.equal(auditAcceleratedCodecMatrix(changed).valid,false);
 }
});
test('W71: offline QA only; regular editor build must not include matrix controls',()=>{
 const build=readFileSync(new URL('../build.mjs',import.meta.url),'utf8');
 const single=readFileSync(new URL('../accelerated-codec-diagnostic-ui.mjs',import.meta.url),'utf8');
 const matrix=readFileSync(new URL('../accelerated-codec-matrix-ui.mjs',import.meta.url),'utf8');
 assert.match(build,/const qaPipeline = acceleratedVendor \?/);
 assert.match(build,/const qaUI = qaPipeline \?/);
 assert.match(build,/accelerated-codec-matrix\.mjs/);
 assert.match(build,/accelerated-codec-matrix-ui\.mjs/);
 assert.match(single,/if\(wivraCodecMatrixRunning\)/);
 assert.match(matrix,/runAcceleratedCodecMatrix\(/);
 assert.match(matrix,/journal\.begin\(test\)/);
 assert.match(matrix,/journal\.clear\(\)/);
});
