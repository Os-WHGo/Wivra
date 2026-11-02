import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {acceleratedAndroidHost, detectAcceleratedAndroidHost} from '../accelerated-android-host.mjs';
import {createAcceleratedNativeSink} from '../accelerated-native-sink.mjs';

function fakeWebMessage() {
  const seen = [];
  let receiver, maxEnd = 0;
  const obj = {
    seen,
    addEventListener(type, cb) {assert.equal(type, 'message');receiver=cb;},
    postMessage(json) {
      const msg = JSON.parse(json);
      seen.push(msg);
      queueMicrotask(() => {
        const answer = {rid:msg.rid,ok:true};
        if(msg.op==='helloRandom') Object.assign(answer,{protocol:2,randomWrite:true});
        if(msg.op==='beginRandom') answer.token=45;
        if(msg.op==='writeAt') {
          maxEnd = Math.max(maxEnd, msg.position + msg.size);
          Object.assign(answer,{seq:msg.seq,writtenBytes:msg.size,maxEnd});
        }
        if(msg.op==='finishRandom') Object.assign(answer,{
          verified:true,bytes:4,sha256:createHash('sha256')
            .update(Uint8Array.from([1,8,9,4])).digest('hex'),
          media:{video:true,audio:true,durationMs:1000}
        });
        receiver({data:JSON.stringify(answer)});
      });
    }
  };
  return obj;
}

test('v2 Android transport identifies exact protocol, offsets and bounded base64',async()=>{
  const obj=fakeWebMessage(), host=acceleratedAndroidHost(obj);
  const hello=await host.request({op:'helloRandom'});
  assert.equal(hello.randomWrite,true);
  const begin=await host.request({op:'beginRandom',mime:'video/mp4',estimatedBytes:16});
  assert.equal(begin.token,45);
  const ack=await host.sendWriteAt({token:45,seq:0,position:3,
    bytes:Uint8Array.from([3,4])});
  assert.deepEqual({seq:ack.seq,writtenBytes:ack.writtenBytes,maxEnd:ack.maxEnd},
    {seq:0,writtenBytes:2,maxEnd:5});
  assert.equal(obj.seen.length,3);
  assert.ok(obj.seen.every(msg => msg.v===2 && msg.protocol===2 && msg.rid>0));
  assert.equal(obj.seen[2].b64,'AwQ=');
  await assert.rejects(host.sendWriteAt({token:45,seq:1,position:0,
    bytes:new Uint8Array(1024*1024+1)}),/inválido/);
  assert.equal(obj.seen.length,3);
});

test('transport can drive the native-v2 sink without touching v1',async()=>{
  const obj=fakeWebMessage(), host=acceleratedAndroidHost(obj);
  const sink=createAcceleratedNativeSink(host,{mime:'video/mp4',
    expectedDurationMs:1000,expectAudio:true});
  await sink.begin();
  await sink.writeAt(0,Uint8Array.from([1,2,3,4]));
  // Fake bridge returns the real highest offset after overlapping patches.
  await sink.writeAt(1,Uint8Array.from([8,9]));
  const result=await sink.finish();
  assert.equal(result.verified,true);
  assert.equal(sink.state,'done');
  assert.deepEqual(obj.seen.map(r=>r.op),
    ['helloRandom','beginRandom','writeAt','writeAt','finishRandom']);
  assert.equal(obj.seen.some(r => r.op==='chunk' || r.op==='finish'),false);
});

test('native host detection reuses one reply listener and never assumes iOS/v1',()=>{
  assert.equal(detectAcceleratedAndroidHost({WivraExportNative:{postMessage(){}}}),null);
  const obj=fakeWebMessage(), global={WivraAcceleratedExportNative:obj};
  assert.equal(detectAcceleratedAndroidHost(global),detectAcceleratedAndroidHost(global));
});

test('a forged or stale response cannot resolve another random-write request',async()=>{
  const obj={postMessage(json) { this.sent=JSON.parse(json); },
    addEventListener(_,cb){this.reply=cb;}};
  const host=acceleratedAndroidHost(obj,{requestMs:100});
  const pending=host.request({op:'helloRandom'});
  obj.reply({data:JSON.stringify({rid:obj.sent.rid+1,ok:true,protocol:2,randomWrite:true})});
  obj.reply({data:JSON.stringify({rid:obj.sent.rid,ok:true,protocol:2,randomWrite:true})});
  assert.equal((await pending).randomWrite,true);
});
