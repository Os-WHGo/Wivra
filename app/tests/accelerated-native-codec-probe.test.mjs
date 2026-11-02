import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileCodecConfig,verifyAcceleratedMobileCodecSupport as verify}
 from '../accelerated-native-codec-probe.mjs';

const mp4={container:'mp4',videoCodec:'avc',audioCodec:'aac',hasAudio:true};
const webm={container:'webm',videoCodec:'vp9',audioCodec:'opus',hasAudio:true};
const video={isConfigSupported:async c=>({supported:true,config:c})};
const audio={isConfigSupported:async c=>({supported:true,config:c})};
const input=(codec=mp4,override={})=>({platform:'ios',codec,
 width:1280,height:720,fps:30,sampleRate:48000,
 videoEncoder:video,audioEncoder:audio,...override});

test('real mobile AVC/AAC capability uses exact output resolution, framerate, stereo and 48kHz',async()=>{
 const checks=[];
 const result=await verify(input(mp4,{
  videoEncoder:{isConfigSupported:async c=>{
   checks.push(['video',c]);return {supported:true};}},
  audioEncoder:{isConfigSupported:async c=>{
   checks.push(['audio',c]);return {supported:true};}}
 }));
 assert.equal(result.container,'mp4');
 assert.equal(result.audioChecked,true);
 assert.deepEqual(checks.map(x=>x[0]),['video','audio']);
 assert.equal(checks[0][1].codec,'avc1.42E01F');
 assert.equal(checks[0][1].width,1280);
 assert.equal(checks[0][1].height,720);
 assert.equal(checks[0][1].framerate,30);
 assert.equal(checks[1][1].codec,'mp4a.40.2');
 assert.equal(checks[1][1].sampleRate,48000);
 assert.equal(checks[1][1].numberOfChannels,2);
});

test('mobile codec profile scales to full HD and 4K, not 720p AVC level',()=>{
 assert.equal(mobileCodecConfig({codec:mp4,width:1920,height:1080,
  fps:60,sampleRate:48000}).video.codec,'avc1.64002A');
 assert.equal(mobileCodecConfig({codec:mp4,width:3840,height:2160,
  fps:30,sampleRate:48000}).video.codec,'avc1.640034');
});

test('unsupported real mobile encoder cannot be overridden by optimistic Mediabunny codec family',async()=>{
 for(const overrides of [
  {videoEncoder:null},
  {videoEncoder:{isConfigSupported:async()=>({supported:false})}},
  {videoEncoder:{isConfigSupported:async()=>{throw Error('HW unavailable');}}},
  {audioEncoder:null},
  {audioEncoder:{isConfigSupported:async()=>({supported:false})}},
  {audioEncoder:{isConfigSupported:async()=>{throw Error('AAC unavailable');}}}
 ]) await assert.rejects(verify(input(mp4,overrides)),/Preflight WebCodecs móvil/);
});

test('iOS rejects VP9/Opus WebM before probing encoders or opening a file',async()=>{
 let called=0;
 await assert.rejects(verify(input(webm,{
  videoEncoder:{isConfigSupported:async()=>{called++;return {supported:true};}}
 })),/iOS exige MP4/);
 assert.equal(called,0);
});

test('Android checks actual VP9 Opus WebM configuration rather than mislabeling it as MP4',async()=>{
 const p=await verify(input(webm,{platform:'android'}));
 assert.equal(p.container,'webm');
 assert.equal(p.audioCodec,'opus');
 assert.equal(mobileCodecConfig({codec:webm,width:1280,height:720,
  fps:30,sampleRate:48000}).audio.codec,'opus');
});

test('no-audio timeline never requires AAC and forbids incoherent codec descriptions',async()=>{
 let audioCalls=0;
 const mute={...mp4,audioCodec:null,hasAudio:false};
 const res=await verify(input(mute,{audioEncoder:{
  isConfigSupported:async()=>{audioCalls++;return {supported:false};}
 }}));
 assert.equal(res.audioChecked,false);
 assert.equal(audioCalls,0);
 for(const bad of [
  {...mp4,container:'webm'},
  {...mp4,videoCodec:'vp9'},
  {...mp4,audioCodec:'opus'},
  {...mute,audioCodec:'aac'}
 ]) assert.throws(()=>mobileCodecConfig({codec:bad,width:640,
  height:360,fps:30,sampleRate:48000}),/inconsistente/);
});
