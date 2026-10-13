import test from 'node:test';
import assert from 'node:assert/strict';
import {decideIRL,calculateSessionProbe} from '../irl-resilience.mjs';
test('mobile connection fails while glasses-to-phone remains stable: KEEP LOCAL RECORDING',()=>{
 const p=decideIRL({cameraState:'streaming',localRecorder:'recording',uplink:'offline',sourceThermal:'cool'});
 assert.equal(p.phoneUplinkStatus,'reconnecting');
 assert.equal(p.outgoingVideoKbpsLimit,0);
 assert.equal(p.localRecordingMayContinue,true);
 assert.ok(p.actions.includes('keep_local_recording_while_frames_arrive'));
 assert.ok(p.actions.includes('suspend_remote_publish_and_retry_when_network_returns'));
 assert.equal(p.cameraTransportSwitchSupported,false);
});
test('no platform falsely promises indefinite paused LIVE',()=>{
 const p=decideIRL({streamPlatform:'youtube',uplink:'offline',secondsSinceUplinkLost:30});
 assert.ok(p.warnings.some(x=>x.includes('session may end')));
 assert.ok(!p.warnings.some(x=>x.includes('90 seconds')));
});
test('Twitch disconnect protection is conditional on actual supported encoder and setting',()=>{
 const unknown=decideIRL({streamPlatform:'twitch',uplink:'offline'});
 assert.ok(unknown.warnings.some(x=>x.includes('No platform continuity guaranteed')));
 const verified=decideIRL({streamPlatform:'twitch',uplink:'offline',platformProtectionVerified:true});
 assert.ok(verified.warnings.some(x=>x.includes('up to 90 seconds')));
});
test('weakened phone uplink reduces outgoing bitrate without changing glasses-to-phone link',()=>{
 const p=decideIRL({uplink:'weak',cameraState:'streaming',sourceLink:'bluetooth-classic',currentProfile:'standard'});
 assert.equal(p.proposedNextSessionSourceProfile,'standard');
 assert.equal(p.outgoingVideoKbpsLimit,950);
 assert.equal(p.localRecordingMayContinue,true);
 assert.equal(p.sourceLink,'bluetooth-classic');
});
test('hot glasses require safety and cannot be fixed just by reducing output bitrate',()=>{
 const p=decideIRL({sourceThermal:'hot',uplink:'good',localRecorder:'recording'});
 assert.equal(p.proposedNextSessionSourceProfile,'thermalLow');
 assert.ok(p.actions.includes('warn_wearer_about_glasses_temperature'));
 assert.ok(p.actions.includes('respect_native_sdk_thermal_pause_or_stop'));
 assert.ok(p.warnings.some(x=>x.includes('does not')));
});
test('critical thermal or lost camera does not pretend recording still works',()=>{
 const p=decideIRL({sourceThermal:'critical'});
 assert.equal(p.localRecordingMayContinue,false);
 assert.ok(p.actions.includes('stop_camera_safely_and_finalize_available_recording'));
});
test('source camera pause does not pretend video continued',()=>{
 const p=decideIRL({cameraState:'paused',uplink:'offline'});
 assert.equal(p.localRecordingMayContinue,false);
 assert.ok(p.actions.includes('preserve_session_and_wait_for_device_resume'));
});
test('low battery warns without claiming how long glasses last',()=>{
 const p=decideIRL({glassesBatteryPercent:7,phoneBatteryPercent:13});
 assert.ok(p.actions.includes('prepare_graceful_stop'));
 assert.ok(p.warnings.some(x=>x.includes('Phone battery low')));
});
test('measurement computes battery *observations* and does not claim 8 h LIVE',()=>{
 const p=calculateSessionProbe({minutes:10,measuredGlassesStartBattery:95,measuredGlassesEndBattery:89,framesReceived:13600});
 assert.equal(p.measuredBatteryUsedPercent,6);
 assert.equal(p.approximateDepletionPercentPerHour,36);
 assert.match(p.caution,/NOT a battery-life guarantee/);
 assert.throws(()=>calculateSessionProbe({minutes:5,measuredGlassesStartBattery:50,measuredGlassesEndBattery:55}),/Invalid/);
});
test('inputs must be validated and not encode phantom time',()=>{
 assert.throws(()=>decideIRL({secondsSinceUplinkLost:-1}),/reconnect age/);
 assert.throws(()=>decideIRL({glassesBatteryPercent:150}),/Battery/);
 assert.throws(()=>decideIRL({sourceThermal:'overclock'}),/thermal/);
});
