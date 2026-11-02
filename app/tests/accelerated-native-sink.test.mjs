import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAcceleratedNativeSink, ACCELERATED_NATIVE_PROTOCOL,
  ACCELERATED_NATIVE_MAX_WRITE_BYTES, ACCELERATED_NATIVE_MAX_OUTPUT_BYTES} from '../accelerated-native-sink.mjs';

function memoryNative({v2=true,badSha=false,hasAudio=true}={}) {
  let active=false, removed=false, maxEnd=0;
  let bytes=new Uint8Array(0);
  const requests=[];
  const host={
    requests,
    async request(message){
      requests.push(message);
      if(message.op==='helloRandom')return {protocol:v2?2:1,randomWrite:v2};
      if(message.op==='beginRandom') {active=true;return {token:15};}
      if(message.op==='abortRandom'){active=false;removed=true;return {ok:true};}
      if(message.op==='finishRandom'){
        if(!active)throw Error('session ended');
        const digest=createHash('sha256').update(bytes).digest('hex');
        return {verified:true,bytes:maxEnd,sha256:badSha?'x':digest,
          media:{video:true,audio:hasAudio,durationMs:1000}};
      }
      throw Error('unknown op');
    },
    async sendWriteAt({protocol,token,seq,position,bytes:data}) {
      assert.equal(protocol,2);assert.equal(token,15);assert.equal(active,true);
      const end=position+data.length;
      if(end>bytes.length){const copy=new Uint8Array(end);copy.set(bytes);bytes=copy;}
      bytes.set(data,position);maxEnd=Math.max(maxEnd,end);
      return {seq,writtenBytes:data.length,maxEnd};
    },
    get contents(){return [...bytes];},
    get removed(){return removed;}
  };
  return host;
}

test('v2 writer patches earlier MP4 headers and verifies final file hash, not chunk CRC',async()=>{
  const host=memoryNative();
  const sink=createAcceleratedNativeSink(host,{mime:'video/mp4',expectedDurationMs:1000,
    expectAudio:true,estimatedBytes:50});
  await sink.begin();
  const first=sink.writeAt(0,new Uint8Array([1,2,3,4]));
  const second=sink.writeAt(1,new Uint8Array([8,9]));
  // finish must drain both writes, even when called before their promises settle.
  const result=await sink.finish();
  await Promise.all([first,second]);
  assert.equal(sink.state,'done');
  assert.equal(sink.maxEnd,4);
  assert.equal(sink.writeBytes,6);
  assert.deepEqual(host.contents,[1,8,9,4]);
  assert.match(result.sha256,/^[0-9a-f]{64}$/);
  assert.equal(result.bytes,4);
  assert.equal(host.requests.filter(x=>x.op==='finishRandom').length,1);
  assert.equal(host.requests.filter(x=>x.op==='abortRandom').length,0);
});

test('legacy append-only bridge or absent random writer must never receive accelerated chunks',async()=>{
  assert.throws(()=>createAcceleratedNativeSink({request(){}},{mime:'video/mp4',expectedDurationMs:1000}),/puente nativo/);
  const old=memoryNative({v2:false});
  const sink=createAcceleratedNativeSink(old,{mime:'video/webm',expectedDurationMs:1000});
  await assert.rejects(sink.begin(),/escritura aleatoria/);
  assert.equal(old.requests.filter(x=>x.op==='beginRandom').length,0);
  assert.equal(sink.state,'failed');
  assert.equal(ACCELERATED_NATIVE_PROTOCOL,2);
  assert.equal(ACCELERATED_NATIVE_MAX_WRITE_BYTES,1048576);
});

test('v2 refuses unknown formats, missing audio, bad hashes, illegal offsets and short acknowledgements',async()=>{
  assert.throws(()=>createAcceleratedNativeSink(memoryNative(),{mime:'video/mp4',expectedDurationMs:0}),/Duración/);
  assert.throws(()=>createAcceleratedNativeSink(memoryNative(),{mime:'video/avi',expectedDurationMs:1}),/Contenedor/);
  const h=memoryNative({badSha:true});
  const sink=createAcceleratedNativeSink(h,{mime:'video/mp4',expectedDurationMs:1000,expectAudio:true});
  await sink.begin();
  for (const [pos,data] of [
    [-2,new Uint8Array([1])], [0,new Uint8Array(0)],
    [0,new Uint8Array(ACCELERATED_NATIVE_MAX_WRITE_BYTES+1)]
  ]) await assert.rejects(sink.writeAt(pos,data),/inválido/);
  await sink.writeAt(0,new Uint8Array([1,2]));
  await assert.rejects(sink.finish(),/no superó/);
  await sink.abort();
  assert.equal(h.removed,true);
  const h2=memoryNative({hasAudio:false});
  const sink2=createAcceleratedNativeSink(h2,{mime:'video/webm',expectedDurationMs:1000,expectAudio:true});
  await sink2.begin();await sink2.writeAt(0,new Uint8Array([1]));
  await assert.rejects(sink2.finish(),/no superó/);
  await sink2.abort();
});

