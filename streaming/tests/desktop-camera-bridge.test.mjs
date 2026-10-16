import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDesktopBridgePlan,desktopBridgeCapabilities,DesktopBridgeSession
} from '../desktop-camera-bridge.mjs';

const verifiedDual=()=>({
  raybanFramesVerified:true,phoneFramesVerified:true,dualFramesVerified:true
});
const approvedPair=()=>({
  phoneUserApproved:true,desktopUserApproved:true,
  authenticatedEncryptedPeerVerified:true
});
const nativeFeed=()=>({
  userEnabled:true,nativeCameraPermissionVerified:true,nativeFramesObserved:true
});
function connected(plan){
  const bridge=new DesktopBridgeSession(plan);
  bridge.confirmPairing(approvedPair());
  bridge.confirmTransport({nativeLANMediaChannelVerified:true});
  return bridge;
}

test('desktop is a future adapter target, not a falsely implemented app',()=>{
  const c=desktopBridgeCapabilities();
  assert.deepEqual(c.phonePlatforms,['ios','android']);
  assert.deepEqual(c.desktopPlatforms,['windows','macos','linux']);
  assert.deepEqual(c.sources,['rayban-pov','phone-camera']);
  assert.equal(c.nativeDualCaptureImplemented,false);
  assert.equal(c.nativeDesktopReceiverImplemented,false);
  assert.equal(c.nativeLANPublisherImplemented,false);
  assert.equal(c.encryptedPairingImplemented,false);
  assert.equal(c.rayBanPCSDKAvailable,false);
});

test('both independent streams can be represented for each mobile and desktop OS',()=>{
  for(const phonePlatform of ['ios','android']){
    for(const desktopPlatform of ['windows','macos','linux']){
      const plan=createDesktopBridgePlan({phonePlatform,desktopPlatform,
        nativeEvidence:verifiedDual()});
      assert.deepEqual(plan.sourceIDs,['rayban-pov','phone-camera']);
      assert.equal(plan.dualCaptureEligible,true);
      assert.equal(plan.desktopBridgeLive,false);
      assert.equal(plan.transportImplemented,false);
      assert.equal(plan.publisherConnected,false);
      const b=connected(plan);
      b.confirmSourceFrames('rayban-pov',nativeFeed());
      b.confirmSourceFrames('phone-camera',nativeFeed());
      assert.deepEqual(b.snapshot.activeSourceIDs,['rayban-pov','phone-camera']);
      const picture=b.proposeScene();
      assert.equal(picture.effectiveLayout,'picture-in-picture');
      assert.deepEqual(picture.visibleSourceIDs,['rayban-pov','phone-camera']);
      assert.equal(picture.liveStarted,false);
      assert.equal(picture.videoMixed,false);
    }
  }
});

test('current iOS/Android code is not advertised as verified dual hardware',()=>{
  const plan=createDesktopBridgePlan();
  assert.equal(plan.dualCaptureEligible,false);
  assert.ok(plan.warnings.some(text=>text.includes('closes one camera')));
  assert.ok(plan.warnings.some(text=>text.includes('Android Meta receiver')));
  const b=connected(plan);
  b.confirmSourceFrames('rayban-pov',nativeFeed());
  assert.throws(()=>b.confirmSourceFrames('phone-camera',nativeFeed()),
    /physical dual-camera verification/);
  assert.deepEqual(b.snapshot.activeSourceIDs,['rayban-pov']);
  assert.deepEqual(b.proposeScene().visibleSourceIDs,['rayban-pov']);
  assert.equal(b.proposeScene().effectiveLayout,'single-camera');
  assert.equal(b.proposeScene().fallbackUsed,true);
});

test('desktop pairing is not allowed without explicit approval and encryption',()=>{
  const b=new DesktopBridgeSession(createDesktopBridgePlan());
  assert.throws(()=>b.confirmTransport({nativeLANMediaChannelVerified:true}),/paired/);
  assert.throws(()=>b.confirmPairing({phoneUserApproved:true,
    desktopUserApproved:true}),/authenticated encrypted/);
  assert.throws(()=>b.confirmPairing({phoneUserApproved:true,
    authenticatedEncryptedPeerVerified:true}),/Both users/);
  assert.equal(b.state,'unpaired');
  b.confirmPairing(approvedPair());
  assert.throws(()=>b.confirmTransport(),/verified native media channel/);
  b.confirmTransport({nativeLANMediaChannelVerified:true});
  assert.equal(b.state,'connected');
  assert.equal(b.snapshot.transportMediaVerified,false);
});

