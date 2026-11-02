import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {acceleratedIOSHost,detectAcceleratedIOSHost} from '../accelerated-ios-host.mjs';
import {createAcceleratedNativeSink} from '../accelerated-native-sink.mjs';

function mockWK() {
  const requests=[];
  let maxEnd=0;
  return {
    requests,
    async postMessage(msg) {
      requests.push(msg);
      assert.equal(msg.version,2);
      assert.equal(msg.protocol,2);
      if(msg.op==='helloRandom') return {ok:true,protocol:2,randomWrite:true};
      if(msg.op==='beginRandom') return {ok:true,token:39};
      if(msg.op==='writeAt') {
        assert.ok(msg.size>0&&msg.size<=1048576);
        assert.equal(Buffer.from(msg.b64,'base64').length,msg.size);
        maxEnd=Math.max(maxEnd,msg.position+msg.size);
        return {ok:true,seq:msg.seq,writtenBytes:msg.size,maxEnd};
      }
      if(msg.op==='finishRandom') return {
        ok:true,verified:true,bytes:4,
        sha256:createHash('sha256').update(Uint8Array.from([1,8,9,4])).digest('hex'),
        media:{video:true,audio:true,durationMs:1000}
      };
      if(msg.op==='abortRandom') return {ok:true};
      return {ok:false,error:'Not supported'};
    }
  };
}

test('separate iOS v2 handler supports random patched offsets and retains v1 isolation',async()=>{
  const handler=mockWK();
  const host=acceleratedIOSHost(handler);
  const sink=createAcceleratedNativeSink(host,{mime:'video/mp4',
    expectedDurationMs:1000,expectAudio:true});
  await sink.begin();
  await sink.writeAt(0,Uint8Array.from([1,2,3,4]));
  await sink.writeAt(1,Uint8Array.from([8,9]));
  const result=await sink.finish();
  assert.equal(result.verified,true);
  assert.equal(sink.state,'done');
  assert.deepEqual(handler.requests.map(x=>x.op),
    ['helloRandom','beginRandom','writeAt','writeAt','finishRandom']);
  assert.equal(handler.requests[2].b64,'AQIDBA==');
  assert.equal(handler.requests[3].b64,'CAk=');
  assert.equal(handler.requests.some(x=>x.op==='chunk'||x.op==='finish'),false);
});

test('iOS v2 rejects invalid writes before posting and caches single handler',async()=>{
  const handler=mockWK();
  const global={webkit:{messageHandlers:{wivraAcceleratedExport:handler}}};
  assert.equal(detectAcceleratedIOSHost(global),detectAcceleratedIOSHost(global));
  assert.equal(detectAcceleratedIOSHost({webkit:{messageHandlers:{wivraExport:handler}}}),null);
  const host=acceleratedIOSHost(handler);
  await assert.rejects(host.sendWriteAt({token:39,seq:0,position:0,
    bytes:new Uint8Array(1048577)}),/inválido/);
  await assert.rejects(host.sendWriteAt({token:39,seq:0,position:-1,
    bytes:Uint8Array.from([1])}),/inválido/);
  assert.equal(handler.requests.length,0);
});

test('iOS v2 refuses absent bridge and negative native acknowledgement',async()=>{
  assert.throws(()=>acceleratedIOSHost(null),/canal acelerado/);
  const handler={async postMessage(){return {ok:false,error:'rechazo nativo'};}};
  const host=acceleratedIOSHost(handler);
  await assert.rejects(host.request({op:'helloRandom'}),/rechazo nativo/);
});
