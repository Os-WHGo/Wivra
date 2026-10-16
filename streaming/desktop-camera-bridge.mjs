/**
 * Wivra Desktop Camera Bridge: portable, NON-MEDIA orchestration contract.
 *
 * Wivra Mobile could someday send independently captured Ray-Ban POV and
 * phone-camera video into a single desktop scene. This module DOES NOT access
 * Meta DAT, AVFoundation, CameraX, Wi-Fi, USB, WebRTC, or a PC webcam. It only
 * specifies consent/connection/source-health gates for native adapters.
 *
 * Native adapters MUST do their own authentication, permission checks, real
 * frame observations, timestamps, transport negotiation and hardware QA.
 * Inputs to this module are reports, NOT proof of their underlying claims.
 */
const PHONE_PLATFORMS=Object.freeze(['ios','android']);
const DESKTOP_PLATFORMS=Object.freeze(['windows','macos','linux']);
const SOURCE_IDS=Object.freeze(['rayban-pov','phone-camera']);
const LAYOUTS=Object.freeze(['pov','phone','side-by-side','picture-in-picture']);
const TRANSPORT='lan-webrtc-proposed';

const validId=new Set(SOURCE_IDS);
function fail(message){throw new TypeError(message)}
function plain(value){return value!==null && typeof value==='object'&&!Array.isArray(value)}
function rejectUnknown(value,allowed,context){
  if(!plain(value)||Object.keys(value).some(k=>!allowed.includes(k)))
    fail(context+' contains invalid or sensitive fields');
}
function asBoolean(value,label){
  if(typeof value!=='boolean')fail(label+' must be boolean');
}
function freezeList(list){return Object.freeze([...list]);}

export function desktopBridgeCapabilities(){
  return Object.freeze({
    phonePlatforms:freezeList(PHONE_PLATFORMS),
    desktopPlatforms:freezeList(DESKTOP_PLATFORMS),
    sources:freezeList(SOURCE_IDS),
    layouts:freezeList(LAYOUTS),
    transports:freezeList([TRANSPORT]),
    nativeDualCaptureImplemented:false,
    nativeDesktopReceiverImplemented:false,
    nativeLANPublisherImplemented:false,
    encryptedPairingImplemented:false,
    rayBanPCSDKAvailable:false
  });
}

/**
 * Plan sources WITHOUT starting them. dualFramesVerified is a report from
 * documented physical-device diagnostics, not a claim made by this library.
 * A single remote DAT stream is not the same as AVCaptureMultiCamSession;
 * no requirement to trick or conceal the Meta app/permissions is introduced.
 */
export function createDesktopBridgePlan({
  phonePlatform='ios',
  desktopPlatform='windows',
  sources=SOURCE_IDS,
  transport=TRANSPORT,
  nativeEvidence={}
}={}){
  if(!PHONE_PLATFORMS.includes(phonePlatform))fail('Unsupported phone platform');
  if(!DESKTOP_PLATFORMS.includes(desktopPlatform))fail('Unsupported desktop platform');
  if(transport!==TRANSPORT)fail('No real bridge transport has been implemented');
  if(!Array.isArray(sources)||sources.length<1||sources.length>2||
     sources.some(id=>!validId.has(id))||
     new Set(sources).size!==sources.length)
    fail('Select unique approved sources only');
  rejectUnknown(nativeEvidence,
    ['raybanFramesVerified','phoneFramesVerified','dualFramesVerified'],
    'Native evidence');
  for(const [name,value] of Object.entries(nativeEvidence))asBoolean(value,name);
  const evidence=Object.freeze({
    raybanFramesVerified:nativeEvidence.raybanFramesVerified===true,
    phoneFramesVerified:nativeEvidence.phoneFramesVerified===true,
    dualFramesVerified:nativeEvidence.dualFramesVerified===true
  });
  if(evidence.dualFramesVerified&&
    (!evidence.raybanFramesVerified||!evidence.phoneFramesVerified))
    fail('Simultaneous capture cannot be verified without both physical feeds');
  const dualRequested=sources.length===2;
  const dualCaptureEligible=!dualRequested||evidence.dualFramesVerified;
  const warnings=[
    'This plan does not open, encode or transmit either camera. Native adapters and device permissions are required.',
    'The existing iPhone host deliberately closes one camera before opening the other; this plan does not change that behaviour.',
    'The Android Meta receiver does not yet implement a native phone-camera capture path.',
    'The proposed phone-to-desktop LAN/WebRTC link must be authenticated, encrypted and tested before use.',
    'Actual camera LEDs, operating-system indicators and user permission prompts must not be suppressed.'
  ];
  if(dualRequested&&!dualCaptureEligible)
    warnings.push('Dual camera concurrency has not been verified on a real phone; fall back to one camera without claiming two active feeds.');
  warnings.push('Independent DAT and local camera timebases require timestamp mapping and measured A/V sync; do not assume timestamps are aligned.');
  return Object.freeze({
    schemaVersion:'wivra-desktop-camera-bridge-1',
    phonePlatform,desktopPlatform,transport,
    sourceIDs:freezeList(sources),
    nativeEvidence:evidence,
    dualCaptureEligible,
    desktopBridgeLive:false,
    transportImplemented:false,
    publisherConnected:false,
    warnings:freezeList(warnings)
  });
}

