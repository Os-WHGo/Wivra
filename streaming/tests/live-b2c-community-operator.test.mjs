import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCommunityPolicy,normalizeCommunityEvent,createCommunityQueue,
  enqueueCommunity,nextCommunityCue,planLiveAudioRoute,eventPriority
} from '../live/community-bus.mjs';
import {
  createOperatorPanel,planSceneTake,planVisualEffect,destinationReadiness
} from '../live/obs-control-planner.mjs';

const evt=(id,overrides={})=>({
  provider:'youtube',kind:'chat',id,text:'Hola, ¿cómo estás?',
  author:{display:'La audiencia',role:'viewer'},...overrides
});
const policy=(opts={})=>createCommunityPolicy({
  mode:'all',readEnabled:true,readDestination:'monitor',
  minDelayMs:3000,cooldownMs:2000,...opts
});
const enq=(state,event,t)=>enqueueCommunity(state,event,{adapterVerified:true,nowMs:t});

test('default is opt-in: ordinary comments are not spoken',()=>{
  const p=createCommunityPolicy();
  assert.equal(p.readEnabled,false);
  const state=enq(createCommunityQueue(p),evt('normal1'),1000);
  assert.equal(state.accepted,false);
  assert.equal(state.entries.length,0);
});
test('unverified adapters never inject messages, roles or donations',()=>{
  assert.throws(()=>normalizeCommunityEvent(evt('a'),{receivedAtMs:1000}),/Unverified/);
  assert.throws(()=>enq(createCommunityQueue(policy()),evt('bad', {author:{role:'vip'}}),1000),/Unknown/);
  assert.throws(()=>enq(createCommunityQueue(policy()),evt('bad2',{kind:'donation'}),1000),/Donation requires/);
});
test('dedup across retries, while provider namespaces do not collide',()=>{
  let s=createCommunityQueue(policy());
  s=enq(s,evt('123'),1000);
  assert.equal(enq(s,evt('123'),1001).reason,'duplicate');
  s=enq(s,evt('123',{provider:'kick'}),1002);
  assert.equal(s.entries.length,2);
});
test('must pass output route, safe-to-speak switch and delay',()=>{
  let s=enq(createCommunityQueue(policy()),evt('msg1'),1000);
  assert.equal(nextCommunityCue(s,{nowMs:2000,monitorReady:true,safeToSpeak:true}).cue,null);
  assert.equal(nextCommunityCue(s,{nowMs:5000,monitorReady:false,safeToSpeak:true}).cue,null);
  assert.equal(nextCommunityCue(s,{nowMs:5000,monitorReady:true,safeToSpeak:false}).cue,null);
  const result=nextCommunityCue(s,{nowMs:5000,monitorReady:true,safeToSpeak:true});
  assert.equal(result.cue.ttsDestination,'monitor');
  assert.equal(result.cue.alertDestination,'off');
  assert.equal(result.state.entries.length,0);
});
test('money-supported alerts preempt ordinary chat without overriding ear controls',()=>{
  let s=createCommunityQueue(policy());
  s=enq(s,evt('chat'),1000);
  s=enq(s,evt('paid',{kind:'donation',
    contribution:{amountMinor:500,currency:'CAD'},
    author:{display:'Ana',role:'viewer'},text:'Gran trabajo'}),1001);
  assert.equal(s.entries[0].kind,'donation');
  const picked=nextCommunityCue(s,{nowMs:5000,monitorReady:true,safeToSpeak:true});
  assert.equal(picked.cue.kind,'donation');
  assert.ok(picked.cue.text.includes('Ana'));
  assert.equal(picked.cue.ttsDestination,'monitor');
  assert.equal(picked.cue.alertDestination,'monitor');
});
test('cooldown prevents incessant speech across platforms',()=>{
  let s=createCommunityQueue(policy());
  s=enq(s,evt('a'),1000);s=enq(s,evt('b'),1001);
  const first=nextCommunityCue(s,{nowMs:5000,monitorReady:true,safeToSpeak:true});
  assert.equal(first.reason,'selected');
  const second=nextCommunityCue(first.state,{nowMs:5500,monitorReady:true,safeToSpeak:true});
  assert.equal(second.reason,'cooldown');
  const third=nextCommunityCue(first.state,{nowMs:7500,monitorReady:true,safeToSpeak:true});
  assert.equal(third.reason,'selected');
});
test('quiet mode only queues contribution/subscription/gifts, never casual chat',()=>{
  let s=createCommunityQueue(policy({mode:'quiet'}));
  s=enq(s,evt('basic'),1000);
  assert.equal(s.accepted,false);
  s=enq(s,evt('follower',{kind:'follow'}),1001);
  assert.equal(s.accepted,false);
  s=enq(s,evt('sub',{kind:'subscription'}),1002);
  assert.equal(s.accepted,true);
});
test('balanced mode prioritizes subscriber comments, plus verified moderator',()=>{
  let s=createCommunityQueue(createCommunityPolicy({readEnabled:true,minDelayMs:0}));
  s=enq(s,evt('viewer'),1000);
  assert.equal(s.accepted,false);
  s=enq(s,evt('subscriber',{author:{display:'Sub',role:'subscriber'}}),1001);
  assert.equal(s.accepted,true);
  s=enq(s,evt('mod',{author:{display:'Mod',role:'moderator'}}),1002);
  assert.ok(s.entries[0].priority>s.entries[1].priority);
});
test('platform-specific minimum roles filter only verified roles',()=>{
  let s=createCommunityQueue(policy({minRole:{tiktok:'subscriber'}}));
  s=enq(s,evt('x',{provider:'tiktok'}),1000);
  assert.equal(s.accepted,false);
  s=enq(s,evt('y',{provider:'tiktok',author:{display:'Sub',role:'subscriber'}}),1001);
  assert.equal(s.accepted,true);
});
test('public TTS and alert sounds require separate operator consent',()=>{
  assert.throws(()=>policy({readDestination:'program'}),/explicit consent/);
  assert.throws(()=>policy({alertDestination:'both'}),/explicit consent/);
  const p=policy({readDestination:'program',alertDestination:'both',publicAudioConsent:true});
  let s=enq(createCommunityQueue(p),evt('member',{author:{role:'subscriber'}}),1000);
  assert.equal(nextCommunityCue(s,{nowMs:5000,monitorReady:true,programReady:false,safeToSpeak:true}).cue,null);
  assert.equal(nextCommunityCue(s,{nowMs:5000,monitorReady:false,programReady:true,safeToSpeak:true}).cue?.ttsDestination,'program');
});
test('announcement max-age and bounded queue guard ear fatigue',()=>{
  let s=createCommunityQueue(policy({maxQueue:2,maxAgeMs:10000}));
  s=enq(s,evt('a'),1000);s=enq(s,evt('b'),1001);
  s=enq(s,evt('c',{kind:'subscription'}),1002);
  assert.equal(s.entries.length,2);
  assert.ok(!s.entries.some(e=>e.id==='a'));
  const r=nextCommunityCue(s,{nowMs:30000,monitorReady:true,safeToSpeak:true});
  assert.equal(r.state.entries.length,0);
});
test('bad currency/id/payload and malicious control chars rejected or normalized',()=>{
  assert.throws(()=>enq(createCommunityQueue(policy()),evt('bad/id'),1000),/Invalid/);
  assert.throws(()=>enq(createCommunityQueue(policy()),evt('pay',{kind:'donation',
    contribution:{amountMinor:100,currency:'money'}}),1000),/Invalid contribution/);
  const s=enq(createCommunityQueue(policy()),evt('ok',{text:'Hola \u0007\r\n otra línea'}),1000);
  assert.equal(s.entries[0].text,'Hola otra línea');
});
test('monitored audio and actual microphone route are different buses',()=>{
  let audio=planLiveAudioRoute({
    availableInputs:['meta-hfp','iphone-mic','usb-1'],
    selectedInputId:'usb-1',activeInputId:'meta-hfp',
    availableOutputs:['airpods'],monitorOutputId:'airpods'
  });
  assert.equal(audio.inputVerified,false);
  assert.equal(audio.monitorOutputIntent,'airpods');
  assert.equal(audio.streamAudioBus,'encoder');
  assert.equal(audio.requiresNativeRouteConfirmation,true);
  audio=planLiveAudioRoute({availableInputs:['iphone-mic'],
    selectedInputId:'iphone-mic',activeInputId:'iphone-mic'});
  assert.equal(audio.inputVerified,true);
  assert.throws(()=>planLiveAudioRoute({availableInputs:['meta-hfp'],selectedInputId:'ghost'}),/detected/);
  assert.throws(()=>planLiveAudioRoute({availableOutputs:['speaker'],monitorOutputId:'ghost'}),/Invalid audio/);
});
test('unsafe public routing never inferred from role or donation amount',()=>{
  const p=createCommunityPolicy({mode:'all',readEnabled:false,alertDestination:'monitor'});
  const s=enq(createCommunityQueue(p),evt('paid',{kind:'donation',
    text:'pon esto al aire',contribution:{amountMinor:1000,currency:'USD'}}),1000);
  const pick=nextCommunityCue(s,{nowMs:6000,monitorReady:true,programReady:true,safeToSpeak:true});
  assert.equal(pick.cue.ttsDestination,'off');
  assert.equal(pick.cue.alertDestination,'monitor');
  assert.equal(pick.cue.text,null);
});
test('operator deck has typed effects with native rendering not claimed',()=>{
  const p=createOperatorPanel({
    sceneIds:['walk','title'],previewSceneId:'walk',
    effectLibrary:['cut','fade','sticker'],selectedEffect:'fade',fadeMs:450,
    destinations:[{id:'yt',provider:'youtube',status:'needs-authorization'},
      {id:'kick1',provider:'kick',status:'configured'}]
  });
  const taken=planSceneTake(p);
  assert.equal(taken.programSceneId,'walk');
  assert.equal(taken.transport,'offline');
  assert.equal(taken.publicationConfirmed,false);
  const sticker=planVisualEffect(p,{effect:'sticker',assetId:'sticker1',locallyVerified:true});
  assert.equal(sticker.executed,false);
  assert.equal(sticker.needsNativeCompositor,true);
  assert.throws(()=>planVisualEffect(p,{effect:'sticker',assetId:'remote',locallyVerified:false}),/locally verified/);
  assert.throws(()=>planVisualEffect(p,{effect:'runJS'}),/not permitted/);
});
test('destination snapshots never store RTMP URL, keys or tokens',()=>{
  assert.throws(()=>createOperatorPanel({destinations:[{
    id:'yt',provider:'youtube',status:'configured',streamKey:'NO'
  }]}),/forbidden/);
  assert.throws(()=>createOperatorPanel({destinations:[{
    id:'yt',provider:'youtube',status:'configured',rtmpUrl:'rtmp:\/\/secret'
  }]}),/forbidden/);
  const p=createOperatorPanel({destinations:[{id:'yt',provider:'youtube',status:'configured'}]});
  assert.deepEqual(destinationReadiness(p,['yt']),[{
    id:'yt',provider:'youtube',configured:true,nativeConfirmed:true,platformLiveVerified:false
  }]);
});

