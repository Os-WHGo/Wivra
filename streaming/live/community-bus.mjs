// Wivra LIVE B2C · deterministic, local-only community / monitor planner.
// Receives *verified* adapter events; does NOT connect to providers, use OAuth,
// synthesize speech, route physical audio, or emit a public livestream.
// No dependencies, hooks, remote scripts, secrets or external requests.

export const COMMUNITY_SCHEMA = 'wivra-live-community-v1';
export const COMMUNITY_PROVIDERS = Object.freeze(['youtube', 'twitch', 'kick', 'tiktok', 'custom']);
export const COMMUNITY_KINDS = Object.freeze(['chat', 'follow', 'subscription', 'donation', 'gift']);
export const COMMUNITY_ROLES = Object.freeze(['viewer', 'follower', 'subscriber', 'moderator', 'owner']);
const roleRank = {viewer:0, follower:1, subscriber:2, moderator:3, owner:4};
const kindWeight = {chat:10, follow:40, subscription:75, gift:90, donation:100};
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const inList = (list,x) => list.includes(x);
const nonnegative = x => Number.isSafeInteger(x) && x >= 0;
const finite = x => typeof x === 'number' && Number.isFinite(x);
const refuse = s => { throw new Error(s); };

// Display text is user generated. Never treat it as a URL, command, HTML, SSML,
// role, system prompt, or evidence of a payment.
function clean(value,limit) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g,' ')
    .replace(/\s+/g,' ').trim().slice(0,limit);
}
function safeId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_.:-]{1,110}$/.test(id);
}
export function createCommunityPolicy(options={}) {
  if (!isObj(options)) refuse('Invalid community policy.');
  const mode=options.mode ?? 'balanced';
  const readEnabled=options.readEnabled ?? false;
  const alertSounds=options.alertSounds ?? true;
  const readDestination=options.readDestination ?? 'monitor';
  const alertDestination=options.alertDestination ?? 'monitor';
  const publicAudioConsent=options.publicAudioConsent ?? false;
  const minRole=options.minRole ?? {};
  const minDelayMs=options.minDelayMs ?? 4000;
  const cooldownMs=options.cooldownMs ?? 6500;
  const maxAgeMs=options.maxAgeMs ?? 45000;
  const maxQueue=options.maxQueue ?? 40;
  if (!inList(['quiet','balanced','all'],mode) ||
      typeof readEnabled!=='boolean' || typeof alertSounds!=='boolean' ||
      typeof publicAudioConsent!=='boolean' ||
      !inList(['off','monitor','program','both'],readDestination) ||
      !inList(['off','monitor','program','both'],alertDestination) ||
      !isObj(minRole) || !nonnegative(minDelayMs) || minDelayMs>120000 ||
      !nonnegative(cooldownMs) || cooldownMs>120000 ||
      !nonnegative(maxAgeMs) || maxAgeMs<1000 || maxAgeMs>600000 ||
      !Number.isInteger(maxQueue) || maxQueue<1 || maxQueue>100)
    refuse('Community policy values out of range.');
  if (((readDestination==='program'||readDestination==='both') ||
       (alertDestination==='program'||alertDestination==='both')) && !publicAudioConsent)
    refuse('Public chat/audio requires explicit consent.');
  const roles={};
  for(const provider of COMMUNITY_PROVIDERS) {
    const role=minRole[provider] ?? 'viewer';
    if(!inList(COMMUNITY_ROLES,role)) refuse('Invalid per-platform minimum role.');
    roles[provider]=role;
  }
  if(Object.keys(minRole).some(k=>!inList(COMMUNITY_PROVIDERS,k)))
    refuse('Unknown provider in community policy.');
  return Object.freeze({schema:COMMUNITY_SCHEMA,mode,readEnabled,alertSounds,
    readDestination,alertDestination,publicAudioConsent,
    minRole:Object.freeze(roles),minDelayMs,cooldownMs,maxAgeMs,maxQueue});
}

