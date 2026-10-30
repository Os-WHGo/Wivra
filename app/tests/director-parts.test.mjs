import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRayBanParts} from '../director-parts.mjs';

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
