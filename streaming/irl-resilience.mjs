/**
 * AgentCut IRL network resilience + Ray-Ban thermal/battery policy.
 * PURE DECISION LAYER ONLY. It does not connect or record, and does not
 * override the Meta SDK or platform's broadcast policies.
 *
 * Two separate physical routes:
 * (A) Ray-Ban -> phone: Meta DAT source link, ideally stable and nearby.
 * (B) Phone -> internet: 4G/5G or infrastructure Wi-Fi; can change/drop.
 * Network failure B must NOT stop source link A or local recorder.
 *
 * Safety: the wearer must follow device thermal warnings; NEVER defeat Meta
 * thermal pause/stop to preserve a stream. — ChatGPT
 */
const profiles=Object.freeze({
  standard:{resolution:"medium",requestedFPS:24,videoKbps:1550},
  economy:{resolution:"low",requestedFPS:24,videoKbps:950},
  thermalLow:{resolution:"low",requestedFPS:15,videoKbps:650},
});
function isNonnegative(n) {return typeof n==="number"&&Number.isFinite(n)&&n>=0}
function between(n,a,b){return isNonnegative(n)&&n>=a&&n<=b}
function fail(s){throw new Error(s)}

/** Called from real native events, not from a remote LLM.
 * Observations are untrusted until stamped by the device side. */