test('starting sources requires user enablement, actual camera permission and frames',()=>{
  const b=connected(createDesktopBridgePlan({
    sources:['phone-camera'],phonePlatform:'android'
  }));
  assert.throws(()=>b.confirmSourceFrames('phone-camera'),/explicit user/);
  assert.throws(()=>b.confirmSourceFrames('rayban-pov',nativeFeed()),/not present/);
  assert.throws(()=>b.confirmSourceFrames('phone-camera',{
    ...nativeFeed(),nativeCameraPermissionVerified:false
  }),/permission/);
  assert.throws(()=>b.confirmSourceFrames('phone-camera',{
    ...nativeFeed(),nativeFramesObserved:false
  }),/real frames/);
  b.confirmSourceFrames('phone-camera',nativeFeed());
  assert.equal(b.proposeScene('phone').effectiveLayout,'phone');
  assert.equal(b.proposeScene('pov').effectiveLayout,'no-video');
});

test('losing POV never stops the independently active phone camera',()=>{
  const b=connected(createDesktopBridgePlan({nativeEvidence:verifiedDual()}));
  b.confirmSourceFrames('rayban-pov',nativeFeed());
  b.confirmSourceFrames('phone-camera',nativeFeed());
  b.nativeSourceInterrupted('rayban-pov');
  assert.equal(b.snapshot.sources['rayban-pov'],'interrupted');
  assert.equal(b.snapshot.sources['phone-camera'],'active');
  assert.deepEqual(b.proposeScene().visibleSourceIDs,['phone-camera']);
  assert.equal(b.proposeScene().effectiveLayout,'single-camera');
  assert.throws(()=>b.stopSource('phone-camera'),/explicit user/);
  b.stopSource('phone-camera',{userRequested:true});
  assert.deepEqual(b.snapshot.activeSourceIDs,[]);
  b.disconnect();
  assert.equal(b.state,'stopped');
  assert.throws(()=>b.confirmSourceFrames('phone-camera',nativeFeed()),/connected/);
});

test('prevent tokens, unknown transports, duplicate camera IDs and fabricated dual evidence',()=>{
  assert.throws(()=>createDesktopBridgePlan({sources:['rayban-pov','rayban-pov']}),/unique/);
  assert.throws(()=>createDesktopBridgePlan({sources:['pc-webcam']}),/approved/);
  assert.throws(()=>createDesktopBridgePlan({transport:'raw-rtmp'}),/No real bridge/);
  assert.throws(()=>createDesktopBridgePlan({nativeEvidence:{
    dualFramesVerified:true
  }}),/without both physical feeds/);
  assert.throws(()=>createDesktopBridgePlan({nativeEvidence:{
    raybanFramesVerified:true,phoneFramesVerified:true,dualFramesVerified:true,
    streamKey:'sensitive'
  }}),/sensitive fields/);
  assert.throws(()=>createDesktopBridgePlan({nativeEvidence:{
    raybanFramesVerified:'yes'
  }}),/boolean/);
  assert.throws(()=>createDesktopBridgePlan({phonePlatform:'desktop'}),/phone platform/);
  assert.throws(()=>createDesktopBridgePlan({desktopPlatform:'ios'}),/desktop platform/);
});

test('scene proposal stays a non-rendered plan with explicit no-video fallback',()=>{
  const b=new DesktopBridgeSession(createDesktopBridgePlan());
  const scene=b.proposeScene('picture-in-picture');
  assert.deepEqual(scene.visibleSourceIDs,[]);
  assert.equal(scene.effectiveLayout,'no-video');
  assert.equal(scene.liveStarted,false);
  assert.throws(()=>b.proposeScene('overlay-secret-camera'),/Unsupported/);
  assert.throws(()=>scene.visibleSourceIDs.push('rayban-pov'),TypeError);
});
