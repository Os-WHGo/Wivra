/**
 * AgentCut Hybrid Link policy. Decision support ONLY.
 * This neither selects the Meta DAT transport nor changes device link in real
 * time. No simultaneous BT+Wi-Fi link bonding; no guessed connectivity.
 * Measured metrics come from a future native probe (never an LLM assertion).
 *
 * DAT iOS currently has no confirmed public lossless runtime switch API.
 * A third-party Flutter bridge documents Info.plist/entitlement selection at
 * build time. Consider runtime switching UNSUPPORTED until verified.
 *
 * — ChatGPT
 */
const LINKS=Object.freeze(['bluetooth-classic','wifi-softap']);
const MEDIA_LEVELS=Object.freeze([
  Object.freeze({name:'conservative',bitrateKbps:950,fps:15,resolution:'low'}),
  Object.freeze({name:'balanced',bitrateKbps:1600,fps:24,resolution:'medium'}),
  Object.freeze({name:'high',bitrateKbps:2500,fps:30,resolution:'high'}),
]);
const LIMITS=Object.freeze({
  minCellularHeadroom:1.5,
  minOtherHeadroom:1.3,
  maxPacketLossPercent:3,
  maxFrameGapMs:1500,
  minFrameRate:12,
});
function validNumber(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0}
function normalizeLinkMetrics(candidate){
  if(!candidate||candidate.sdkSupported!==true||candidate.probeVerified!==true)return null;
  const {observedFps,packetLossPercent,largestFrameGapMs}=candidate;
  if(![observedFps,packetLossPercent,largestFrameGapMs].every(validNumber))return null;
  return {observedFps,packetLossPercent,largestFrameGapMs,linkReady:candidate.linkReady===true};
}
function normalizeInternet(link){
  if(!link||link.testVerified!==true||!validNumber(link.measuredUploadMbps))return null;
  return {measuredUploadMbps:link.measuredUploadMbps,stable:link.stable===true,route:link.route||'unknown'};
}
const round=n=>Math.round(n*100)/100;
function assessCapture(x){
  if(!x||!x.linkReady)return {healthy:false,reason:'no verified live device link'};
  if(x.observedFps<LIMITS.minFrameRate)return {healthy:false,reason:'too few video frames'};
  if(x.packetLossPercent>LIMITS.maxPacketLossPercent)return {healthy:false,reason:'camera packet loss too high'};
  if(x.largestFrameGapMs>LIMITS.maxFrameGapMs)return {healthy:false,reason:'camera pauses too long'};
  return {healthy:true,reason:'capture health sample acceptable'};
}
function suitableMediaLevel(internet,camera,phoneLink){
  const factor=phoneLink==='cellular'?LIMITS.minCellularHeadroom:LIMITS.minOtherHeadroom;
  return [...MEDIA_LEVELS].reverse().find(level=>
    internet.measuredUploadMbps*1000 >= level.bitrateKbps*factor &&
    camera.observedFps >= Math.min(level.fps,24)
  )||null;
}
/**
 * Data-shaped comparison from actual native measurements, not an SDK switch.
 * inputs:
 *  - nativeBuildAvailableLinks: array of paths PROVEN supported by this build
 *  - measuredCapture: { 'bluetooth-classic': {sdkSupported,probeVerified,linkReady,
 *                           observedFps,packetLossPercent,largestFrameGapMs}, ... }
 *  - measuredInternet: {cellular:{testVerified,stable,measuredUploadMbps},
 *                        'existing-wifi': {...}}
 *  - device: {cellularAllowed:boolean}
 *  - phase: 'before-live'|'during-live'; currentLink optional
 */