test('one failed or canceled v2 session cannot claim a verified published video',async()=>{
  const host=memoryNative();
  host.sendWriteAt=async ()=>({seq:0,writtenBytes:0,maxEnd:1});
  const sink=createAcceleratedNativeSink(host,{mime:'video/mp4',expectedDurationMs:1000});
  await sink.begin();
  await assert.rejects(sink.writeAt(0,new Uint8Array([1])),/diferente/);
  await assert.rejects(sink.finish(),/diferente/);
  await sink.abort();
  assert.equal(sink.state,'aborted');
  assert.equal(host.removed,true);
  assert.equal(host.requests.some(x=>x.op==='finishRandom'),false);
});

test('native v2 rejects unwritten sparse ranges before committing; fully patched offsets pass', async () => {
  const missing = memoryNative();
  const sparse = createAcceleratedNativeSink(missing, {mime:'video/mp4',expectedDurationMs:1000});
  await sparse.begin();
  await sparse.writeAt(4,new Uint8Array([9,8]));
  await assert.rejects(sparse.finish(),/rangos sin escribir/);
  assert.equal(missing.requests.some(r=>r.op==='finishRandom'),false);
  await sparse.abort();
  assert.equal(missing.removed,true);

  const filledHost = memoryNative();
  const filled = createAcceleratedNativeSink(filledHost, {mime:'video/mp4',expectedDurationMs:1000});
  await filled.begin();
  await filled.writeAt(2,new Uint8Array([3,4]));
  await filled.writeAt(0,new Uint8Array([1,2]));
  await filled.writeAt(1,new Uint8Array([7]));
  const result = await filled.finish();
  assert.equal(result.verified,true);
  assert.deepEqual(filledHost.contents,[1,7,3,4]);
});

test('cancellation while random writes drain cannot race a late native finish', async () => {
  const host = memoryNative();
  const send = host.sendWriteAt;
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const inFlight = new Promise(resolve => { entered = resolve; });
  host.sendWriteAt = async message => {
    entered();
    await gate;
    return send(message);
  };
  const sink = createAcceleratedNativeSink(host,{mime:'video/webm',expectedDurationMs:1000});
  await sink.begin();
  const write = sink.writeAt(0,new Uint8Array([1,2,3]));
  await inFlight;
  const finishing = sink.finish();
  const aborting = sink.abort();
  release();
  await write;
  await assert.rejects(finishing,/cancelada/);
  await aborting;
  assert.equal(sink.state,'aborted');
  assert.equal(host.removed,true);
  assert.equal(host.requests.some(r=>r.op==='finishRandom'),false);
});

test('abort during native atomic finalize does not delete a possibly published file', async () => {
  const host = memoryNative();
  const request = host.request;
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const inFlight = new Promise(resolve => { entered = resolve; });
  host.request = async message => {
    if (message.op === 'finishRandom') { entered(); await gate; }
    return request(message);
  };
  const sink = createAcceleratedNativeSink(host,{mime:'video/mp4',expectedDurationMs:1000});
  await sink.begin();
  await sink.writeAt(0,new Uint8Array([1,2]));
  const finishing = sink.finish();
  await inFlight;
  await sink.abort();
  release();
  await finishing;
  assert.equal(sink.state,'done');
  assert.equal(host.removed,false);
});


test('native capacity is enforced before begin or random IO without exposing unsafe offsets', async () => {
  const host = memoryNative();
  assert.equal(ACCELERATED_NATIVE_MAX_OUTPUT_BYTES, 16 * 1024 * 1024 * 1024);
  assert.throws(() => createAcceleratedNativeSink(host, {
    mime: 'video/mp4', expectedDurationMs: 1000,
    estimatedBytes: ACCELERATED_NATIVE_MAX_OUTPUT_BYTES + 1
  }), /estimado inválido/);
  assert.equal(host.requests.length, 0);
  const sink = createAcceleratedNativeSink(host, {
    mime: 'video/mp4', expectedDurationMs: 1000,
    estimatedBytes: ACCELERATED_NATIVE_MAX_OUTPUT_BYTES
  });
  await sink.begin();
  await assert.rejects(sink.writeAt(ACCELERATED_NATIVE_MAX_OUTPUT_BYTES,
    Uint8Array.from([1])), /inválido/);
  assert.equal(sink.maxEnd, 0);
  assert.equal(sink.writeBytes, 0);
  assert.equal(host.requests.filter(r => r.op === 'finishRandom').length, 0);
  await sink.abort();
  assert.equal(host.removed, true);
});