// Providers must verify OAuth/EventSub/webhook origin/authorization themselves.
// Deliberately accept a separate adapterVerified argument rather than trusting
// a "verified" field inside a remote payload. Unverified events are rejected.
export function normalizeCommunityEvent(payload,{adapterVerified=false,receivedAtMs}={}) {
  if(!adapterVerified) refuse('Unverified provider event.');
  if(!isObj(payload) || !inList(COMMUNITY_PROVIDERS,payload.provider) ||
      !inList(COMMUNITY_KINDS,payload.kind) || !safeId(payload.id) ||
      !nonnegative(receivedAtMs)) refuse('Invalid community event.');
  const author=isObj(payload.author)?payload.author:{};
  const role=author.role ?? 'viewer';
  if(!inList(COMMUNITY_ROLES,role)) refuse('Unknown or unverified author role.');
  const display=clean(author.display,60) || 'Visitante';
  const text=clean(payload.text,350);
  if(payload.kind==='chat' && !text) refuse('Empty chat message.');
  let contribution=null;
  if(payload.contribution!==undefined && payload.contribution!==null) {
    const c=payload.contribution;
    if(!isObj(c) || !Number.isSafeInteger(c.amountMinor) || c.amountMinor<0 ||
       typeof c.currency!=='string' || !/^[A-Z]{3}$/.test(c.currency))
      refuse('Invalid contribution; do not infer amount or currency.');
    contribution={amountMinor:c.amountMinor,currency:c.currency};
  }
  if(payload.kind==='donation' && !contribution)
    refuse('Donation requires verified amount and currency.');
  return Object.freeze({
    id:payload.id,provider:payload.provider,kind:payload.kind,
    display,role,text,contribution,receivedAtMs
  });
}
export function eventPriority(event) {
  return kindWeight[event.kind] + roleRank[event.role]*6;
}
function eligible(event,policy) {
  if(event.kind!=='chat') return policy.mode==='quiet'
    ? inList(['donation','gift','subscription'],event.kind):true;
  if(!policy.readEnabled || policy.readDestination==='off' || policy.mode==='quiet')
    return false;
  if(eventPriority(event)<0) return false;
  if(roleRank[event.role]<roleRank[policy.minRole[event.provider]]) return false;
  if(policy.mode==='balanced' && roleRank[event.role]<roleRank.subscriber) return false;
  return true;
}
function phrase(event) {
  // No SSML/HTML evaluation. Synthesis adapter must treat this as plain text.
  const prefix=event.provider+' · '+event.display;
  switch(event.kind) {
    case 'chat': return clean(prefix+': '+event.text,410);
    case 'follow': return clean(prefix+' comenzó a seguirte.',410);
    case 'subscription': return clean(prefix+' se suscribió.',410);
    case 'gift': return clean(prefix+' envió un regalo.',410);
    case 'donation': return clean(prefix+' envió una contribución'+
      (event.contribution?' ('+event.contribution.currency+' '+(event.contribution.amountMinor/100).toFixed(2)+')':'')+
      (event.text?': '+event.text:'.'),410);
  }
}