export function evaluateHybridLink({
  nativeBuildAvailableLinks=[],
  measuredCapture={},
  measuredInternet={},
  device={cellularAllowed:false},
  phase='before-live',
  currentLink=null
}={}){
  if(!['before-live','during-live'].includes(phase))throw new Error('Unsupported phase');
  if(currentLink!==null&&!LINKS.includes(currentLink))throw new Error('Invalid current transport');
  if(!Array.isArray(nativeBuildAvailableLinks)||nativeBuildAvailableLinks.some(l=>!LINKS.includes(l)))
    throw new Error('Transport support must come from a verified native build');
  const candidates=[];
  for(const link of LINKS){
    const reasons=[],capture=normalizeLinkMetrics(measuredCapture[link]);
    const eligibleBuild=nativeBuildAvailableLinks.includes(link);
    const route=link==='wifi-softap'?'cellular':
      (measuredInternet['existing-wifi']?.stable===true?'existing-wifi':'cellular');
    const internet=normalizeInternet(measuredInternet[route]);
    if(!eligibleBuild)reasons.push('this build has not verified this transport');
    const health=assessCapture(capture);
    if(!health.healthy)reasons.push(health.reason);
    if(link==='wifi-softap'&&!device.cellularAllowed)
      reasons.push('glasses Wi-Fi softAP requires cellular internet route for this design');
    if(route==='cellular'&&!device.cellularAllowed)
      reasons.push('cellular data was not authorized');
    if(!internet||!internet.stable)reasons.push('outgoing network not measured stable');
    const media=internet&&capture?suitableMediaLevel(internet,capture,route):null;
    if(!media)reasons.push('insufficient measured bandwidth for any approved test profile');
    const usable=reasons.length===0;
    const linkQuality=capture?Math.min(1,capture.observedFps/30):0;
    const stability=capture?Math.max(0,1-capture.packetLossPercent/10)
      *Math.max(0,1-capture.largestFrameGapMs/3000):0;
    // Operational quality-first after qualifying uplink/camera, not 4K marketing.
    // Bias to a presently active link to avoid flapping.
    const score=usable?round(100*stability+15*linkQuality
      +(media?.name==='high'?12:media?.name==='balanced'?6:0)
      +(link===currentLink?18:0)):null;
    candidates.push({link,usable,reason:reasons.length?reasons.join('; '):'tested path acceptable',
      phoneUplink:route,score,mediaProfile:media?.name??null,
      suggestedUplinkMbps:media?round(media.bitrateKbps/1000):null});
  }
  const usable=candidates.filter(x=>x.usable).sort((a,b)=>b.score-a.score);
  let preferred=usable[0]||null;
  if(phase==='during-live' && currentLink){
    const current=candidates.find(x=>x.link===currentLink);
    if(current?.usable){
      // Explicit avoid link switching mid-live even when another scores better.
      preferred=current;
    }
  }
  const wantsDifferent=!!(preferred&&currentLink&&preferred.link!==currentLink);
  return {
    mode:'hybrid-advisor-only',
    phase,
    candidates,
    preferredLink:preferred?.link??null,
    preferredUplink:preferred?.phoneUplink??null,
    preferredMediaProfile:preferred?.mediaProfile??null,
    canSwitchTransportAtRuntime:false,
    canBondTransportLinks:false,
    requestTransportSwitchNow:false,
    recommendAfterSession:phase==='during-live'&&wantsDifferent?preferred.link:null,
    canBeginNewLive:phase==='before-live'&&!!preferred,
    decisions:phase==='during-live'?
      ['Keep current transport during LIVE. Prefer bitrate adaptation or graceful termination; never claim seamless Bluetooth↔Wi-Fi switch.',
       'Keep local recorder independent of outgoing network failure. A restart may interrupt the LIVE.',
       wantsDifferent?'Alternative route may be tested only in a new session, if build supports it.':'No verified better alternative.']:
      ['Only use links and Internet routes verified by native measurements.',
       preferred?'Reconfirm permission, recorder and streaming destination before starting LIVE.':'No known safe camera-plus-internet route; do not start LIVE.'],
    caution:'Policy experiment, NOT an integrated native Meta transport selector or measured RTMP broadcaster.'
  };
}
/** Pure downstream video rate recommendation when source uplink weakens.
 * This adjusts the H.264 publishing profile, NOT the DAT camera link/config.
 */
export function suggestPublisherQuality({
  currentProfile='balanced',availableMbps,stable=true,
  sourceFps=24,cellular=true
}={}){
  if(!MEDIA_LEVELS.some(x=>x.name===currentProfile))throw new Error('Unknown quality profile');
  if(!validNumber(availableMbps)||!validNumber(sourceFps))return {action:'unknown_network',nextProfile:null};
  if(!stable||sourceFps<12)return {action:'warn_and_preserve_local',nextProfile:'conservative',
    reason:'Network unstable or camera frames insufficient; may interrupt LIVE'};
  const requiredFactor=cellular?LIMITS.minCellularHeadroom:LIMITS.minOtherHeadroom;
  const selected=[...MEDIA_LEVELS].reverse()
    .find(x=>x.bitrateKbps*requiredFactor<=availableMbps*1000);
  if(!selected)return {action:'warn_and_preserve_local',nextProfile:'conservative',
    reason:'Uplink insufficient even for lowest experiment profile; cannot guarantee LIVE'};
  if(selected.name===currentProfile)return {action:'hold',nextProfile:selected.name};
  return {action:MEDIA_LEVELS.indexOf(selected)<MEDIA_LEVELS.findIndex(x=>x.name===currentProfile)
    ?'reduce_publisher_bitrate':'consider_upgrade_after_stability',
    nextProfile:selected.name,
    reason:'Change only the outgoing encoder bitrate/profile when supported, not Meta link'};
}
