/**
 * Wivra portable audio routing CONTRACT, no audio processing or capture here.
 *
 * The same descriptor can be consumed by a future Windows/macOS/Linux host,
 * iOS/Android capture bridge, or test harness. Sources MUST already be
 * independently captured and verified by the host. No API in this module
 * opens a microphone, captures protected system audio, encodes AAC, starts LIVE,
 * connects Twitch, or removes copyrighted sound embedded in a microphone.
 *
 * Human-operated controls and native adapter permissions remain mandatory.
 */
const HOSTS=Object.freeze(['ios','android','windows','macos','linux']);
const PLATFORMS=Object.freeze([
  'twitch','youtube','kick','tiktok','instagram','facebook','custom'
]);
const KINDS=Object.freeze([
  'microphone','remote-microphone','ambience','music','game','effects','system-audio','other'
]);
const BUS_KEYS=Object.freeze(['live','vod','archive']);
const ROUTE_KEYS=Object.freeze(['live','vod','archive']);

const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
function fail(message){throw new TypeError(message)}
function object(value){return value!==null && typeof value==='object' && !Array.isArray(value)}
function freezeArray(items){return Object.freeze([...items])}

/** Ordinary, non-sensitive source IDs. Device names and credentials are excluded. */
function checkId(value){
  if(typeof value!=='string' || !/^src-[a-zA-Z0-9_-]{2,80}$/.test(value))
    fail('Source id must be an opaque src-* identifier');
}
function checkBoolean(value,label){
  if(typeof value!=='boolean')fail(label+' must be a boolean');
}
function checkRouting(value){
  if(!object(value) || Object.keys(value).some(key=>!ROUTE_KEYS.includes(key)))
    fail('Routing must specify only live/vod/archive');
  for(const bus of BUS_KEYS) {
    if(!own(value,bus))fail('Routing must explicitly specify all three buses');
    checkBoolean(value[bus],'Routing '+bus);
  }
}
function defaultRouting(kind){
  return {live:true,vod:kind!=='music',archive:true};
}

export function portableAudioCapabilities(){
  return Object.freeze({
    hosts:freezeArray(HOSTS),
    platforms:freezeArray(PLATFORMS),
    sourceKinds:freezeArray(KINDS),
    buses:freezeArray(BUS_KEYS),
    audioEngineImplemented:false,
    nativeCaptureImplemented:false,
    remoteVODPublisherImplemented:false,
    desktopApplicationImplemented:false,
    requiresRuntimeVerification:true
  });
}

/**
 * Builds a non-secret, pure-data routing plan. No actual media flows.
 *
 * Inputs:
 *  id: opaque identifier, kind: kind of isolated capture source
 *  captureVerified: native capture of this exact source is active and permitted
 *  isolated: true only when that PCM feed does not already contain other inputs
 *  routing: optional {live, vod, archive} flags; defaults exclude music from vod
 *
 * adapterCapabilities.dedicatedVODAudioVerified is trustworthy ONLY when the
 * Twitch native output adapter has negotiated this exact capability. Never
 * accept this flag as proof a server has received or stored the tracks.
 */
export function createAudioRoutingPlan({
  host='ios',
  platform='twitch',
  inputs=[],
  adapterCapabilities={}
}={}){
  if(!HOSTS.includes(host))fail('Unsupported audio host');
  if(!PLATFORMS.includes(platform))fail('Unsupported LIVE platform');
  if(!Array.isArray(inputs) || inputs.length>32)fail('Inputs must be an array of at most 32');
  if(!object(adapterCapabilities) ||
      Object.keys(adapterCapabilities).some(key=>key!=='dedicatedVODAudioVerified'))
    fail('Unsupported adapter capability');
  const negotiated=adapterCapabilities.dedicatedVODAudioVerified ?? false;
  checkBoolean(negotiated,'dedicatedVODAudioVerified');
  if(negotiated && platform!=='twitch')
    fail('A dedicated VOD track has only been established for Twitch; no other remote VOD guarantee');

  const byBus={live:[],vod:[],archive:[]};
  const seen=new Set();
  const warnings=[
    'Routing plan only. Real mixing, microphone input, capture, encoding, native permissions and RTMP output require separate adapters.',
    'Separating a music input from VOD does not grant permission to broadcast it LIVE or prevent LIVE copyright detection.'
  ];
  let musicInVOD=false;
  let mixedOrUnverified=false;
  for(const source of inputs){
    if(!object(source))fail('Invalid audio input');
    const permitted=['id','kind','captureVerified','isolated','routing'];
    if(Object.keys(source).some(key=>!permitted.includes(key)))
      fail('Audio input contains unsupported or private fields');
    checkId(source.id);
    if(seen.has(source.id))fail('Audio source IDs must be unique');
    seen.add(source.id);
    if(!KINDS.includes(source.kind))fail('Unsupported audio source kind');
    if(source.captureVerified!==true)
      fail('Do not route an input unless native capture is explicitly verified');
    checkBoolean(source.isolated,'isolated');
    const routing=source.routing ?? defaultRouting(source.kind);
    checkRouting(routing);
    for(const bus of BUS_KEYS) if(routing[bus])byBus[bus].push(source.id);
    if(source.kind==='music' && routing.vod)musicInVOD=true;
    if(!source.isolated && routing.vod)mixedOrUnverified=true;
  }
  if(musicInVOD)
    warnings.push('The VOD mix explicitly contains a music input. It is not a music-free candidate.');
  if(mixedOrUnverified)
    warnings.push('At least one VOD input already contains mixed audio. Music leaking into microphones cannot be removed by routing.');
  if(!byBus.vod.length)
    warnings.push('The VOD mix has no sources. A silent VOD needs explicit user review.');
  if(platform!=='twitch')
    warnings.push('No universal remote VOD-track feature is verified for this platform. Record a separate clean local copy for later publication.');
  if(platform==='twitch'&&!negotiated)
    warnings.push('Twitch VOD Track is documented in OBS but this Wivra output adapter has NOT been verified to transmit it.');
  const cleanCandidate=!musicInVOD && !mixedOrUnverified && byBus.vod.length>0;
  const feeds=Object.freeze({
    live:freezeArray(byBus.live),
    vod:freezeArray(byBus.vod),
    archive:freezeArray(byBus.archive)
  });
  const vodDelivery=negotiated?'twitch-native-vod-track-capability':'local-clean-recording-only';
  return Object.freeze({
    schemaVersion:'wivra-audio-routing-1',
    host,platform,
    feeds,
    musicExcludedFromVOD:!musicInVOD,
    cleanVODCandidate:cleanCandidate,
    vodDelivery,
    nativeAudioVerified:false,
    remoteAudioPublished:false,
    copyrightClearanceVerified:false,
    warnings:freezeArray(warnings)
  });
}
