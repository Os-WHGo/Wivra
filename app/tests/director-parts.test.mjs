import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRayBanParts,restoreDirectorAssetLinks,rayBanPartPositions,rayBanContinuation,rayBanAppendAt,MAX_SHOT_PARTS} from '../director-parts.mjs';

const session='abcdef0123456789abcdef0123456789';
const part=(n,id=session)=>({
 name:'Wivra_RayBan_1793352000000_'+id+'_part'+String(n).padStart(4,'0')+'.mp4',
 size:4096,type:'video/mp4'
});

test('a long Ray-Ban take keeps all segments and sorts them numerically',()=>{
 const x=validateRayBanParts([part(3),part(1),part(2)]);
 assert.equal(x.ok,true);
 assert.deepEqual(x.files.map(f=>f.name),[part(1),part(2),part(3)].map(x=>x.name));
 assert.equal(x.sessionId,session);
});
test('wrong session, duplicate, missing part and renamed file fail closed',()=>{
 const other='10000000000000000000000000000000';
 for(const files of [
  [part(1),part(2,other)],[part(1),part(1)],
  [part(1),part(3)],[part(2),part(3)],
  [part(1),{name:'private_file.mp4',size:500}],
  [part(1),{...part(2),size:0}]
 ]) assert.equal(validateRayBanParts(files).ok,false);
});
test('never infer a complete multi-part take from one segment or unbounded inputs',()=>{
 assert.equal(validateRayBanParts([part(1)]).ok,false);
 assert.equal(validateRayBanParts(Array.from({length:41},(_,i)=>part(i+1))).ok,false);
 assert.equal(validateRayBanParts([]).ok,false);
});

test('restore drops entire group when even one recorded segment lacks stored bytes',()=>{
 const project=new Set(['a1','a2','a3']);
 const files=new Set(['a1','a3']);
 assert.deepEqual(restoreDirectorAssetLinks({assetId:'a1',assetIds:['a1','a2','a3']},project,files),
   {assetId:null,assetIds:[]});
});
test('restore retains ordered segments only when every blob and project ID exists',()=>{
 const ids=new Set(['a1','a2','a3']);
 const out=restoreDirectorAssetLinks({assetId:'a1',assetIds:['a1','a2','a3']},ids,ids);
 assert.deepEqual(out,{assetId:'a1',assetIds:['a1','a2','a3']});
 assert.deepEqual(restoreDirectorAssetLinks({assetId:'a1'},ids,new Set(['a1'])),{assetId:'a1',assetIds:['a1']});
});
test('restore fails closed on corrupt primary, duplicates and foreign identifiers',()=>{
 const project=new Set(['a1','a2']),files=new Set(['a1','a2']);
 for(const record of [
   {assetId:'a2',assetIds:['a1','a2']},
   {assetId:'a1',assetIds:['a1','a1']},
   {assetId:'a1',assetIds:['a1','unknown']},
   {assetIds:['a1',null]},
 ]) assert.deepEqual(restoreDirectorAssetLinks(record,project,files),{assetId:null,assetIds:[]});
});

test('40 independently recorded Ray-Ban MP4 cuts preserve exact source durations',async()=>{
 const durations=Array.from({length:40},(_,i)=>30.003+(i%3)*0.0002);
 const p=rayBanPartPositions(durations,5.125);
 assert.equal(p.starts.length,40);
 assert.equal(p.starts[0],5.125);
 assert.equal(p.starts[1],5.125+durations[0]);
 for(let i=1;i<p.starts.length;i++)
   assert.ok(Math.abs((p.starts[i-1]+durations[i-1])-p.starts[i])<1e-9);
 assert.ok(Math.abs((p.end-5.125)-durations.reduce((a,b)=>a+b,0))<1e-8);
 const {validateMainVideoExport,exportPlan}=await import('../export.mjs');
 const clips=durations.map((duration,i)=>({
   id:'rayban-'+i,asset_id:'part-'+i,start:p.starts[i],in:0,out:duration
 }));
 assert.deepEqual(validateMainVideoExport({clips}),{ok:true});
 assert.ok(Math.abs(exportPlan({clips,texts:[]}).total-p.end)<1e-8);
});

test('multipart positions reject invalid lengths without touching existing video',()=>{
 for(const args of [
   [[],0],[[30,-1],0],[[NaN],0],[[Infinity],0],[[1],-2],
   [Array.from({length:41},()=>30),0]
 ]) assert.throws(()=>rayBanPartPositions(...args));
 const p=rayBanPartPositions([0.2,0.3,0.4],0);
 assert.deepEqual(p.starts,[0,0.2,0.5]);
});

test('Ray-Ban recording continues across 40-file mobile batches without losing session order',()=>{
 const project={assets:[]},links=[];
 const all=Array.from({length:81},(_,i)=>part(i+1));
 for(let offset=0;offset<all.length;offset+=40){
   const next=links.length?rayBanContinuation({assetIds:links,assetId:links[0]},project):null;
   const current=all.slice(offset,offset+40);
   const batch=validateRayBanParts(current,next?
     {nextPart:next.nextPart,expectedSessionId:next.sessionId}:{});
   assert.equal(batch.ok,true,JSON.stringify(batch));
   for(const file of batch.files){
     const id='asset'+(links.length+1);
     project.assets.push({id,name:file.name});links.push(id);
   }
 }
 const continuation=rayBanContinuation({assetId:links[0],assetIds:links},project);
 assert.equal(continuation.nextPart,82);
 assert.equal(continuation.sessionId,session);
 assert.equal(links.length,81);
});

test('sequential imports reject wrong session, duplicate or skipped part',()=>{
 const project={assets:[{id:'a1',name:part(1).name},{id:'a2',name:part(2).name}]};
 const next=rayBanContinuation({assetId:'a1',assetIds:['a1','a2']},project);
 assert.equal(next.nextPart,3);
 assert.equal(validateRayBanParts([part(4)],next).ok,false);
 assert.equal(validateRayBanParts([part(3,'10000000000000000000000000000000')],next).ok,false);
 assert.equal(validateRayBanParts([part(3),part(3)],next).ok,false);
 assert.equal(validateRayBanParts([part(3),part(4)],next).ok,true);
 assert.equal(validateRayBanParts([part(1)],next).ok,false);
 const foreign={assets:[{id:'a1',name:'normal.mp4'}]};
 assert.equal(rayBanContinuation({assetId:'a1',assetIds:['a1']},foreign),null);
});

test('per-selection bound remains 40, while complete shot capacity supports multi-hour recording',()=>{
 assert.equal(MAX_SHOT_PARTS,1440);
 assert.equal(validateRayBanParts(Array.from({length:41},(_,i)=>part(i+41)),
    {nextPart:41,expectedSessionId:session}).ok,false);
 const over=validateRayBanParts([part(1441)],{nextPart:1441,expectedSessionId:session});
 assert.equal(over.ok,false);
});
