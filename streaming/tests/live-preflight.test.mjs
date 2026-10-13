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
 assert.ok(Math.abs(two.phoneUplinkGB - one.singleStreamGB*2) < 0.003, 'Expected approx. 2x with rounding');
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


// DAT 0.8 introduced Wi-Fi high-bandwidth link. SDK 1.0 link selection/entitlements
// still require native tests; never treat Wi-Fi import as public RTMP streaming.
test('Wi-Fi camera link warns about displaced infrastructure Wi-Fi',()=>{
 const plan=createPreflight({
   sourceMode:'meta-ios',cameraLink:'wifi-softap',phoneUplink:'cellular',
   destinations:[d()],fps:30,resolution:'high'
 });
 assert.equal(plan.cameraLink,'wifi-softap');
 assert.equal(plan.sourceRequested.width,720);
 assert.ok(plan.warnings.some(x=>x.includes('displace normal Wi-Fi')));
 assert.ok(plan.warnings.some(x=>x.includes('BTC for live')));
 assert.equal(plan.liveReady,false);
});
test('Wi-Fi camera+normal Wi-Fi as internet uplink cannot be assumed',()=>{
 const plan=createPreflight({
  sourceMode:'meta-ios',cameraLink:'wifi-softap',phoneUplink:'existing-wifi',
  destinations:[d()]
 });
 assert.ok(plan.warnings.some(x=>x.includes('must NOT proceed as ready')));
});
test('Bluetooth camera and normal Wi-Fi internet can be selected as a plan',()=>{
 const plan=createPreflight({
  sourceMode:'meta-ios',cameraLink:'bluetooth-classic',phoneUplink:'existing-wifi',
  destinations:[d()]
 });
 assert.equal(plan.cameraLink,'bluetooth-classic');
 assert.ok(plan.warnings.some(x=>x.includes('preserves the normal phone Wi-Fi internet')));
});
test('camera transport is source-specific and cannot claim unverified Meta Wi-Fi link on phone camera',()=>{
 assert.throws(()=>createPreflight({sourceMode:'phone-camera',cameraLink:'wifi-softap',destinations:[d()]}),/Phone camera/);
 assert.throws(()=>createPreflight({sourceMode:'meta-ios',cameraLink:'phone-camera',destinations:[d()]}),/Camera link/);
});