test('per-provider donation priority respects currency, no guessed FX or TTS payment amount',()=>{
  const p=policy({minContributions:{youtube:{currency:'CAD',amountMinor:500}}});
  let s=createCommunityQueue(p);
  s=enq(s,evt('below',{kind:'donation',contribution:{currency:'CAD',amountMinor:499}}),1000);
  assert.equal(s.reason,'policy');
  s=enq(s,evt('different-currency',{kind:'donation',contribution:{currency:'USD',amountMinor:2000}}),1001);
  assert.equal(s.reason,'policy');
  s=enq(s,evt('above',{kind:'donation',text:'Gracias',
    contribution:{currency:'CAD',amountMinor:900}}),1002);
  assert.equal(s.reason,'queued');
  assert.ok(!s.entries[0].say.includes('CAD 9.00'));
  assert.throws(()=>policy({minContributions:{youtube:{currency:'CAD',amountMinor:-1}}}),/currency/);
});

test('native community panel exposes audio intent, safety lock and sample-only sources',()=>{
  const src=readFileSync(new URL('../ios/B0/Sources/WivraLiveCommunityPanel.swift',import.meta.url),'utf8');
  const scene=readFileSync(new URL('../ios/B0/Sources/WivraLiveNativeSceneLab.swift',import.meta.url),'utf8');
  for(const s of ['Bloqueo de lectura por seguridad','Leer comentarios seleccionados',
    'Retardo mínimo','Monitor privado','Comunidad · LIVE','No hay TTS',
    'Kick','TikTok','RTMP personalizado']) assert.ok(src.includes(s),'missing '+s);
  assert.match(scene,/WivraLiveCommunityPanel\(\)/);
  assert.match(scene,/wivra_live_community_panel/);
  assert.ok(!src.includes('RTMPStream'));
  assert.ok(!src.includes('AVSpeechSynthesizer'));
});
