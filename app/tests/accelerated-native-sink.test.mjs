import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAcceleratedNativeSink as createRawNativeSink, ACCELERATED_NATIVE_PROTOCOL,
  ACCELERATED_NATIVE_MAX_WRITE_BYTES, ACCELERATED_NATIVE_MAX_OUTPUT_BYTES,
  ACCELERATED_NATIVE_MAX_PENDING_BYTES} from '../accelerated-native-sink.mjs';

// The natively supported v2 contract requires positive, bounded free-space
// reservation. Individual sink tests declare a realistic reservation by default;
// separate tests below assert that the raw API rejects missing/zero reserves.
function createReservedSink(host, options={}){
  return createRawNativeSink(host,{estimatedBytes:1024,...options});
}

function memoryNative({v2=true,badSha=false,hasAudio=null,durationMs=1000}={}) {
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
        return {verified:true,token:15,bytes:maxEnd,sha256:badSha?'x':digest,
          media:{video:true,audio:hasAudio===null?message.expectAudio:hasAudio,durationMs}};
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
  const sink=createReservedSink(host,{mime:'video/mp4',expectedDurationMs:1000,
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
  assert.throws(()=>createReservedSink({request(){}},{mime:'video/mp4',expectedDurationMs:1000}),/puente nativo/);
  const old=memoryNative({v2:false});
  const sink=createReservedSink(old,{mime:'video/webm',expectedDurationMs:1000});
  await assert.rejects(sink.begin(),/escritura aleatoria/);
  assert.equal(old.requests.filter(x=>x.op==='beginRandom').length,0);
  assert.equal(sink.state,'failed');
  assert.equal(ACCELERATED_NATIVE_PROTOCOL,2);
  assert.equal(ACCELERATED_NATIVE_MAX_WRITE_BYTES,1048576);
});

test('v2 refuses unknown formats, missing audio, bad hashes, illegal offsets and short acknowledgements',async()=>{
  assert.throws(()=>createReservedSink(memoryNative(),{mime:'video/mp4',expectedDurationMs:0}),/Duración/);
  assert.throws(()=>createReservedSink(memoryNative(),{mime:'video/avi',expectedDurationMs:1}),/Contenedor/);
  const h=memoryNative({badSha:true});
  const sink=createReservedSink(h,{mime:'video/mp4',expectedDurationMs:1000,expectAudio:true});
  await sink.begin();
  for (const [pos,data] of [
    [-2,new Uint8Array([1])], [0,new Uint8Array(0)],
    [0,new Uint8Array(ACCELERATED_NATIVE_MAX_WRITE_BYTES+1)]
  ]) await assert.rejects(sink.writeAt(pos,data),/inválido/);
  await sink.writeAt(0,new Uint8Array([1,2]));
  let invalidReceipt;
  try{await sink.finish();}catch(error){invalidReceipt=error;}
  assert.match(invalidReceipt?.message??'',/no superó/);
  assert.equal(invalidReceipt?.code,'WIVRA_ACCELERATED_FINISH_UNCERTAIN');
  await sink.abort();
  assert.equal(h.removed,false,'native may have sealed a file despite a bad digest receipt');
  const h2=memoryNative({hasAudio:false});
  const sink2=createReservedSink(h2,{mime:'video/webm',expectedDurationMs:1000,expectAudio:true});
  await sink2.begin();await sink2.writeAt(0,new Uint8Array([1]));
  await assert.rejects(sink2.finish(),/no superó/);
  await sink2.abort();
  assert.equal(h2.removed,false,'missing audio receipt may follow a native commit');
});

test('one failed or canceled v2 session cannot claim a verified published video',async()=>{
  const host=memoryNative();
  host.sendWriteAt=async ()=>({seq:0,writtenBytes:0,maxEnd:1});
  const sink=createReservedSink(host,{mime:'video/mp4',expectedDurationMs:1000});
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
  const sparse = createReservedSink(missing, {mime:'video/mp4',expectedDurationMs:1000});
  await sparse.begin();
  await sparse.writeAt(4,new Uint8Array([9,8]));
  await assert.rejects(sparse.finish(),/rangos sin escribir/);
  assert.equal(missing.requests.some(r=>r.op==='finishRandom'),false);
  await sparse.abort();
  assert.equal(missing.removed,true);

  const filledHost = memoryNative();
  const filled = createReservedSink(filledHost, {mime:'video/mp4',expectedDurationMs:1000});
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
  const sink = createReservedSink(host,{mime:'video/webm',expectedDurationMs:1000});
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
  const sink = createReservedSink(host,{mime:'video/mp4',expectedDurationMs:1000});
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



test('lost finishRandom ACK preserves a possibly committed private recording',async()=>{
 const host=memoryNative();
 const nativeRequest=host.request;
 host.request=async message=>{
  if(message.op==='finishRandom'){
   await nativeRequest(message); // native may already have committed
   throw Error('transport ACK lost after native commit');
  }
  return nativeRequest(message);
 };
 const sink=createReservedSink(host,{
  mime:'video/mp4',expectedDurationMs:1000,estimatedBytes:100
 });
 await sink.begin();
 await sink.writeAt(0,new Uint8Array([1,2,3]));
 let uncertain;
 try{await sink.finish();}catch(error){uncertain=error;}
 assert.match(uncertain?.message??'',/resultado del guardado nativo es incierto/);
 assert.equal(uncertain?.code,'WIVRA_ACCELERATED_FINISH_UNCERTAIN');
 assert.equal(sink.state,'failed');
 await sink.abort(); // must not delete a possibly committed recovery copy
 assert.equal(host.removed,false);
 assert.equal(host.requests.filter(r=>r.op==='finishRandom').length,1);
 assert.equal(host.requests.filter(r=>r.op==='abortRandom').length,0);
});

test('malformed post-finalize receipt preserves native recovery and requires manual review',async()=>{
 const host=memoryNative({badSha:true});
 const sink=createReservedSink(host,{
  mime:'video/mp4',expectedDurationMs:1000
 });
 await sink.begin();
 await sink.writeAt(0,new Uint8Array([1,2,3]));
 let integrityError;
 try{await sink.finish();}catch(error){integrityError=error;}
 assert.match(integrityError?.message??'',/no superó integridad/);
 assert.equal(integrityError?.code,'WIVRA_ACCELERATED_FINISH_UNCERTAIN');
 await sink.abort();
 assert.equal(host.removed,false, 'post-finalize receipt is uncertain: native copy may be sealed');
});

test('native capacity is enforced before begin or random IO without exposing unsafe offsets', async () => {
  const host = memoryNative();
  assert.equal(ACCELERATED_NATIVE_MAX_OUTPUT_BYTES, 16 * 1024 * 1024 * 1024);
  assert.throws(() => createReservedSink(host, {
    mime: 'video/mp4', expectedDurationMs: 1000,
    estimatedBytes: ACCELERATED_NATIVE_MAX_OUTPUT_BYTES + 1
  }), /estimado inválido/);
  assert.equal(host.requests.length, 0);
  const sink = createReservedSink(host, {
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

test('v2 rejects a valid-looking hash if the native duration differs from the authored timeline',async()=>{
 const host=memoryNative({durationMs:3000});
 const writer=createReservedSink(host,{
   mime:'video/mp4',expectedDurationMs:1000,expectAudio:true
 });
 await writer.begin();
 await writer.writeAt(0,new Uint8Array([1,2,3]));
 let integrityError;
 try{await writer.finish();}catch(error){integrityError=error;}
 assert.match(integrityError?.message??'',/no superó integridad/);
 assert.equal(integrityError?.code,'WIVRA_ACCELERATED_FINISH_UNCERTAIN');
 assert.equal(writer.state,'failed');
 await writer.abort();
 assert.equal(host.removed,false, 'post-finalize receipt is uncertain: native copy may be sealed');
 const almost=memoryNative({durationMs:1999});
 const ok=createReservedSink(almost,{
   mime:'video/mp4',expectedDurationMs:1000,expectAudio:true
 });
 await ok.begin();await ok.writeAt(0,new Uint8Array([9,8,7]));
 assert.equal((await ok.finish()).media.durationMs,1999);
});

test('v2 long-form duration window is capped at five seconds and never trusts non-integer duration',async()=>{
 for(const durationMs of [3594500,3605100,NaN,Infinity,0]){
  const host=memoryNative({durationMs});
  const writer=createReservedSink(host,{
    mime:'video/mp4',expectedDurationMs:3600000,expectAudio:false
  });
  await writer.begin();
  await writer.writeAt(0,new Uint8Array([1,2,3]));
  let integrityError;
 try{await writer.finish();}catch(error){integrityError=error;}
 assert.match(integrityError?.message??'',/no superó integridad/);
 assert.equal(integrityError?.code,'WIVRA_ACCELERATED_FINISH_UNCERTAIN');
  await writer.abort();
  assert.equal(host.removed,false, 'post-finalize receipt is uncertain: native copy may be sealed');
 }
});

test('v2 bounds queued unacknowledged chunks and drains memory on cancel',async()=>{
 const host=memoryNative();
 const original=host.sendWriteAt;
 let release,entered;
 const gate=new Promise(resolve=>{release=resolve;});
 const seen=new Promise(resolve=>{entered=resolve;});
 host.sendWriteAt=async message=>{
  if(message.seq===0){entered();await gate;}
  return original(message);
 };
 const sink=createReservedSink(host,{mime:'video/mp4',
  expectedDurationMs:1000,estimatedBytes:ACCELERATED_NATIVE_MAX_PENDING_BYTES});
 await sink.begin();
 assert.equal(ACCELERATED_NATIVE_MAX_PENDING_BYTES,8*1024*1024);
 const writes=[];
 for(let i=0;i<8;i++)
  writes.push(sink.writeAt(i*1024*1024,new Uint8Array(1024*1024)));
 await seen;
 assert.equal(sink.pendingBytes,ACCELERATED_NATIVE_MAX_PENDING_BYTES);
 await assert.rejects(sink.writeAt(8*1024*1024,
  new Uint8Array(1)),/Cola de escritura acelerada/);
 assert.equal(sink.pendingBytes,ACCELERATED_NATIVE_MAX_PENDING_BYTES);
 release();
 await Promise.all(writes);
 assert.equal(sink.pendingBytes,0);
 assert.equal(sink.writeBytes,8*1024*1024);
 await sink.abort();
 assert.equal(host.removed,true);
 assert.equal(host.requests.some(x=>x.op==='finishRandom'),false);
});

test('a failed v2 acknowledgment returns pending memory budget to zero',async()=>{
 const host=memoryNative();
 host.sendWriteAt=async ()=>{throw Error('Native disk I/O failure');};
 const sink=createReservedSink(host,{
  mime:'video/mp4',expectedDurationMs:1000
 });
 await sink.begin();
 await assert.rejects(sink.writeAt(0,new Uint8Array(1024)),
  /Native disk I\/O failure/);
 assert.equal(sink.pendingBytes,0);
 await assert.rejects(sink.finish(),/Native disk I\/O failure/);
 await sink.abort();
 assert.equal(sink.pendingBytes,0);
 assert.equal(host.removed,true);
});

test('raw native sink refuses missing, zero or malformed storage budget before native handshake',async()=>{
 const host=memoryNative();
 for(const estimatedBytes of [undefined,null,0,-1,1.25,'2048',NaN,Infinity,
   ACCELERATED_NATIVE_MAX_OUTPUT_BYTES+1]){
  const options={mime:'video/mp4',expectedDurationMs:1000};
  if(estimatedBytes!==undefined)options.estimatedBytes=estimatedBytes;
  assert.throws(()=>createRawNativeSink(host,options),/Duración\/tamaño estimado inválido/);
 }
 assert.equal(host.requests.length,0,'invalid reserve must never contact native host');
 const good=createRawNativeSink(host,{
  mime:'video/mp4',expectedDurationMs:1000,estimatedBytes:1024
 });
 await good.begin();
 assert.equal(host.requests.find(r=>r.op==='beginRandom')?.estimatedBytes,1024);
 await good.abort();
 assert.equal(host.removed,true);
});

test('silent export never accepts a surprise audio track in native verified receipt',async()=>{
 const host=memoryNative({hasAudio:true});
 const sink=createReservedSink(host,{
  mime:'video/mp4',expectedDurationMs:1000,expectAudio:false
 });
 await sink.begin();
 await sink.writeAt(0,Uint8Array.of(1,2,3));
 let integrityError;
 try{await sink.finish();}catch(error){integrityError=error;}
 assert.match(integrityError?.message??'',/no superó integridad/);
 assert.equal(integrityError?.code,'WIVRA_ACCELERATED_FINISH_UNCERTAIN');
 await sink.abort();
 assert.equal(host.removed,false, 'post-finalize receipt is uncertain: native copy may be sealed');
 assert.equal(host.requests.filter(r=>r.op==='finishRandom').length,1);
});

test('missing native audio metadata never claims verified silent media',async()=>{
 const host=memoryNative();
 const original=host.request;
 host.request=async message=>{
  const response=await original(message);
  if(message.op==='finishRandom')delete response.media.audio;
  return response;
 };
 const sink=createReservedSink(host,{
  mime:'video/mp4',expectedDurationMs:1000,expectAudio:false
 });
 await sink.begin(); await sink.writeAt(0,Uint8Array.of(1));
 let integrityError;
 try{await sink.finish();}catch(error){integrityError=error;}
 assert.match(integrityError?.message??'',/no superó integridad/);
 assert.equal(integrityError?.code,'WIVRA_ACCELERATED_FINISH_UNCERTAIN');
 await sink.abort();
 assert.equal(host.removed,false, 'post-finalize receipt is uncertain: native copy may be sealed');
});

test('v2 native audio policy is boolean, not a truthy string',()=>{
 const host=memoryNative();
 for(const value of ['false',1,null,{},[]]){
  assert.throws(()=>createRawNativeSink(host,{
   mime:'video/mp4',expectedDurationMs:1000,
   estimatedBytes:1024,expectAudio:value
  }),/política de audio/);
 }
 assert.equal(host.requests.length,0);
});

test('native v2 rejects verified receipts for another token or without a token',async()=>{
 for(const receiptToken of [undefined,0,14,16]){
  const host=memoryNative(),base=host.request;
  host.request=async request=>{
   const receipt=await base(request);
   if(request.op==='finishRandom'){
    if(receiptToken===undefined){delete receipt.token;return receipt;}
    return {...receipt,token:receiptToken};
   }
   return receipt;
  };
  const sink=createReservedSink(host,{
   mime:'video/mp4',expectedDurationMs:1000,expectAudio:false
  });
  await sink.begin();
  await sink.writeAt(0,Uint8Array.from([1,2,3]));
  let integrityError;
 try{await sink.finish();}catch(error){integrityError=error;}
 assert.match(integrityError?.message??'',/no superó integridad/);
 assert.equal(integrityError?.code,'WIVRA_ACCELERATED_FINISH_UNCERTAIN');
  assert.equal(sink.state,'failed');
  await sink.abort();
  assert.equal(host.removed,false, 'post-finalize receipt is uncertain: native copy may be sealed');
 }
});

test('post-finalize receipt denial is uncertain even if native verified=false',async()=>{
 const host=memoryNative(),nativeRequest=host.request.bind(host);
 host.request=async message=>{
  const result=await nativeRequest(message);
  if(message.op==='finishRandom')return {...result,verified:false};
  return result;
 };
 const sink=createReservedSink(host,{mime:'video/mp4',expectedDurationMs:1000});
 await sink.begin();
 await sink.writeAt(0,Uint8Array.from([1,2,3]));
 let error;
 try{await sink.finish()}catch(e){error=e}
 assert.equal(error?.code,'WIVRA_ACCELERATED_FINISH_UNCERTAIN');
 await sink.abort();
 assert.equal(host.removed,false);
 assert.equal(host.requests.filter(x=>x.op==='abortRandom').length,0);
});
