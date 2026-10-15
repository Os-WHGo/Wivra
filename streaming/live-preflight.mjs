/**
 * AgentCut live transport preflight & lifecycle, platform-neutral.
 * This is a guard/plan layer; NO Meta SDK, encoder, RTMP socket, or recorder.
 * Calls from cloud agents must NEVER trigger startLive().
 * User must press a native start control with confirmation.
 * No stream keys or OAuth tokens belong in this module.
 * — ChatGPT
 */

const SUPPORTED_DESTINATIONS = Object.freeze(['youtube','twitch','kick','facebook','instagram','tiktok','custom']);
const SOURCE_MODES = Object.freeze(['meta-ios','meta-android','phone-camera','mock-device']);
const FRAME_RATES = Object.freeze([2,7,15,24,30]);
const CAMERA_LINKS = Object.freeze(['bluetooth-classic','wifi-softap','phone-camera','unverified']);
const UPLINK_PATHS = Object.freeze(['cellular','existing-wifi','unknown']);
const RESOLUTIONS = Object.freeze({
  low: Object.freeze({width:360,height:640}),
  medium: Object.freeze({width:504,height:896}),
  high: Object.freeze({width:720,height:1280}),
});
const ALLOWED = Object.freeze({
  idle:['connected'],
  connected:['previewing','idle'],
  previewing:['ready','connected'],
  ready:['live','previewing'],
  live:['stopping'],
  stopping:['saved','recording_failed'],
  saved:['idle'],
  recording_failed:['idle'],
});
function fail(msg) { throw new Error(msg); }
function bool(v) { return v === true; }
function requireFinitePositive(value,label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) fail(label+' must be positive');
}
function oneOf(v,list,label) { if(!list.includes(v)) fail('Unsupported '+label); }
export function getCapabilities() {
  return {destinations:[...SUPPORTED_DESTINATIONS],sourceModes:[...SOURCE_MODES],
    metaStreamingSizes:RESOLUTIONS,frameRates:[...FRAME_RATES],
    cameraLinkOptions:[...CAMERA_LINKS],phoneUplinkOptions:[...UPLINK_PATHS],
    wifiCameraTransportIntroducedDAT080:true,
    wifiSoftApDisplacesNormalPhoneWifi:true,
    cameraTransportIsNotRuntimeToggled:true,
    sourceCodec:'HEVC/hvc1 (when requested)',publishProfile:'H.264 + AAC provisional, per-destination verification needed',
    metaLiveSourceRequiresNativeBridge:true,experimentalPcmAudioNotForProduction:true};
}
/** Create non-secret preflight. Caller holds the actual credentials in platform secure store. */
export function createPreflight({
  sourceMode='meta-ios',resolution='medium',fps=24,
  cameraLink=null,phoneUplink='unknown',
  destinations=[],recordLocal=true,audioPath='phone-mic',
  forwarding='single'
}={}){
  oneOf(sourceMode,SOURCE_MODES,'sourceMode');
  const actualCameraLink=cameraLink ?? (sourceMode.startsWith('meta-')?'bluetooth-classic':'phone-camera');
  oneOf(actualCameraLink,CAMERA_LINKS,'cameraLink');
  oneOf(phoneUplink,UPLINK_PATHS,'phoneUplink');
  if(sourceMode.startsWith('meta-') && actualCameraLink==='phone-camera')
    fail('Camera link cannot be phone-camera for Meta glasses');
  if(!sourceMode.startsWith('meta-') && actualCameraLink!=='phone-camera')
    fail('Phone camera cannot request Meta camera transport');
  if(!(resolution in RESOLUTIONS))fail('Unsupported resolution');
  oneOf(fps,FRAME_RATES,'fps');
  oneOf(audioPath,['phone-mic','glasses-bluetooth-hfp','none'],'audioPath');
  oneOf(forwarding,['single','relay','multiple-direct'],'forwarding');
  if(!bool(recordLocal))fail('Local recording must be enabled for this proof');
  if(!Array.isArray(destinations)||destinations.length===0||destinations.length>6)fail('Choose 1–6 destinations');
  if(forwarding==='single'&&destinations.length!==1)fail('Single ingest can use only one destination');
  if(forwarding==='relay'&&destinations.length<2)fail('Relay is only useful for multiple targets');
  const seen=new Set();
  const clean=destinations.map((d,i)=>{
    if(!d||typeof d!=='object')fail('Invalid destination '+i);
    oneOf(d.platform,SUPPORTED_DESTINATIONS,'platform');
    if(seen.has(d.platform)&&d.platform!=='custom')fail('Destination repeated');
    seen.add(d.platform);
    if(d.eligibilityConfirmed!==true)fail('Account LIVE/encoder eligibility not confirmed for '+d.platform);
    // Non-secret descriptor ONLY. DO NOT accept URL, full streamKey or OAuth strings.
    if('url' in d||'streamKey' in d||'token' in d||'authorization' in d)fail('No private ingest URLs or keys in public plan');
    if(typeof d.secureCredentialId!=='string'||!/^cred-[a-zA-Z0-9_-]{4,80}$/.test(d.secureCredentialId))
       fail('Use opaque secure credential ID, never an actual RTMP key');
    return {platform:d.platform,secureCredentialId:d.secureCredentialId,eligibilityConfirmed:true};
  });
  const audioWarning=audioPath==='glasses-bluetooth-hfp'
    ? 'Glasses Bluetooth HFP audio path is based on the official sample, NOT the experimental DAT PCM path; permissions and live synchronization require hardware tests.'
    : audioPath==='phone-mic'?'Phone microphone may differ from glasses viewpoint; lip/audio synchronization requires hardware tests.'
      : 'Stream without audio; destination compatibility may vary.';
  return Object.freeze({
    schemaVersion:'agentcut-live-preflight-0.1',
    sourceMode,cameraLink:actualCameraLink,phoneUplink,
    sourceRequested:{...RESOLUTIONS[resolution],resolution,fps,codec:'hevc'},
    destinations:clean,recordLocal:true,audioPath,forwarding,
    publisherCodec:'h264',publisherAudioCodec:audioPath==='none'?null:'aac',
    archivalCodec:'hevc-passthrough-if-compressed-DAT-sample',
    verifiedHardware:false,
    liveReady:false,
    warnings:[
      'This is only a plan, not a real Meta connection, encoder or publisher.',
      'No direct access from Safari to the DAT camera stream is established.',
      'Requested resolution is an upper request, not guaranteed: DAT transport, network, firmware and device adapt actual resolution/FPS.',
      actualCameraLink==='wifi-softap'
        ? 'Meta DAT Wi-Fi uses glasses soft-AP. On iOS it can displace normal Wi-Fi; an internet LIVE uplink may need cellular, which can be costly/unreliable. Meta July 2026 recommended BTC for live outbound apps. Validate current DAT versions and real phone network routing.'
        : actualCameraLink==='bluetooth-classic'
          ? 'Meta DAT Bluetooth Classic has lower video bandwidth, but preserves the normal phone Wi-Fi internet route and was Meta staff recommendation for internet LIVE as of July 2026.'
          : 'Verify camera transport and internet route on device.',
      actualCameraLink==='wifi-softap' && phoneUplink==='existing-wifi'
        ? 'Warning: Wi-Fi softAP cannot guarantee simultaneous normal phone Wi-Fi for internet. This plan must NOT proceed as ready without testing an alternate uplink.'
        : phoneUplink==='cellular'
          ? 'Cellular internet may incur data charges; measure effective uplink and dropped frames.'
          : 'Internet uplink path not yet verified.',
      audioWarning,
      forwarding==='relay'?'Relay software can be open-source but server bandwidth/hosting is not guaranteed free.':
        forwarding==='multiple-direct'?'Each destination may require a separate phone upload; live data usage multiplies.':
          'Only one destination in this proof.',
      'Record locally and verify the resulting file before claiming an archive was saved.'
    ]
  });
}