export function createCommunityQueue(policy=createCommunityPolicy()) {
  if(!isObj(policy)||policy.schema!==COMMUNITY_SCHEMA) refuse('Invalid community policy.');
  return {schema:COMMUNITY_SCHEMA,policy,entries:[],seen:[],lastSpokenAtMs:null};
}
function dropOld(entries,nowMs,maxAgeMs) {
  return entries.filter(e=>nowMs-e.receivedAtMs<=maxAgeMs);
}
export function enqueueCommunity(state,payload,{adapterVerified=false,nowMs}={}) {
  if(!isObj(state)||state.schema!==COMMUNITY_SCHEMA || !nonnegative(nowMs))
    refuse('Invalid queue/time.');
  const event=normalizeCommunityEvent(payload,{adapterVerified,receivedAtMs:nowMs});
  const key=event.provider+':'+event.id;
  if(state.seen.includes(key)) return {...state,accepted:false,reason:'duplicate'};
  // Keep a bounded set of IDs even for items intentionally omitted from speech.
  const seen=[...state.seen,key].slice(-300);
  const entries=dropOld(state.entries,nowMs,state.policy.maxAgeMs);
  if(!eligible(event,state.policy))
    return {...state,seen,entries,accepted:false,reason:'policy'};
  const item={...event,key,priority:eventPriority(event),notBeforeMs:nowMs+state.policy.minDelayMs,
    say:phrase(event),
    destination:event.kind==='chat'?state.policy.readDestination:
      (state.policy.readEnabled?state.policy.readDestination:'off'),
    alertDestination: event.kind==='chat' || !state.policy.alertSounds?
      'off':state.policy.alertDestination
  };
  // Priority queue: higher first; old first within same priority; trim lowest.
  const sorted=[...entries,item].sort((a,b)=>b.priority-a.priority||a.receivedAtMs-b.receivedAtMs);
  const kept=sorted.slice(0,state.policy.maxQueue);
  return {...state,seen,entries:kept,accepted:kept.some(x=>x.key===key),
    reason:kept.some(x=>x.key===key)?'queued':'capacity'};
}
export function nextCommunityCue(state,{nowMs,monitorReady=false,programReady=false,
  safeToSpeak=false}={}) {
  if(!isObj(state)||state.schema!==COMMUNITY_SCHEMA||!nonnegative(nowMs))
    refuse('Invalid queue/time.');
  const entries=dropOld(state.entries,nowMs,state.policy.maxAgeMs);
  const canUse=destination => destination==='off' || destination==='monitor'&&monitorReady ||
    destination==='program'&&programReady || destination==='both'&&monitorReady&&programReady;
  const cooled=state.lastSpokenAtMs===null ||
    nowMs-state.lastSpokenAtMs>=state.policy.cooldownMs;
  if(!safeToSpeak || !cooled)
    return {state:{...state,entries},cue:null,reason:!safeToSpeak?'safety-paused':'cooldown'};
  const idx=entries.findIndex(e=>e.notBeforeMs<=nowMs &&
    (e.destination!=='off'||e.alertDestination!=='off') &&
    canUse(e.destination) && canUse(e.alertDestination));
  if(idx<0) return {state:{...state,entries},cue:null,reason:'not-ready'};
  const entry=entries[idx];
  const rest=entries.filter((_,i)=>i!==idx);
  // This is an INTENT only: a native adapter must validate actual output route
  // and only mark monitor/program ready after a successful AVAudioSession route.
  const cue={eventKey:entry.key,kind:entry.kind,provider:entry.provider,
    priority:entry.priority,text:entry.destination==='off'?null:entry.say,
    ttsDestination:entry.destination,alertDestination:entry.alertDestination,
    overlay:{kind:entry.kind,display:entry.display,text:entry.text,provider:entry.provider}};
  return {state:{...state,entries:rest,lastSpokenAtMs:nowMs},cue,reason:'selected'};
}
export function planLiveAudioRoute({
  availableInputs=[],selectedInputId=null,activeInputId=null,
  availableOutputs=[],monitorOutputId='system',streamOutputId='encoder'
}={}) {
  if(!Array.isArray(availableInputs)||!Array.isArray(availableOutputs) ||
     !inList(['system',...availableOutputs],monitorOutputId) ||
     streamOutputId!=='encoder')
    refuse('Invalid audio output routing request.');
  const cleanList=x=>x.filter(v=>typeof v==='string'&&safeId(v));
  const inputs=cleanList(availableInputs),outputs=cleanList(availableOutputs);
  if(selectedInputId!==null && (!safeId(selectedInputId)||!inputs.includes(selectedInputId)))
    refuse('Selected mic must be detected by iOS.');
  if(monitorOutputId!=='system' && !outputs.includes(monitorOutputId))
    refuse('Monitor output is not available.');
  return {
    captureInputId:selectedInputId,
    inputVerified:selectedInputId!==null&&selectedInputId===activeInputId,
    monitorOutputIntent:monitorOutputId,
    streamAudioBus:'encoder',
    publicMonitorLeakPrevented:true,
    // Does NOT choose Bluetooth profiles or override AVAudioSession. iOS is
    // responsible for verifying the real route and can deny arbitrary outputs.
    requiresNativeRouteConfirmation:true
  };
}
