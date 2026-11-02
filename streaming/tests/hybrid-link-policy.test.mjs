import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateHybridLink,suggestPublisherQuality} from '../hybrid-link-policy.mjs';
const capture=(fps=24)=>({
 sdkSupported:true,probeVerified:true,linkReady:true,observedFps:fps,
 packetLossPercent:0.7,largestFrameGapMs:160
});
const net=(mbps=6,route='cellular')=>({testVerified:true,stable:true,measuredUploadMbps:mbps,route});
const source={bluetooth: 'bluetooth-classic',wifi: 'wifi-softap'};
const candidate={
 nativeBuildAvailableLinks:[source.bluetooth,source.wifi],
 measuredCapture:{[source.bluetooth]:capture(24),[source.wifi]:capture(30)},
 measuredInternet:{cellular:net(6),['existing-wifi']:net(10,'existing-wifi')},
 device:{cellularAllowed:true}
};
test('does not select transport unless a signed/native build proves it works',()=>{
 const out=evaluateHybridLink({...candidate,nativeBuildAvailableLinks:[]});
 assert.equal(out.preferredLink,null);assert.equal(out.canBeginNewLive,false);
});
test('Wi-Fi high-bandwidth link may be selected only with a permitted measured cellular uplink',()=>{
 const x=evaluateHybridLink({...candidate,nativeBuildAvailableLinks:[source.wifi],
   measuredInternet:{cellular:net(6)},
   device:{cellularAllowed:true}});
 assert.equal(x.preferredLink,source.wifi);
 assert.equal(x.preferredUplink,'cellular');
 assert.equal(x.preferredMediaProfile,'high');
 assert.equal(x.canBeginNewLive,true);
 assert.equal(x.canSwitchTransportAtRuntime,false);
 assert.equal(x.canBondTransportLinks,false);
});
test('Wi-Fi softAP is rejected without cellular authorization or when cellular route weak',()=>{
 const denied=evaluateHybridLink({...candidate,nativeBuildAvailableLinks:[source.wifi],
   device:{cellularAllowed:false}});
 assert.equal(denied.canBeginNewLive,false);
 const slow=evaluateHybridLink({...candidate,nativeBuildAvailableLinks:[source.wifi],
   measuredInternet:{cellular:net(0.3)}});
 assert.equal(slow.preferredLink,null);
});
test('Bluetooth can preserve existing verified infrastructure Wi-Fi upload route',()=>{
 const x=evaluateHybridLink({...candidate,nativeBuildAvailableLinks:[source.bluetooth],
  device:{cellularAllowed:false}});
 assert.equal(x.preferredLink,source.bluetooth);
 assert.equal(x.preferredUplink,'existing-wifi');
 assert.equal(x.preferredMediaProfile,'balanced');
});
test('unverified Wi-Fi uplink is not treated as good internet for BT source',()=>{
 const x=evaluateHybridLink({...candidate,nativeBuildAvailableLinks:[source.bluetooth],
  device:{cellularAllowed:false},
  measuredInternet:{'existing-wifi':{testVerified:false,stable:true,measuredUploadMbps:9}}});
 assert.equal(x.canBeginNewLive,false);
});
test('live stage does NOT attempt transport switch even when other link better',()=>{
 const x=evaluateHybridLink({...candidate,phase:'during-live',currentLink:source.bluetooth});
 assert.equal(x.preferredLink,source.bluetooth);
 assert.equal(x.requestTransportSwitchNow,false);
 assert.equal(x.recommendAfterSession,null);
 assert.ok(x.decisions.some(m=>m.includes('restart')||m.includes('LIVE')));
});
test('if current LIVE path fails, indicate alternative only for next session',()=>{
 const bad={...candidate,measuredCapture:{[source.bluetooth]:capture(6),[source.wifi]:capture(30)}};
 const x=evaluateHybridLink({...bad,phase:'during-live',currentLink:source.bluetooth});
 assert.equal(x.preferredLink,source.wifi);
 assert.equal(x.recommendAfterSession,source.wifi);
 assert.equal(x.requestTransportSwitchNow,false);
});
test('publisher adapts bitrate without pretending it changes camera transport',()=>{
 const x=suggestPublisherQuality({currentProfile:'high',availableMbps:1.7,sourceFps:24});
 assert.equal(x.action,'reduce_publisher_bitrate');
 assert.equal(x.nextProfile,'conservative');
 assert.match(x.reason,/not Meta link/);
});
test('insufficient uplink protects local recording rather than promising LIVE',()=>{
 const x=suggestPublisherQuality({currentProfile:'balanced',availableMbps:0.18,sourceFps:24});
 assert.equal(x.action,'warn_and_preserve_local');
 const y=suggestPublisherQuality({currentProfile:'balanced',availableMbps:7,sourceFps:0});
 assert.equal(y.action,'warn_and_preserve_local');
});
