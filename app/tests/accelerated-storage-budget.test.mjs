import test from 'node:test';
import assert from 'node:assert/strict';
import {exportEstimatedBytes} from '../export.mjs';
import {planAcceleratedStorageReservation as plan,
 ACCELERATED_STORAGE_MAX_BYTES,
 ACCELERATED_STORAGE_MARGIN_BYTES} from '../accelerated-storage-budget.mjs';

test('automatic Wivra accelerated storage planning never underreports existing export bitrate',()=>{
 for(const p of [
  {seconds:.4,width:320,height:180,fps:30},
  {seconds:30,width:1280,height:720,fps:30},
  {seconds:180,width:1920,height:1080,fps:60},
  {seconds:180,width:3840,height:2160,fps:30}
 ]) {
  const b=plan(p);
  const modeled=exportEstimatedBytes(p.seconds,{
   progressive:true,width:p.width,height:p.height,fps:p.fps
  });
  assert.equal(b.modeledBytes,modeled);
  assert.ok(b.estimatedBytes>=Math.ceil(modeled*1.15)+ACCELERATED_STORAGE_MARGIN_BYTES);
  assert.equal(b.safetyMarginBytes,b.estimatedBytes-modeled);
  assert.equal(b.source,'automatic');
  assert.ok(b.estimatedBytes<=ACCELERATED_STORAGE_MAX_BYTES);
 }
});

test('explicit reserve cannot lower storage protection, cannot be malformed',()=>{
 const p={seconds:60,width:1920,height:1080,fps:30},min=plan(p);
 const declared=plan({...p,estimatedBytes:min.estimatedBytes+1000000});
 assert.equal(declared.source,'explicit');
 assert.equal(declared.estimatedBytes,min.estimatedBytes+1000000);
 for(const estimatedBytes of [0,1,min.modeledBytes,min.estimatedBytes-1,
   -1,NaN,Infinity,3.5,'1000000000',ACCELERATED_STORAGE_MAX_BYTES+1])
  assert.throws(()=>plan({...p,estimatedBytes}),/Reserva manual/);
});

test('no full-hour native reservation loophole or oversized and fractional dimensions',()=>{
 const good={seconds:30,width:1280,height:720,fps:30};
 for(const change of [
  {seconds:600},{seconds:3600},{seconds:-1},{seconds:Infinity},
  {width:3841},{width:0},{height:0},{height:4000},
  {width:3839,height:3839},{fps:11},{fps:61},{fps:30.5}
 ])
  assert.throws(()=>plan({...good,...change}),/fuera del modo QA/);
});
