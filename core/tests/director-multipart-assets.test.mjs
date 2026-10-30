import test from 'node:test';
import assert from 'node:assert/strict';
import {createShootPlan, updateShot} from '../shoot-checklist.mjs';

const project={assets:[
 {id:'a1',name:'rayban_part0001.mp4',duration:30},
 {id:'a2',name:'rayban_part0002.mp4',duration:30},
 {id:'a3',name:'rayban_part0003.mp4',duration:12}
]};
const plan=()=>createShootPlan({subject:'Whistler mountain POV'});

test('Director preserves a complete ordered multi-part take with primary asset',()=>{
 const p=updateShot(plan(),'shot-1',{state:'done',assetIds:['a1','a2','a3']},{project});
 assert.equal(p.shots[0].assetId,'a1');
 assert.deepEqual(p.shots[0].assetIds,['a1','a2','a3']);
 assert.equal(p.shots[0].state,'done');
});

test('Director rejects incomplete, duplicate, foreign and oversized multipart IDs',()=>{
 for(const ids of [['a1','a1'],['a1','unowned'],['a1',2],Array(41).fill('a1')]){
  assert.throws(()=>updateShot(plan(),'shot-1',{state:'done',assetIds:ids},{project}));
 }
 assert.throws(()=>updateShot(plan(),'shot-1',{assetId:'a3',assetIds:['a1','a2']},{project}));
});

test('Changing or clearing primary asset also clears former multipart binding',()=>{
 const p=updateShot(plan(),'shot-1',{state:'done',assetIds:['a1','a2']},{project});
 const updated=updateShot(p,'shot-1',{assetId:'a3'},{project});
 assert.deepEqual(updated.shots[0].assetIds,['a3']);
 const cleared=updateShot(updated,'shot-1',{state:'retry',assetId:null},{project});
 assert.equal(cleared.shots[0].assetId,null);
 assert.deepEqual(cleared.shots[0].assetIds,[]);
});

test('Legacy single-asset shots retain the same update behavior',()=>{
 const p=updateShot(plan(),'shot-1',{assetId:'a1',state:'done'},{project});
 assert.equal(p.shots[0].assetId,'a1');
 assert.deepEqual(p.shots[0].assetIds,['a1']);
});

test('long captures retain 81 distinct real assets in a single offline Director shot',()=>{
 const many=Array.from({length:81},(_,i)=>({id:'part'+(i+1),name:'RayBan_'+(i+1)+'.mp4'}));
 const ids=many.map(x=>x.id);
 const result=updateShot(plan(),'shot-1',{state:'done',assetIds:ids},{project:{assets:many}});
 assert.equal(result.shots[0].assetId,ids[0]);
 assert.deepEqual(result.shots[0].assetIds,ids);
 const over=Array.from({length:1441},(_,i)=>({id:'over'+i}));
 assert.throws(()=>updateShot(plan(),'shot-1',{assetIds:over.map(x=>x.id)},{project:{assets:over}}));
});
