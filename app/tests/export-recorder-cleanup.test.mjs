import test from 'node:test';
import assert from 'node:assert/strict';
import { finishMediaRecorder, RECORDER_STOP_TIMEOUT_MS, playVideoForExport } from '../export.mjs';
import { readFileSync } from 'node:fs';

test('MediaRecorder.start throw: no wait on event that will never fire',async()=>{
 const recorder={state:'inactive',stop(){throw new Error('stop must not run')}};
 const unresolved=new Promise(()=>{});
 await Promise.race([
   finishMediaRecorder(recorder,unresolved,{started:false,ms:50}),
   new Promise((_,reject)=>setTimeout(()=>reject(new Error('hung before start')),100))
 ]);
});
test('successful recorder stop awaits final dataavailable/onstop and stops exactly once',async()=>{
 let count=0,finish;
 const stopped=new Promise(resolve=>finish=resolve);
 const recorder={state:'recording',stop(){count++;this.state='inactive';setTimeout(finish,5)}};
 await finishMediaRecorder(recorder,stopped,{started:true,ms:120});
 assert.equal(count,1);
});
test('already stopped and onstop already fired resolves without extra stop call',async()=>{
 const recorder={state:'inactive',stop(){throw new Error('duplicate stop')}};
 await finishMediaRecorder(recorder,Promise.resolve(),{started:true,ms:80});
});
test('broken WebView never emits onstop: bounded error instead of indefinite spinner',async()=>{
 let stoppedCount=0;
 const recorder={state:'recording',stop(){stoppedCount++;this.state='inactive'}};
 await assert.rejects(finishMediaRecorder(recorder,new Promise(()=>{}),{started:true,ms:35}),/no terminó de cerrar/);
 assert.equal(stoppedCount,1);
});
test('editor releases media and removes visibility listener even if closing the recorder fails',()=>{
 const code=readFileSync(new URL('../export.mjs',import.meta.url),'utf8');
 assert.match(code,/rec\.start\(1000\);\s*recorderStarted = true;/);
 assert.match(code,/try \{\s*await finishMediaRecorder\(rec, stopped, \{ started: recorderStarted \}\);\s*\} finally \{/);
 assert.match(code,/document\.removeEventListener\('visibilitychange', onVis\)/);
 assert.equal(RECORDER_STOP_TIMEOUT_MS>=5000,true);
});

test('MediaRecorder constructor failure releases canvas stream, overlay elements and AudioContext',()=>{
 const code=readFileSync(new URL('../export.mjs',import.meta.url),'utf8');
 assert.match(code,/try \{\s*rec = new MediaRecorder\(/);
 assert.match(code,/catch \(error\) \{\s*\/\/ Some WebViews advertise/);
 assert.match(code,/stream\.getTracks\(\)\.forEach\(\(track\) => \{ try \{ track\.stop\(\)/);
 assert.match(code,/await ac\.close\(\)/);
 assert.match(code,/no pudo iniciar el grabador/);
});

test('video start: play resolves, and both synchronous and async errors reject',async()=>{
  let calls=0;
  assert.equal(await playVideoForExport({play(){calls++;return Promise.resolve()}},{ms:50}),true);
  assert.equal(calls,1);
  await assert.rejects(playVideoForExport({play(){throw Error('decoder')}}),/no dejó reproducir/);
  await assert.rejects(playVideoForExport({play(){return Promise.reject(Error('decoder'))}}),/no dejó reproducir/);
});
test('video start: frozen WebView cannot hang export indefinitely',async()=>{
  const never={play(){return new Promise(()=>{})}};
  await assert.rejects(playVideoForExport(never,{ms:35}),/tardó demasiado en comenzar/);
});
test('video start: cancellation before or during pending play returns false',async()=>{
  assert.equal(await playVideoForExport({play(){throw Error('should not be called')}},{isCancelled:()=>true}),false);
  let cancel=false;setTimeout(()=>{cancel=true},20);
  assert.equal(await playVideoForExport({play(){return new Promise(()=>{})}},{ms:500,isCancelled:()=>cancel}),false);
});
test('recorder failure cannot be mistaken for user cancel, and video pauses on cleanup',()=>{
  const source=readFileSync(new URL('../export.mjs',import.meta.url),'utf8');
  assert.match(source,/const stopNow = \(\) => isCancelled\(\) \|\| interrupted \|\| !!recError;/);
  assert.match(source,/if \(recError\) throw new Error\('La grabación falló/);
  assert.ok(source.indexOf("if (recError) throw new Error('La grabación falló") <
    source.lastIndexOf("if (cancelled || isCancelled()) return { cancelled: true }"));
  assert.match(source,/try \{ ev\.pause\(\); \} catch \{ \/\* nada \*\/ \} ev\.remove\(\)/);
});

test('recorded chunks are accounted for and final Blob byte size is verified',()=>{
 const code=readFileSync(new URL('../export.mjs',import.meta.url),'utf8');
 assert.match(code,/let recordedBytes = 0/);
 assert.match(code,/recordedBytes \+= e\.data\.size/);
 assert.match(code,/if \(recordedBytes !== blob\.size\) throw new Error/);
});
