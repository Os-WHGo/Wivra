import test from 'node:test';
import assert from 'node:assert/strict';
import {getCapabilities,createPreflight,estimateTransfer,LiveSession} from '../live-preflight.mjs';
const d=(platform='twitch',credential='cred-twitch-test1')=>
 ({platform,secureCredentialId:credential,eligibilityConfirmed:true});
test('DAT-specific limits reflect Meta SDK documented profile',()=>{
 const c=getCapabilities();
 assert.equal(c.metaStreamingSizes.high.width,720);
 assert.equal(c.metaStreamingSizes.high.height,1280);
 assert.deepEqual(c.frameRates,[2,7,15,24,30]);
 assert.equal(c.experimentalPcmAudioNotForProduction,true);
});
test('single destination plan is truthful, no encoder/video connection claims',()=>{
 const p=createPreflight({destinations:[d()],audioPath:'glasses-bluetooth-hfp'});
 assert.equal(p.sourceRequested.codec,'hevc');
 assert.equal(p.publisherCodec,'h264');
 assert.equal(p.archivalCodec,'hevc-passthrough-if-compressed-DAT-sample');
 assert.equal(p.liveReady,false);assert.equal(p.verifiedHardware,false);
 assert.ok(p.warnings.some(w=>w.includes('not a real Meta connection')));
});
test('reject fake account eligibility and keys embedded into public preflight',()=>{
 assert.throws(()=>createPreflight({destinations:[{...d(),eligibilityConfirmed:false}]}),/eligibility/);
 assert.throws(()=>createPreflight({destinations:[{...d(),streamKey:'SECRET'}]}),/No private/);
 assert.throws(()=>createPreflight({destinations:[{...d(),url:'rtmps:\/\/example.com'}]}),/No private/);
 assert.throws(()=>createPreflight({destinations:[{...d(),secureCredentialId:'my-stream-key-123'}]}),/opaque/);
});
test('multistream requires relay or multiple direct phone uploads',()=>{
 assert.throws(()=>createPreflight({destinations:[d(),d('youtube','cred-youtube-key9')]}),/Single ingest/);
 const relay=createPreflight({destinations:[d(),d('youtube','cred-youtube-key9')],forwarding:'relay'});
 assert.equal(relay.destinations.length,2);assert.equal(relay.forwarding,'relay');
 assert.ok(relay.warnings.some(w=>w.includes('not guaranteed free')));
});
test('estimate clearly shows two direct streams cost roughly twice one',()=>{
 const one=estimateTransfer({minutes:60,videoKbps:2500,audioKbps:128,streams:1});
 const two=estimateTransfer({minutes:60,videoKbps:2500,audioKbps:128,streams:2});
 assert.equal(two.phoneUplinkGB,Math.round(one.singleStreamGB*2*1000)/1000);
 assert.ok(one.note.includes('not measured'));
});
test('cannot claim preview or LIVE by software alone',()=>{
 const s=new LiveSession();const p=createPreflight({destinations:[d()]});
 assert.throws(()=>s.connectGlasses(),/real native/);
 s.connectGlasses({nativeConnectionVerified:true});
 assert.throws(()=>s.beginPreview(),/real decoded/);
 s.beginPreview({nativeFramesObserved:true});
 assert.throws(()=>s.ready({plan:p,recorderPrepared:true}),/Publisher/);
 s.ready({plan:p,recorderPrepared:true,encodedAudioVideoValidated:true});
 assert.throws(()=>s.startLive({explicitHumanPress:false,nativePublisherConnected:true}),/human/);
 assert.throws(()=>s.startLive({explicitHumanPress:true}),/publisher/);
 s.startLive({explicitHumanPress:true,nativePublisherConnected:true});
 assert.equal(s.state,'live');
 assert.equal(s.savedFile,null);
});
test('recording is not marked saved unless an actual local artifact verified',()=>{
 const s=new LiveSession();const p=createPreflight({destinations:[d()]});
 s.connectGlasses({nativeConnectionVerified:true});
 s.beginPreview({nativeFramesObserved:true});
 s.ready({plan:p,recorderPrepared:true,encodedAudioVideoValidated:true});
 s.startLive({explicitHumanPress:true,nativePublisherConnected:true});
 s.requestStop({humanRequested:true});
 assert.throws(()=>s.finishRecording({storageVerified:false,bytesWritten:123,localAssetId:'local-12345'}),/verified local/);
 assert.equal(s.state,'stopping');
 s.finishRecording({storageVerified:true,bytesWritten:1024,localAssetId:'local-12345'});
 assert.deepEqual(s.savedFile,{localAssetId:'local-12345',bytesWritten:1024});
 s.reset();assert.equal(s.state,'idle');assert.equal(s.savedFile,null);
});
test('failed recordings never become saved',()=>{
 const s=new LiveSession();const p=createPreflight({destinations:[d()]});
 s.connectGlasses({nativeConnectionVerified:true});
 s.beginPreview({nativeFramesObserved:true});
 s.ready({plan:p,recorderPrepared:true,encodedAudioVideoValidated:true});
 s.startLive({explicitHumanPress:true,nativePublisherConnected:true});
 s.requestStop({humanRequested:true});
 s.failRecording();assert.equal(s.state,'recording_failed');assert.equal(s.savedFile,null);
});