export function decideIRL({
 sourceLink="bluetooth-classic",
 cameraState="streaming",
 cameraMeasuredFPS=null,
 sourceThermal="unknown",
 glassesBatteryPercent=null,
 phoneBatteryPercent=null,
 uplink="good",
 lastKnownUplinkKbps=null,
 currentProfile="standard",
 localRecorder="recording",
 streamPlatform="other",
 platformProtectionVerified=false,
 secondsSinceUplinkLost=0,
}={}){
 if(!["bluetooth-classic","wifi-softap"].includes(sourceLink))fail("Unknown camera transport");
 if(!["streaming","paused","stopped","unavailable"].includes(cameraState))fail("Unknown camera state");
 if(!["cool","warm","hot","critical","unknown"].includes(sourceThermal))fail("Unknown thermal state");
 if(!["good","weak","offline"].includes(uplink))fail("Unknown phone uplink");
 if(!["recording","not-recording","failed"].includes(localRecorder))fail("Unknown recorder status");
 if(!Object.hasOwn(profiles,currentProfile))fail("Unknown quality profile");
 if(!isNonnegative(secondsSinceUplinkLost))fail("Invalid reconnect age");
 for(const value of [glassesBatteryPercent,phoneBatteryPercent]){
  if(value!==null&&!between(value,0,100))fail("Battery readings must be 0..100 or unknown");
 }
 if(cameraMeasuredFPS!==null&&!isNonnegative(cameraMeasuredFPS))fail("Camera FPS must be positive/unknown");
 const actions=[],warnings=[];
 let connectedCamera=cameraState==="streaming";
 let capturePreserved=connectedCamera&&localRecorder==="recording";
 const powerRisk=glassesBatteryPercent!==null&&glassesBatteryPercent<=20;
 const criticalPower=glassesBatteryPercent!==null&&glassesBatteryPercent<=8;
 const lowPhone=phoneBatteryPercent!==null&&phoneBatteryPercent<=15;
 let targetProfile=currentProfile;
 let internetStatus="connected";
 if(sourceThermal==="critical"||cameraState==="stopped"||cameraState==="unavailable"){
   actions.push("stop_camera_safely_and_finalize_available_recording");
   warnings.push("Camera stream unavailable or thermal-critical; cannot promise continuous recording.");
   connectedCamera=false;capturePreserved=false;
 } else if(sourceThermal==="hot"){
   targetProfile="thermalLow";
   actions.push("warn_wearer_about_glasses_temperature");
   actions.push("respect_native_sdk_thermal_pause_or_stop");
   warnings.push("Do not assume changing RTMP bitrate cools glasses. Source resolution/FPS changes can require restarting DAT session.");
 } else if(sourceThermal==="warm"||powerRisk){
   targetProfile=currentProfile==="standard"?"economy":currentProfile;
   actions.push("disable_optional_glasses_ai_or_photos_when_possible");
   actions.push("recommend_shorter_session_and_check_battery");
   warnings.push("Source profile adjustments may need a new SDK session; not a seamless live change.");
 }
 if(criticalPower){
   warnings.push("Glasses battery critically low; stop before thermal/power cutoff and finalize local recording.");
   actions.push("prepare_graceful_stop");
 }
 if(lowPhone){
   warnings.push("Phone battery low; suggest power bank for PHONE only while safely used.");
 }
 if(localRecorder!=="recording"){
   warnings.push("No verified local recording; the live broadcast is not backed up.");
   actions.push("notify_recording_unavailable");
 }
 if(cameraState==="paused"){
   warnings.push("DAT camera is paused; resume must be driven by SDK/device, not faked by encoder.");
   actions.push("preserve_session_and_wait_for_device_resume");
   capturePreserved=false;
 }
 if(uplink==="offline"){
   internetStatus="reconnecting";
   actions.push("keep_dat_camera_link_if_sdk_allows");
   actions.push("keep_local_recording_while_frames_arrive");
   actions.push("suspend_remote_publish_and_retry_when_network_returns");
   // Backoff schedule is advisory; native RTMP publisher must implement it.
   const retrySec=secondsSinceUplinkLost<5?1:secondsSinceUplinkLost<15?3:
     secondsSinceUplinkLost<45?5:15;
   actions.push("suggest_reconnect_retry_seconds_"+retrySec);
   if(streamPlatform==="twitch"&&platformProtectionVerified){
     warnings.push("Twitch disconnect protection may show temporary slate for up to 90 seconds. AgentCut RTMP encoder support not verified.");
   }else{
     warnings.push("No platform continuity guaranteed; its LIVE session may end even if recording continues.");
   }
 }else if(uplink==="weak"){
   internetStatus="degraded";
   if(currentProfile==="standard")targetProfile="economy";
   actions.push("reduce_outgoing_encoder_bitrate_when_supported");
   actions.push("keep_local_recording_while_frames_arrive");
   warnings.push("Lower phone-to-platform bitrate cannot repair glasses-to-phone link quality or thermal load.");
 }else {
   internetStatus="connected";
   actions.push("send_to_remote_publisher_if_authenticated");
   actions.push("keep_local_recording_while_frames_arrive");
 }
 if(sourceLink==="wifi-softap"&&uplink!=="offline"){
   warnings.push("Wi-Fi softAP may displace phone infrastructure Wi-Fi; cellular uplink must be tested separately.");
 }
 if(cameraMeasuredFPS!==null&&cameraMeasuredFPS<15){
   warnings.push("Camera source frame rate below recommended usable threshold; do not fabricate missing frames.");
 }
 return {
   policy:"irl-resilience-v0.1",sourceLink,sourceState:cameraState,
   phoneUplinkStatus:internetStatus,
   cameraTransportSwitchSupported:false,
   proposedNextSessionSourceProfile:targetProfile,
   outgoingVideoKbpsLimit:uplink==="weak"?Math.min(profiles[targetProfile].videoKbps,950)
     :profiles[currentProfile].videoKbps,
   localRecordingMayContinue:capturePreserved,
   actions,warnings,
   status:"decision_only_not_native_runtime"
 };
}
export function calculateSessionProbe({
 minutes=5,measuredGlassesStartBattery,measuredGlassesEndBattery,
 initialThermal="cool",endThermal="cool",framesReceived=0,source= "bluetooth-classic"
}={}){
 if(!isNonnegative(minutes)||minutes<=0||!between(measuredGlassesStartBattery,0,100)||
 !between(measuredGlassesEndBattery,0,100)||
 measuredGlassesEndBattery>measuredGlassesStartBattery)fail("Invalid probe battery/time");
 if(!isNonnegative(framesReceived))fail("Frames invalid");
 if(!["cool","warm","hot","critical","unknown"].includes(initialThermal)||!["cool","warm","hot","critical","unknown"].includes(endThermal))fail("Thermal status invalid");
 return {minutes,source,framesReceived,
   measuredBatteryUsedPercent:Math.round((measuredGlassesStartBattery-measuredGlassesEndBattery)*100)/100,
   approximateDepletionPercentPerHour:Math.round(((measuredGlassesStartBattery-measuredGlassesEndBattery)/minutes*60)*100)/100,
   thermalChange:initialThermal+" → "+endThermal,
   caution:"Short-session extrapolation only; NOT a battery-life guarantee. No hardware test was performed by this code."};
}
