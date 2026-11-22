import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {
  acceleratedBetaFailureDisposition, acceleratedBetaRepeatGate,
  acceleratedBetaSettingsGate, acceleratedBetaRecoverySnapshot,
  createAcceleratedRecoveryMarker, ACCELERATED_RECOVERY_MARKER_KEY,
  acceleratedNativeIntentState, acceleratedNativeIntentRequiresReview
} from '../accelerated-qa-export-ui.mjs';
import {createAcceleratedNativeSink} from '../accelerated-native-sink.mjs';
import {LOUD_LEVELS} from '../loudness.mjs';

test('native finish timeout is marked uncertain and never auto-retries or auto-falls back',async()=>{
  const ops=[];
  const host={
    async request(message){
      ops.push(message.op);
      if(message.op==='helloRandom')return {protocol:2,randomWrite:true};
      if(message.op==='beginRandom')return {token:77};
      if(message.op==='finishRandom')
        throw new Error('lost native reply after possible commit');
      if(message.op==='abortRandom')return {ok:true};
      throw new Error('unexpected operation');
    },
    async sendWriteAt({seq,position,bytes}) {
      return {seq,writtenBytes:bytes.length,maxEnd:position+bytes.length};
    }
  };
  const sink=createAcceleratedNativeSink(host,{
    mime:'video/mp4',expectedDurationMs:1000,
    expectAudio:false,estimatedBytes:1024
  });
  await sink.begin();
  await sink.writeAt(0,Uint8Array.of(1,2,3));
  let lost;
  try{await sink.finish();}catch(e){lost=e;}
  assert.equal(lost?.code,'WIVRA_ACCELERATED_FINISH_UNCERTAIN');
  assert.equal(acceleratedBetaFailureDisposition(lost).recoveryReviewRequired,true);
  assert.equal(acceleratedBetaFailureDisposition(lost).automaticFallback,false);
  assert.equal(acceleratedBetaFailureDisposition(lost).automaticRetry,false);
  await sink.abort();
  assert.deepEqual(ops,['helloRandom','beginRandom','finishRandom'],
    'never delete a possibly committed private video');
});

test('neither fast nor classic export may repeat until review and explicit consent',()=>{
  const cases=[
    {pendingRecovery:true,recoveryChecked:false,userConfirmed:false,ok:false},
    {pendingRecovery:true,recoveryChecked:false,userConfirmed:true,ok:false},
    {pendingRecovery:true,recoveryChecked:true,userConfirmed:false,ok:false},
    {pendingRecovery:true,recoveryChecked:true,userConfirmed:true,ok:true},
    {pendingRecovery:false,recoveryChecked:false,userConfirmed:false,ok:true}
  ];
  for(const {ok,...args} of cases){
    const result=acceleratedBetaRepeatGate(args);
    assert.equal(result.ok,ok,JSON.stringify(args));
    if(!ok)assert.ok(result.reason.length>20);
  }
});

test('ordinary codec refusal never launches the classic engine automatically',()=>{
  const result=acceleratedBetaFailureDisposition(
    new Error('Preflight WebCodecs móvil: encoder not supported'));
  assert.equal(result.recoveryReviewRequired,false);
  assert.equal(result.automaticRetry,false);
  assert.equal(result.automaticFallback,false);
  assert.match(result.message,/manualmente/);
  assert.equal(acceleratedBetaSettingsGate({loudness:'ebu-r128'}).ok,false);
});

test('uncertain native reply without code is recognized for older adapters',()=>{
  const result=acceleratedBetaFailureDisposition(new Error(
    'El resultado del guardado nativo es incierto. Revisa videos recuperables antes de repetir la exportación.'
  ));
  assert.equal(result.recoveryReviewRequired,true);
  assert.match(result.message,/galería/);
});