/**
 * No actual networking, source start, encoding, pairing or streaming.
 * Methods are transitions driven ONLY by trusted future native callbacks.
 * Boolean inputs deliberately are not proof: the host must authenticate,
 * verify real captured frames, and obtain consent before calling us.
 */
export class DesktopBridgeSession {
  #plan;
  #state='unpaired';
  #sourceStates=new Map();
  #events=[];
  constructor(plan){
    if(!plan||plan.schemaVersion!=='wivra-desktop-camera-bridge-1')
      fail('Expected bridge plan');
    this.#plan=plan;
    for(const id of plan.sourceIDs)this.#sourceStates.set(id,'idle');
  }
  get state(){return this.#state}
  get snapshot(){
    return Object.freeze({
      state:this.#state,
      sources:Object.freeze(Object.fromEntries(this.#sourceStates)),
      activeSourceIDs:freezeList([...this.#sourceStates]
        .filter(([,status])=>status==='active').map(([id])=>id)),
      // This module never verifies actual packets/traffic on its own.
      transportMediaVerified:false,
      events:freezeList(this.#events.map(event=>Object.freeze({...event})))
    });
  }
  #record(kind,sourceID=null){
    this.#events.push(Object.freeze({kind,sourceID}));
    if(this.#events.length>100)this.#events.shift();
  }
  confirmPairing({phoneUserApproved=false,desktopUserApproved=false,
                  authenticatedEncryptedPeerVerified=false}={}){
    if(this.#state!=='unpaired')fail('Pairing is not in an unpaired state');
    if(!phoneUserApproved||!desktopUserApproved||
       !authenticatedEncryptedPeerVerified)
      fail('Both users must approve an authenticated encrypted desktop pairing');
    this.#state='paired';this.#record('native-pairing-confirmed');
  }
  confirmTransport({nativeLANMediaChannelVerified=false}={}){
    if(this.#state!=='paired')fail('A paired desktop is required');
    if(!nativeLANMediaChannelVerified)
      fail('An independently verified native media channel is required');
    this.#state='connected';this.#record('native-channel-confirmed');
  }
  confirmSourceFrames(id,{userEnabled=false,nativeCameraPermissionVerified=false,
                           nativeFramesObserved=false}={}){
    if(this.#state!=='connected')fail('Desktop receiver must be connected');
    if(!this.#sourceStates.has(id))fail('Source is not present in this plan');
    if(!userEnabled||!nativeCameraPermissionVerified||!nativeFramesObserved)
      fail('Source needs explicit user enablement, permission and real frames');
    const otherActive=[...this.#sourceStates].some(([other,state])=>
      other!==id&&state==='active');
    if(otherActive&&!this.#plan.dualCaptureEligible)
      fail('Concurrent feeds require physical dual-camera verification');
    this.#sourceStates.set(id,'active');this.#record('source-frames-observed',id);
  }
  nativeSourceInterrupted(id){
    if(!this.#sourceStates.has(id))fail('Unknown source');
    if(this.#state!=='connected')fail('No connected bridge');
    this.#sourceStates.set(id,'interrupted');
    this.#record('source-interrupted',id);
    // Do not stop an unrelated camera or clear its original local archive.
  }
  stopSource(id,{userRequested=false}={}){
    if(!this.#sourceStates.has(id))fail('Unknown source');
    if(!userRequested)fail('Manual source stop requires explicit user action');
    this.#sourceStates.set(id,'idle');this.#record('source-stopped-by-user',id);
  }
  disconnect(){
    if(this.#state==='stopped')return;
    this.#state='stopped';
    for(const id of this.#sourceStates.keys())
      this.#sourceStates.set(id,'idle');
    this.#record('desktop-bridge-disconnected');
    // Disconnected remote streams never imply deletion of phone captures.
  }
  proposeScene(layout='picture-in-picture'){
    if(!LAYOUTS.includes(layout))fail('Unsupported scene layout');
    const active=this.snapshot.activeSourceIDs;
    const wanted=layout==='pov'?['rayban-pov']:
      layout==='phone'?['phone-camera']:SOURCE_IDS;
    const visible=wanted.filter(id=>active.includes(id));
    return Object.freeze({
      requestedLayout:layout,
      effectiveLayout:visible.length===0?'no-video':
        visible.length===1?(wanted.length===1?layout:'single-camera'):layout,
      visibleSourceIDs:freezeList(visible),
      fallbackUsed:visible.length<wanted.length,
      liveStarted:false,
      videoMixed:false
    });
  }
}
