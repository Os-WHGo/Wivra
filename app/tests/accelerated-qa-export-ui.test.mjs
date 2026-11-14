import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  acceleratedBetaFailureDisposition, acceleratedBetaRepeatGate,
  acceleratedBetaSettingsGate
} from '../accelerated-qa-export-ui.mjs';
import {createAcceleratedNativeSink} from '../accelerated-native-sink.mjs';

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
  assert.match(ui,/if\(!approveAnotherExport\(\)\)return;/);
  assert.match(ui,/if\(await listRecovered\(recovered\)\)recoveryChecked=true/);
  assert.match(ui,/if\(await listRecovered\(settingsResult\)\)recoveryChecked=true/);
  assert.match(ui,/if\(failure\.recoveryReviewRequired\)/);
  assert.match(ui,/event\.stopImmediatePropagation\(\)/);
});
