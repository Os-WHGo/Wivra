import test from 'node:test';
import assert from 'node:assert/strict';
import { planAutoHighlights, ahSafeSingleSource } from '../autocut-highlights.mjs';
import { AUTOCUT_TIMED_SCHEMA } from '../autocut-evidence.mjs';
import { createProject } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';
import { readFileSync } from 'node:fs';
function make(seconds=2700,extra=[]) {
 let p=createProject({assets:[{id:'v',duration:seconds,name:'walk.mov'},...extra]});
 const a=applyBatch(p,[{op:'add_clip',asset_id:'v',start:0}]); assert.ok(a.ok); return a.project;
}
const sorted=p=>[...p.clips].sort((a,b)=>a.start-b.start);
function verify(p,pl,count,target) {
 assert.ok(pl?.ok,JSON.stringify(pl));
 assert.equal(pl.highlights,count);
 const r=applyBatch(p,pl.ops); assert.ok(r.ok,JSON.stringify(r));
 const cs=sorted(r.project); assert.equal(cs.length,count);
 assert.ok(Math.abs(cs[0].start)<0.005);
 assert.ok(Math.abs(cs.at(-1).start+cs.at(-1).out-cs.at(-1).in-target)<0.04);
 for (let i=1;i<cs.length;i++) {
  assert.ok(cs[i].in>=cs[i-1].out,'chronological scenes');
  assert.ok(Math.abs(cs[i].start-(cs[i-1].start+cs[i-1].out-cs[i-1].in))<0.004,'no timeline gap');
 }
 return r.project;
}
test('45 min -> 60 s in 6 distinct chronological moments and one atomic revision',()=>{
 const p=make(),pl=planAutoHighlights(p,{targetSeconds:60});
 const q=verify(p,pl,6,60);
 assert.ok(sorted(q)[0].in>100);
 assert.ok(sorted(q).at(-1).in>2000);
 assert.equal(q.revision,p.revision+1);
 assert.deepEqual(p.clips.map(c=>[c.in,c.out,c.start]),[[0,2700,0]]);
});
test('activity in separate buckets shifts local highlights, never all toward one moment',()=>{
 const p=make(240),env=new Float32Array(2400).fill(-80);
 for(let i=100;i<190;i++) env[i]=-20;
 for(let i=2070;i<2160;i++) env[i]=-20;
 const pl=planAutoHighlights(p,{targetSeconds:30,envOf:()=>({env,win:0.1})});
 const q=verify(p,pl,3,30); assert.ok(pl.picked>=1,JSON.stringify(pl.windows));
 assert.ok(sorted(q)[0].in<35);assert.ok(sorted(q)[2].in>150);
});
test('imported captions are timing evidence, not a claim of certified speech',()=>{
 const p=make(240);
 const t={schema:AUTOCUT_TIMED_SCHEMA,source:'timestamped_import',granularity:'segment',durationSeconds:240,
 segments:[{start:14,end:23,text:'Whistler'},{start:96,end:105,text:'camino'},{start:170,end:179,text:'montaña'}]};
 const pl=planAutoHighlights(p,{targetSeconds:30,envOf:()=>({timedSpeech:t})});
 verify(p,pl,3,30);assert.ok(pl.picked>=1,JSON.stringify(pl.windows));
});
test('recorded separate mic follows video cuts without losing sync',()=>{
 let p=make(240,[{id:'mic',duration:240,kind:'audio',name:'mic.wav'}]);
 p=applyBatch(p,[{op:'add_audio_clip',asset_id:'mic',start:0,in:0,out:240,role:'voice_primary'}]).project;
 const pl=planAutoHighlights(p,{targetSeconds:30}),q=verify(p,pl,3,30);
 assert.equal(q.audioClips.length,3);
 const v=sorted(q),u=[...q.audioClips].sort((a,b)=>a.start-b.start);
 for(let i=0;i<3;i++){
  assert.ok(Math.abs(u[i].start-v[i].start)<0.004);
  assert.ok(Math.abs(u[i].in-v[i].in)<0.004);
  assert.ok(Math.abs(u[i].out-v[i].out)<0.004);
 }
});
test('existing title cues are retimed and discarded when absent from selected excerpts',()=>{
 let p=make(240);
 p=applyBatch(p,[{op:'add_text',text:'start',start:1,duration:3},
 {op:'add_text',text:'middle',start:114,duration:3},
 {op:'add_text',text:'end',start:233,duration:3}]).project;
 const q=verify(p,planAutoHighlights(p,{targetSeconds:30}),3,30);
 assert.equal(q.texts.length,1);assert.equal(q.texts[0].text,'middle');
 assert.ok(q.texts[0].start>=10&&q.texts[0].end<=20);
});
test('complex edit, music, multi-clip, speed, too-short input use original safe planner',()=>{
 let p=make(240,[{id:'mus',duration:240,kind:'audio'}]);
 p=applyBatch(p,[{op:'add_audio_clip',asset_id:'mus',start:0,in:0,out:240,role:'music'}]).project;
 assert.equal(planAutoHighlights(p,{targetSeconds:30}),null);
 let q=make(240);q=applyBatch(q,[{op:'set_clip_speed',clip_id:q.clips[0].id,speed:2}]).project;
 assert.equal(planAutoHighlights(q,{targetSeconds:30}),null);
 let s=make(240);s=applyBatch(s,[{op:'add_clip',asset_id:'v',start:240}]).project;
 assert.equal(planAutoHighlights(s,{targetSeconds:30}),null);
 assert.equal(planAutoHighlights(make(35),{targetSeconds:30}),null);
 assert.equal(ahSafeSingleSource(make(240),601),null);
});
test('invalid evidence and invalid target never cause unvalidated changes',()=>{
 const p=make(240);
 for(const target of [NaN,-3,0,2,601]) assert.equal(planAutoHighlights(p,{targetSeconds:target}),null);
 verify(p,planAutoHighlights(p,{targetSeconds:30,envOf:()=>({timedSpeech:{schema:'wrong'}})}),3,30);
});
test('UI uses AutoCut multisegment planner only as an opt-in before existing planner',()=>{
 const html=readFileSync(new URL('../template.html',import.meta.url),'utf8');
 assert.match(html,/planAutoHighlights\(session\.project/);
 assert.match(html,/if \(highlights\?\.ok\) return highlights/);
 assert.match(html,/edit\(pl\.ops, \{ ripple: false \}\)/);
});
