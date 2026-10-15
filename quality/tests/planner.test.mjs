// No external packages: node --test quality/tests/planner.test.mjs — ChatGPT
import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectAsset,proxySize,planExport,allocateSceneBudget,hypotheticalSavings} from '../quality-planner.mjs';

const sample=inspectAsset({sizeBytes:800_000_000,durationSeconds:100,width:3840,height:2160});
test('source metadata is distinguished from capture provenance',()=>{
 assert.equal(sample.file.width,3840);
 assert.equal(sample.file.avgTotalMbps,64);
 assert.equal(sample.capture.verified,false);
});
test('reject invalid input',()=>assert.throws(()=>inspectAsset({sizeBytes:0,durationSeconds:1,width:1,height:1}),RangeError));
test('create small proxy without upscaling',()=>{
 assert.deepEqual(proxySize(3840,2160),{width:720,height:404,upscaled:false});
 assert.deepEqual(proxySize(640,360),{width:640,height:360,upscaled:false});
});
test('archive default preserves original rather than silently replacing it',()=>{
 const p=planExport(sample);assert.equal(p.action,'keep_original');assert.equal(p.sourceIntact,true);
});
test('privacy-sensitive trims cannot use hidden pre-roll copy',()=>{
 const p=planExport(sample,{privacyTrim:true,verifiedSafeCopy:true,device:{h264EncodeHardware:true}});
 assert.equal(p.action,'encode_and_measure');assert.equal(p.codec,'h264');
});
test('low-resolution inputs never get marketed as native 4K',()=>{
 const lo=inspectAsset({sizeBytes:10_000_000,durationSeconds:60,width:1080,height:1920});
 const p=planExport(lo,{purpose:'archive',device:{requestCompression:true,hevcEncodeHardware:true,hevcPlayback:true}});
 assert.equal(p.codec,'hevc');assert.equal(p.dimensions.width,1080);assert.equal(lo.capture.verified,false);
});
test('no encoder is asserted unless hardware is verified',()=>{
 const p=planExport(sample,{purpose:'publish',pixelEffects:true});assert.equal(p.codec,'unknown');
});
test('weighted scene bitrates honor average target and protect high-motion scenes',()=>{
 const x=allocateSceneBudget([
 {id:'quiet',seconds:10,motion:0,detail:0},
 {id:'action',seconds:10,motion:1,detail:1,textImportant:true}
 ],3);
 assert.equal(x.totalPlannedMegabits,60);
 assert.ok(x.scenes[1].targetVideoMbps>x.scenes[0].targetVideoMbps);
 const measured=x.scenes.reduce((sum,s)=>sum+s.targetVideoMbps*s.seconds,0);
 assert.ok(Math.abs(measured-60)<0.3);
});
test('200GB hypothetical reductions are clearly not measured',()=>{
 const x=hypotheticalSavings(200,.5);
 assert.equal(x.toGB,100);assert.match(x.note,/Illustration only/);
});