/** Data estimates, not an encoder. Video+audio uplink total, decimal GB. */
export function estimateTransfer({minutes,videoKbps,audioKbps=128,streams=1}) {
  requireFinitePositive(minutes,'minutes');requireFinitePositive(videoKbps,'videoKbps');
  if(typeof audioKbps!=='number'||!Number.isFinite(audioKbps)||audioKbps<0)fail('Invalid audioKbps');
  if(!Number.isInteger(streams)||streams<1||streams>6)fail('Invalid streams');
  const perStreamGB=(videoKbps+audioKbps)*1000*(minutes*60)/8e9;
  return {
    phoneUplinkGB:Math.round(perStreamGB*streams*1000)/1000,
    singleStreamGB:Math.round(perStreamGB*1000)/1000,
    note:'Estimate, not measured: protocol overhead/retries, adaptive bitrate and carrier accounting can vary.'
  };
}

/** Core lifecycle only. Must be driven by native device/stream/recorder events. */
export class LiveSession {
  #state='idle';
  #recordedFile=null;
  #plan=null;
  #events=[];
  get state(){return this.#state}
  get events(){return this.#events.map(x=>({...x}))}
  get savedFile(){return this.#recordedFile&&{...this.#recordedFile}}
  get plan(){return this.#plan}
  #step(next,cause){
    if(!(ALLOWED[this.#state]||[]).includes(next))fail('Illegal LIVE transition '+this.#state+' → '+next);
    this.#state=next;this.#events.push({to:next,cause});
  }
  connectGlasses({nativeConnectionVerified=false}={}){
    if(!nativeConnectionVerified)fail('DAT connection needs real native confirmation');
    this.#step('connected','native-device-confirmed');
  }
  beginPreview({nativeFramesObserved=false}={}){
    if(!nativeFramesObserved)fail('Cannot advertise preview without real decoded frames');
    this.#step('previewing','live-frame-received');
  }
  ready({plan,recorderPrepared=false,encodedAudioVideoValidated=false}={}){
    if(!plan||plan.liveReady!==false)fail('Expected validated preflight');
    if(!recorderPrepared)fail('Recording path must be ready');
    if(!encodedAudioVideoValidated)fail('Publisher media must be validated');
    this.#plan=plan;this.#step('ready','native-media-prepared');
  }
  startLive({explicitHumanPress=false,nativePublisherConnected=false}={}){
    if(!explicitHumanPress)fail('A human must press the Start LIVE control');
    if(!nativePublisherConnected)fail('A verified publisher connection is needed');
    this.#step('live','human-started-live');
  }
  requestStop({humanRequested=false}={}){
    if(!humanRequested)fail('Explicit stop required');
    this.#step('stopping','human-stopped-live');
  }
  finishRecording({storageVerified=false,bytesWritten=0,localAssetId=null}={}){
    if(!storageVerified||!Number.isFinite(bytesWritten)||bytesWritten<=0||typeof localAssetId!=='string'||!/^local-[a-zA-Z0-9_-]{5,100}$/.test(localAssetId))
      fail('A real, verified local artifact is needed');
    this.#recordedFile={localAssetId,bytesWritten};
    this.#step('saved','final-file-verified');
  }
  failRecording(){this.#step('recording_failed','no-verified-local-file')}
  reset(){this.#step('idle','new-session');this.#recordedFile=null;this.#plan=null}
}
