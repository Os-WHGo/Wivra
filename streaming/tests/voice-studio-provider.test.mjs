import test from 'node:test';
import assert from 'node:assert/strict';
import {
  voiceStudioAdapterCapabilities,
  createVoiceStudioNarrationPlan,
  requestVoiceStudioNarration
} from '../voice-studio-provider.mjs';

const wav=()=>Uint8Array.from([82,73,70,70,36,0,0,0,87,65,86,69,102,109,116,32]);
const agreed=()=>({
  platform:'ios',
  backendUrl:'https://trusted-voice.example',
  apiKey:'server-private-key-value',
  text:'Narración de prueba para Wivra.',
  model:'tts-1',
  voice:'alloy',
  userApproved:true,
  requestedByUser:true,
  voiceUseAuthorized:true,
  modelLicenseReviewed:true
});
const response=(bytes=wav(),mime='audio/wav')=>({
  ok:true,
  headers:{get(k){return k==='content-type'?mime:null}},
  arrayBuffer:async()=>bytes.buffer
});

test('mobile audio adapter distinguishes a real HTTPS API client from engine and UI',()=>{
  const c=voiceStudioAdapterCapabilities();
  assert.deepEqual(c.supportedWorkflows,['text-to-speech']);
  assert.equal(c.installedVoiceStudioEngine,false);
  assert.equal(c.nativeMobileUIConnected,false);
  assert.equal(c.generatedAudioImportedToWivra,false);
  assert.equal(c.voiceCloningImplemented,false);
  assert.equal(c.transcriptionImplemented,false);
  assert.equal(c.publishesLiveAudio,false);
  assert.throws(()=>c.supportedWorkflows.push('clone'),TypeError);
});

test('non-sensitive planning on both phones, never uploading text or keys',()=>{
  for(const platform of ['ios','android']){
    const plan=createVoiceStudioNarrationPlan({platform,textLength:33});
    assert.equal(plan.changesTimeline,false);
    assert.equal(plan.capturesOriginalAudio,false);
    assert.equal(plan.requiresPerRequestApproval,true);
    assert.equal(plan.readyToImport,false);
    assert.doesNotMatch(JSON.stringify(plan),/server-private-key-value|Narración|trusted-voice.example/);
  }
});

test('actual one-shot HTTPS TTS sends approved text only and returns in-memory WAV',async()=>{
  let called=0;
  const opts=agreed();
  const apiKey=opts.apiKey;
  const result=await requestVoiceStudioNarration(opts,{fetchImpl:async(url,init)=>{
    called++;
    assert.equal(url,'https://trusted-voice.example/v1/audio/speech');
    assert.equal(init.method,'POST');
    assert.equal(init.redirect,'error');
    assert.equal(init.cache,'no-store');
    assert.equal(init.credentials,'omit');
    assert.equal(init.headers.Authorization,'Bearer '+apiKey);
    assert.deepEqual(JSON.parse(init.body),{
      model:'tts-1',voice:'alloy',input:opts.text,response_format:'wav'
    });
    return response();
  }});
  assert.equal(called,1);
  assert.equal(result.data.length,16);
  assert.equal(result.savedToDisk,false);
  assert.equal(result.importedToEditor,false);
  assert.equal(result.liveAudioUsed,false);
  assert.doesNotMatch(JSON.stringify({...result,data:null}),/server-private-key-value/);
});

test('missing consent, request, model terms or voice authorization makes ZERO network calls',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;return response()};
  for(const key of ['requestedByUser','userApproved','voiceUseAuthorized','modelLicenseReviewed']){
    await assert.rejects(
      requestVoiceStudioNarration({...agreed(),[key]:false},{fetchImpl}),
      /requires user request/
    );
  }
  assert.equal(calls,0);
});

test('never accept HTTP LAN or endpoint including password, search or private path',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;return response()};
  for(const backendUrl of [
    'http://192.168.1.50:3900',
    'http://localhost:3900',
    'https://user:password@example.com',
    'https://api.example.com/other',
    'https://api.example.com?token=key',
    'ftp://api.example.com',
    'https://api.example.com#fragment'
  ]){
    await assert.rejects(requestVoiceStudioNarration({
      ...agreed(),backendUrl
    },{fetchImpl}),/HTTPS server|clean HTTPS/);
  }
  assert.equal(calls,0);
});

test('reject invalid values prior to any call, do not leak private audio contents',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;return response()};
  for(const opts of [
    {text:' '},{text:'x'.repeat(4001)},{voice:'alloy?leak'},{model:''},
    {apiKey:'short'},{platform:'desktop'}
  ]){
    await assert.rejects(requestVoiceStudioNarration({...agreed(),...opts},{fetchImpl}));
  }
  assert.equal(calls,0);
});

test('fail closed when server errors, MIME does not match WAV, or WAV signature invalid',async()=>{
  await assert.rejects(requestVoiceStudioNarration(agreed(),{
    fetchImpl:async()=>({ok:false,status:401})
  }),/server rejected/);
  await assert.rejects(requestVoiceStudioNarration(agreed(),{
    fetchImpl:async()=>response(wav(),'application/json')
  }),/not confirmed WAV/);
  await assert.rejects(requestVoiceStudioNarration(agreed(),{
    fetchImpl:async()=>response(new Uint8Array([1,2,3,4]))
  }),/invalid WAV signature/);
});

test('oversize response refuses memory buffering (header and chunking)',async()=>{
  await assert.rejects(requestVoiceStudioNarration(agreed(),{
    fetchImpl:async()=>({
      ok:true,
      headers:{get:k=>k==='content-type'?'audio/wav':
        k==='content-length'?'999999999':null}
    })
  }),/exceeds size limit/);
  let cancelled=false;
  await assert.rejects(requestVoiceStudioNarration(agreed(),{
    fetchImpl:async()=>({
      ok:true,
      headers:{get:k=>k==='content-type'?'audio/wav':null},
      body:{getReader(){let delivered=false;return{
        async read(){if(delivered)return {done:true};delivered=true;
          return {done:false,value:new Uint8Array(16*1024*1024+1)}},
        async cancel(){cancelled=true}
      }}}
    })
  }),/exceeds size limit/);
  assert.equal(cancelled,true);
});

test('network failures do not reveal token, text or backend URL',async()=>{
  const request=agreed();
  await assert.rejects(requestVoiceStudioNarration(request,{
    fetchImpl:async()=>{throw new Error('Secret leaked '+request.apiKey+' '+request.text)}
  }),err=>{
    assert.doesNotMatch(err.message,/server-private-key-value|Narración|trusted-voice.example/);
    assert.match(err.message,/could not be completed/);
    return true;
  });
});
