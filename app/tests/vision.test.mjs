import test from 'node:test';
import assert from 'node:assert/strict';
import {changeScore,visualCandidates,evidenceForPrompt} from '../vision.mjs';
import {buildPrompt} from '../prompt.mjs';
test('frame changes are measured from actual pixels, not invented semantics',()=>{
 assert.equal(changeScore(Uint8Array.from([0,255]),Uint8Array.from([255,0])),1);
 assert.equal(changeScore(Uint8Array.from([0,255]),Uint8Array.from([0,255])),0);
});
test('visual candidates are bounds-checked and labeled as estimates',()=>{
 const samples={method:'sparse_local_frame_differences_v1',duration:22,sampledFrames:8,
   changes:[{time:4,delta:.8},{time:21.5,delta:.6}],samples:[]};
 const x=visualCandidates(samples);
 assert.equal(x.length,2);
 assert.equal(x[0].start,1);assert.equal(x[0].end,11);
 assert.ok(x[1].end<=22);
 assert.equal(x[0].confidence,'unknown');
});
test('agent prompt gets only concise numeric data, no photo bytes',()=>{
 const e={method:'sparse_local_frame_differences_v1',duration:22,sampledFrames:8,
   changes:[{time:3,delta:.7}],
   samples:[{time:3,thumbnailDataUrl:'data:image/jpeg;base64,SECRET_SENTINEL'}]};
 const prompt=buildPrompt('Recorta lo que no sirva',{revision:1,assets:[],clips:[],texts:[]},evidenceForPrompt(e));
 assert.match(prompt,/visual/);assert.match(prompt,/NO afirmes/);
 assert.ok(!prompt.includes('SECRET_SENTINEL'));
 assert.ok(!prompt.includes('data:image/jpeg'));
});