test('QA UI gates BOTH export buttons and requires native recovery check',()=>{
  const ui=readFileSync(new URL('../accelerated-qa-export-ui.mjs',import.meta.url),'utf8');
  assert.match(ui,/startStable\.addEventListener\('click',event=>/);
  assert.match(ui,/if\(!approveAnotherExport\('fast'\)\)return;/);
  assert.match(ui,/if\(running\|\|!approveAnotherExport\('classic'\)\)/);
  assert.match(ui,/await listRecovered\(recovered,generation\) && generation===recoveryGeneration/);
  assert.match(ui,/await listRecovered\(settingsResult,generation\) && generation===recoveryGeneration/);
  assert.match(ui,/if\(failure\.recoveryReviewRequired\)/);
  assert.match(ui,/event\.stopImmediatePropagation\(\)/);
});

test('invalid post-finish receipt triggers same recovery gate as a lost response',async()=>{
 const variants=[
  receipt=>({...receipt,token:888}),
  receipt=>({...receipt,bytes:999}),
  receipt=>({...receipt,verified:false}),
  receipt=>({...receipt,media:{...receipt.media,audio:true}})
 ];
 for(const mutate of variants){
  const ops=[];
  const host={
   async request(request){
    ops.push(request.op);
    if(request.op==='helloRandom')return {protocol:2,randomWrite:true};
    if(request.op==='beginRandom')return {token:77};
    if(request.op==='abortRandom')return {};
    if(request.op==='finishRandom'){
      const receipt={verified:true,token:77,bytes:3,sha256:'a'.repeat(64),
       media:{video:true,audio:false,durationMs:1000}};
      return mutate(receipt);
    }
    throw Error('unexpected native op');
   },
   async sendWriteAt({seq,position,bytes}){
    return {seq,writtenBytes:bytes.length,maxEnd:position+bytes.length};
   }
  };
  const sink=createAcceleratedNativeSink(host,{
   mime:'video/mp4',expectedDurationMs:1000,estimatedBytes:1024,expectAudio:false
  });
  await sink.begin();
  await sink.writeAt(0,Uint8Array.from([1,2,3]));
  let error;
  try{await sink.finish()}catch(e){error=e}
  assert.equal(error?.code,'WIVRA_ACCELERATED_FINISH_UNCERTAIN');
  const verdict=acceleratedBetaFailureDisposition(error);
  assert.equal(verdict.recoveryReviewRequired,true);
  assert.equal(acceleratedBetaRepeatGate({
   pendingRecovery:verdict.recoveryReviewRequired,recoveryChecked:false,
   userConfirmed:true
  }).ok,false);
  await sink.abort();
  assert.deepEqual(ops,['helloRandom','beginRandom','finishRandom'],
   'a possibly sealed native file must never be deleted or automatically retried');
 }
});

test('recovery catalogue belongs to the current uncertain finish, not an older async reply',()=>{
  const valid={name:'Wivra_Fast_11111111-1111-1111-1111-111111111111.mp4',
    bytes:4000000,durationMs:2400};
  const current=acceleratedBetaRecoverySnapshot({
    files:[valid],requestedGeneration:4,currentGeneration:4
  });
  assert.equal(current.ok,true);
  assert.deepEqual(current.files,[valid]);
  const stale=acceleratedBetaRecoverySnapshot({
    files:[valid],requestedGeneration:3,currentGeneration:4
  });
  assert.equal(stale.ok,false);
  assert.match(stale.reason,/último intento/);
  for(const files of [null,undefined,{},[{...valid,name:'../outside.mp4'}],
    [{...valid,bytes:-1}], [valid,{name:'unknown.mp4',bytes:1,durationMs:1}]]) {
    const decision=acceleratedBetaRecoverySnapshot({
      files,requestedGeneration:4,currentGeneration:4
    });
    assert.equal(decision.ok,false,'invalid catalogue must never clear retry gate');
    assert.match(decision.reason,/Catálogo/);
  }
  assert.equal(acceleratedBetaRecoverySnapshot({
    files:[],requestedGeneration:4,currentGeneration:4
  }).ok,true,'a valid EMPTY native catalogue still requires separate gallery review');
});

test('UI invalidates in-flight recovery requests on uncertain finalize and next export',()=>{
  const ui=readFileSync(new URL('../accelerated-qa-export-ui.mjs',import.meta.url),'utf8');
  assert.match(ui,/const snapshot=acceleratedBetaRecoverySnapshot\(/);
  assert.match(ui,/if\(!snapshot.ok\)throw Error\(snapshot.reason\)/);
  assert.match(ui,/requestedGeneration!==recoveryGeneration/);
  assert.match(ui,/pendingRecovery=true;\s*recoveryChecked=false;\s*recoveryGeneration\+\+;/);
  assert.match(ui,/pendingRecovery=false;\s*recoveryChecked=false;\s*recoveryGeneration\+\+;/);
  assert.equal((ui.match(/if\(await listRecovered\(/g)||[]).length,2);
});

function recoveryStorageFixture(){
  const values=new Map();
  return {
    getItem(key){return values.get(key)??null;},
    setItem(key,value){values.set(key,value);},
    removeItem(key){values.delete(key);}
  };
}

test('write-ahead marker survives editor recreation until a confirmed close',()=>{
  const storage=recoveryStorageFixture();
  const first=createAcceleratedRecoveryMarker(storage);
  assert.equal(first.pending(),false);
  assert.equal(first.arm(),true);
  assert.equal(storage.getItem(ACCELERATED_RECOVERY_MARKER_KEY),'1');
  const restarted=createAcceleratedRecoveryMarker(storage);
  assert.equal(restarted.pending(),true);
  assert.equal(acceleratedBetaRepeatGate({
    pendingRecovery:restarted.pending(),recoveryChecked:false,userConfirmed:true
  }).ok,false);
  assert.equal(restarted.clear(),true);
  assert.equal(createAcceleratedRecoveryMarker(storage).pending(),false);
});

test('unavailable, corrupt and silently failing storage never proves a clean exit',()=>{
  const unavailable=createAcceleratedRecoveryMarker(undefined);
  assert.equal(unavailable.pending(),true);
  assert.equal(unavailable.arm(),false);
  assert.equal(unavailable.clear(),false);
  const storage=recoveryStorageFixture();
  storage.setItem(ACCELERATED_RECOVERY_MARKER_KEY,'unexpected version');
  assert.equal(createAcceleratedRecoveryMarker(storage).pending(),true);
  const initialRead=storage.getItem;
  storage.setItem=()=>{};
  const silent=createAcceleratedRecoveryMarker(storage);
  assert.equal(silent.arm(),false);
  storage.getItem=()=>{throw Error('storage denied');};
  assert.equal(silent.pending(),true);
  assert.equal(silent.clear(),false);
  storage.getItem=initialRead;
});

test('failed marker removal retains conservative protection after restart',()=>{
  const storage=recoveryStorageFixture();
  const marker=createAcceleratedRecoveryMarker(storage);
  assert.equal(marker.arm(),true);
  storage.removeItem=()=>{};
  assert.equal(marker.clear(),false);
  assert.equal(createAcceleratedRecoveryMarker(storage).pending(),true);
});

test('UI arms recovery before invoking native and preserves the marker for uncertain replies',()=>{
  const ui=readFileSync(new URL('../accelerated-qa-export-ui.mjs',import.meta.url),'utf8');
  assert.match(ui,/pendingRecovery=recoveryMarker\.pending\(\)/);
  assert.ok(ui.indexOf('if(!recoveryMarker.arm())')<ui.indexOf('const result=await recordOnNative('));
  assert.match(ui,/if\(failure\.recoveryReviewRequired\)\{\s*markRecoveryRequired\(\);\s*\}else if\(!recoveryMarker.clear\(\)\)/);
  assert.match(ui,/returnedFromNative\s*=\s*true/);
  assert.match(ui,/returnedFromNative\s*\?\{code:'WIVRA_ACCELERATED_FINISH_UNCERTAIN'\}/);
  assert.equal((ui.match(/const generation=\+\+recoveryGeneration;/g)||[]).length,2);
  assert.match(ui,/if\(requestedGeneration!==recoveryGeneration\)return false;/);
});

function bootRecoveryUi({storage,listRecovered,recordOnNative,confirm=()=>true,nativeOp=null,
  loudLevel=null,loudnessPlan=undefined,session={project:{revision:1}}}){
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.events={};this.textContent='';
      this.style={};this.classList={add(){}};}
    append(...items){this.children.push(...items);}
    replaceChildren(...items){this.children=[...items];this.textContent='';}
    insertAdjacentElement(_,element){this.children.push(element);}
    setAttribute(){}
    addEventListener(name,fn){this.events[name]=fn;}
  }
  const ids=Object.fromEntries(['sExp','expGo','sSettings'].map(id=>[id,new Element('div')]));
  if(loudLevel!=null)ids.expLoud=Object.assign(new Element('select'),{value:loudLevel});
  const document={
    getElementById:id=>ids[id]??null,
    createElement:tag=>new Element(tag),
    createTextNode:text=>text,
    addEventListener:(name,fn)=>{if(name==='DOMContentLoaded')fn();}
  };
  const source=readFileSync(new URL('../accelerated-qa-export-ui.mjs',import.meta.url),'utf8')
    .replace(/^import .*$/gm,'').replace(/^export /gm,'');
  runInNewContext(source,{
    document,window:{confirm},localStorage:storage,performance:{now:()=>1000},LOUD_LEVELS,
    nativeHost:()=>({platform:'android',request:message=>{
      if(message.op==='listRecovered')return listRecovered();
      if(nativeOp)return nativeOp(message);
      throw Error('unexpected op '+message.op);
    }}),
    recordOnNative,session,media:{},expBusy:false,pzMissing:[],
    ...(loudnessPlan?{loudnessPlan}:{}),
    totalDuration:()=>1
  });
  const find=(node,predicate)=>{
    if(predicate(node))return node;
    for(const child of node.children??[]){
      if(typeof child==='object'&&child!==null){
        const found=find(child,predicate);if(found)return found;
      }
    }
  };
  const fast=find(ids.expGo,node=>node.id==='wivraQaStart');
  const recovery=find(ids.expGo,node=>node.textContent==='Buscar videos acelerados recuperables');
  const settings=find(ids.sSettings,node=>node.textContent==='Recuperar exportaciones aceleradas (QA)');
  return {
    fast:()=>fast.onclick(),search:()=>recovery.onclick(),searchSettings:()=>settings.onclick(),
    statusText:()=>{const queue=[ids.expGo];while(queue.length){const n=queue.shift();
      if(n?.tag==='p'&&/Volumen|volumen|Midiendo|proyecto cambió/.test(n.textContent))return n.textContent;
      for(const c of n?.children??[])if(typeof c==='object'&&c)queue.push(c);}return '';},
    classicBlocked(){
      let blocked=false;
      ids.expGo.events.click({preventDefault(){blocked=true;},stopImmediatePropagation(){blocked=true;}});
      return blocked;
    }
  };
}
const emptyRecovery=async()=>({files:[]});
const successfulNative=async()=>({
  verifiedNative:true,verifiedOnDevice:false,mime:'video/mp4',
  saved:{verified:true,token:5,bytes:300,displayName:'video.mp4'}
});

test('editor boot after an interrupted attempt blocks classic and fast until fresh review',async()=>{
  const storage=recoveryStorageFixture();
  let started=0;
  const first=bootRecoveryUi({storage,listRecovered:emptyRecovery,
    recordOnNative:()=>{started++;return new Promise(()=>{});}});
  void first.fast();
  assert.equal(started,1);
  assert.equal(storage.getItem(ACCELERATED_RECOVERY_MARKER_KEY),'1');
  let restartedCalls=0;
  const restarted=bootRecoveryUi({storage,listRecovered:emptyRecovery,
    recordOnNative:async()=>{restartedCalls++;return successfulNative();}});
  assert.equal(restarted.classicBlocked(),true);
  await restarted.fast();
  assert.equal(restartedCalls,0);
  await restarted.search();
  await restarted.fast();
  assert.equal(restartedCalls,1);
  assert.equal(storage.getItem(ACCELERATED_RECOVERY_MARKER_KEY),null);
});

test('latest recovery request wins across both UI surfaces and stale success cannot clear failure',async()=>{
  const storage=recoveryStorageFixture();
  createAcceleratedRecoveryMarker(storage).arm();
  const requests=[];
  const ui=bootRecoveryUi({storage,recordOnNative:successfulNative,listRecovered:()=>
    new Promise((resolve,reject)=>requests.push({resolve,reject}))});
  const first=ui.search(),second=ui.searchSettings();
  requests[1].reject(Error('latest catalogue unavailable'));
  await second;
  requests[0].resolve({files:[]});
  await first;
  assert.equal(ui.classicBlocked(),true);
  const third=ui.search();
  requests[2].resolve({files:[]});
  await third;
  assert.equal(ui.classicBlocked(),false);
});

test('post-return malformed export stays pending and ordinary preflight refusal clears intent',async()=>{
  const storage=recoveryStorageFixture();
  const broken=bootRecoveryUi({storage,listRecovered:emptyRecovery,
    recordOnNative:async()=>({verifiedNative:false})});
  await broken.fast();
  assert.equal(createAcceleratedRecoveryMarker(storage).pending(),true);
  assert.equal(broken.classicBlocked(),true);
  const otherStorage=recoveryStorageFixture();
  const ordinary=bootRecoveryUi({storage:otherStorage,listRecovered:emptyRecovery,
    recordOnNative:async()=>{throw Error('codec preflight refused');}});
  await ordinary.fast();
  assert.equal(createAcceleratedRecoveryMarker(otherStorage).pending(),false);
  assert.equal(ordinary.classicBlocked(),false);
});

test('if storage cannot record intent the fast exporter never calls the native writer',async()=>{
  const storage=recoveryStorageFixture();
  storage.setItem=()=>{};
  let started=0;
  const ui=bootRecoveryUi({storage,listRecovered:emptyRecovery,
    recordOnNative:async()=>{started++;return successfulNative();}});
  await ui.fast();
  assert.equal(started,0);
  assert.equal(ui.classicBlocked(),true);
  await ui.search();
  assert.equal(ui.classicBlocked(),false);
});

// Native write-ahead intent journal (Android v2 helloRandom). — Claude
test('native intent state is fail-closed only for bridges that advertise the journal',()=>{
  assert.equal(acceleratedNativeIntentState(undefined),'unsupported');
  assert.equal(acceleratedNativeIntentState({protocol:2,randomWrite:true}),'unsupported');
  assert.equal(acceleratedNativeIntentState({exportIntentJournal:'yes',interruptedExport:true}),'unsupported');
  assert.equal(acceleratedNativeIntentState({exportIntentJournal:true,interruptedExport:true}),'interrupted');
  assert.equal(acceleratedNativeIntentState({exportIntentJournal:true,interruptedExport:false}),'clean');
  for(const interruptedExport of [undefined,null,0,1,'false'])
    assert.equal(acceleratedNativeIntentState({exportIntentJournal:true,interruptedExport}),'unknown');
  assert.deepEqual(['unsupported','clean','unavailable','interrupted','unknown']
    .map(acceleratedNativeIntentRequiresReview),[false,false,false,true,true]);
});

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const journalBridge=({interrupted,cleared=true,log=[]})=>message=>{
  log.push(message.op);
  if(message.op==='helloRandom')
    return Promise.resolve({protocol:2,randomWrite:true,exportIntentJournal:true,
      interruptedExport:interrupted});
  if(message.op==='ackInterruptedExport')return Promise.resolve({cleared});
  throw Error('unexpected op '+message.op);
};

test('lost WebView storage still blocks both engines when native kept the intent',async()=>{
  const storage=recoveryStorageFixture(); // empty: localStorage was wiped
  const log=[];
  let started=0;
  const ui=bootRecoveryUi({storage,listRecovered:emptyRecovery,
    nativeOp:journalBridge({interrupted:true,log}),
    recordOnNative:async()=>{started++;return successfulNative();}});
  await tick();
  assert.equal(ui.classicBlocked(),true);
  await ui.fast();
  assert.equal(started,0);
  assert.equal(log.includes('ackInterruptedExport'),false);
  await ui.search();
  await ui.fast();
  assert.equal(started,1);
  await tick();
  assert.deepEqual(log,['helloRandom','ackInterruptedExport']);
});

test('fast export waits for the native intent answer before arming a new export',async()=>{
  const storage=recoveryStorageFixture();
  let answer,started=0;
  const ui=bootRecoveryUi({storage,listRecovered:emptyRecovery,
    nativeOp:message=>{
      if(message.op==='helloRandom')return new Promise(resolve=>{answer=resolve;});
      if(message.op==='ackInterruptedExport')return Promise.resolve({cleared:true});
      throw Error('unexpected op '+message.op);
    },
    recordOnNative:async()=>{started++;return successfulNative();}});
  const pending=ui.fast();
  await tick();
  assert.equal(started,0);
  assert.equal(storage.getItem(ACCELERATED_RECOVERY_MARKER_KEY),null);
  answer({protocol:2,randomWrite:true,exportIntentJournal:true,interruptedExport:true});
  await pending;
  assert.equal(started,0,'interrupted intent requires review first');
  assert.equal(ui.classicBlocked(),true);
});

test('clean native journal and unanswered bridge never block the classic engine',async()=>{
  for(const nativeOp of [journalBridge({interrupted:false}),
    message=>message.op==='helloRandom'?Promise.reject(Error('bridge down')):null,
    message=>message.op==='helloRandom'?Promise.resolve({protocol:2,randomWrite:true}):null]){
    const ui=bootRecoveryUi({storage:recoveryStorageFixture(),listRecovered:emptyRecovery,
      nativeOp,recordOnNative:successfulNative});
    await tick();
    assert.equal(ui.classicBlocked(),false);
  }
});

test('malformed journal reply and failed acknowledgement stay conservative',async()=>{
  const log=[];
  const ui=bootRecoveryUi({storage:recoveryStorageFixture(),listRecovered:emptyRecovery,
    nativeOp:message=>{
      log.push(message.op);
      if(message.op==='helloRandom')
        return Promise.resolve({protocol:2,randomWrite:true,exportIntentJournal:true});
      if(message.op==='ackInterruptedExport')return Promise.reject(Error('io'));
      throw Error('unexpected op '+message.op);
    },recordOnNative:successfulNative});
  await tick();
  assert.equal(ui.classicBlocked(),true);
  await ui.search();
  assert.equal(ui.classicBlocked(),false);
  await tick();
  assert.deepEqual(log,['helloRandom','ackInterruptedExport']);
});

test('Android bridge advertises the journal and the store arms before creating output',()=>{
  const root='../../streaming/android/app/src/main/java/com/oswhgo/wivra/';
  const bridge=readFileSync(new URL(root+'WivraAcceleratedExportBridge.kt',import.meta.url),'utf8');
  const store=readFileSync(new URL(root+'WivraRandomExportStore.kt',import.meta.url),'utf8');
  assert.match(bridge,/"exportIntentJournal", true/);
  assert.match(bridge,/"interruptedExport", WivraRandomExportStore\.interruptedExport\(context\)/);
  assert.match(bridge,/"ackInterruptedExport" -> enqueue/);
  assert.ok(store.indexOf('journal.arm(token)')<store.indexOf('WivraRandomAccessExportSession.create('));
  const finish=store.slice(store.indexOf('fun finish('),store.indexOf('private fun publish('));
  assert.ok(finish.indexOf('publish(context')<finish.indexOf('item.intents.clear(token)'),
    'intent closes only after a verified gallery publication');
  assert.match(store,/item\.session\.abort\(\)\s*\/\/[^\n]*\n\s*item\.intents\.clear\(token\)/);
});

// Measured loudness reaches the accelerated engine like the classic one. — Claude
test('editor loudness levels are measured and forwarded; unknown levels still fail',async()=>{
  assert.equal(acceleratedBetaSettingsGate({loudness:'balanced'}).ok,true);
  assert.equal(acceleratedBetaSettingsGate({loudness:'quiet'}).ok,true);
  assert.equal(acceleratedBetaSettingsGate({loudness:'ebu-r128'}).ok,false);
  assert.equal(acceleratedBetaSettingsGate({loudness:'constructor'}).ok,false);
  const received=[];
  const ui=bootRecoveryUi({storage:recoveryStorageFixture(),listRecovered:emptyRecovery,
    loudLevel:'balanced',
    loudnessPlan:async(_project,level)=>({ok:true,gainDb:level==='balanced'?3.2:0,before:-17.2,after:-14}),
    recordOnNative:async options=>{received.push(options.loudnessGainDb);return successfulNative();}});
  await ui.fast();
  assert.deepEqual(received,[3.2]);
  assert.match(ui.statusText(),/Volumen ajustado \+3\.2 dB \(de -17\.2 a -14 LUFS\)/);
});

test('failed loudness measurement exports the original volume; edits during measuring stop',async()=>{
  const received=[];
  const failing=bootRecoveryUi({storage:recoveryStorageFixture(),listRecovered:emptyRecovery,
    loudLevel:'quiet',loudnessPlan:async()=>{throw Error('decoder');},
    recordOnNative:async options=>{received.push(options.loudnessGainDb);return successfulNative();}});
  await failing.fast();
  assert.deepEqual(received,[0]);
  assert.match(failing.statusText(),/volumen original/);
  const session={project:{revision:1}};
  let started=0;
  const editing=bootRecoveryUi({storage:recoveryStorageFixture(),listRecovered:emptyRecovery,
    loudLevel:'balanced',session,
    loudnessPlan:async()=>{session.project={revision:2};return {ok:true,gainDb:2,before:-16,after:-14};},
    recordOnNative:async()=>{started++;return successfulNative();}});
  await editing.fast();
  assert.equal(started,0);
  assert.match(editing.statusText(),/proyecto cambió/);
});

test('recordProject forwards a finite measured loudness gain to the accelerated route',async()=>{
  const {recordProject}=await import('../export.mjs');
  const old=globalThis.WivraAcceleratedQA;
  let got;
  globalThis.WivraAcceleratedQA={recordOnNative:async args=>{got=args.loudnessGainDb;
    return {experimental:true,verifiedNative:true,verifiedOnDevice:false};}};
  try{
    await recordProject({project:{clips:[],overlayClips:[],audioClips:[],texts:[],format:{}},
      media:{},experimentalAccelerated:true,acceleratedExpectAudio:false,loudnessGainDb:4});
    assert.equal(got,4);
  }finally{globalThis.WivraAcceleratedQA=old;}
});

// Every preflight denial the renderer can raise reaches the person in Spanish,
// keeping the English detail for QA. Spanish bridge messages pass through. — Claude
test('every accelerated preflight denial is explained in Spanish with its technical detail',async()=>{
  const {acceleratedFailureReason}=await import('../accelerated-qa-export-ui.mjs');
  const renderer=readFileSync(new URL('../accelerated-multitrack-renderer.mjs',import.meta.url),'utf8');
  const reasons=[...renderer.matchAll(/deny\('([^']+)'\)/g)].map(m=>m[1]);
  assert.ok(reasons.length>40,'found the renderer denials');
  const generic='El motor rápido no pudo completar este montaje.';
  const specific=[];
  for(const reason of new Set(reasons)){
    const text=acceleratedFailureReason(new Error('Multitrack accelerated preflight: '+reason));
    assert.ok(text.includes('(detalle técnico: '+reason+')'),reason);
    assert.doesNotMatch(text,/^Multitrack/,reason);
    if(!text.startsWith(generic))specific.push(reason);
  }
  assert.ok(specific.length/new Set(reasons).size>0.75,'most denials get a specific explanation');
  for(const spanish of ['El puente acelerado no respondió a tiempo.',
    'Exportación multipista cancelada antes de comenzar.'])
    assert.equal(acceleratedFailureReason(new Error(spanish)),spanish);
  assert.equal(acceleratedFailureReason(new Error('')),'Error desconocido.');
  const ui=readFileSync(new URL('../accelerated-qa-export-ui.mjs',import.meta.url),'utf8');
  assert.match(ui,/'No se completó la exportación acelerada: '\+acceleratedFailureReason\(error\)/);
});
