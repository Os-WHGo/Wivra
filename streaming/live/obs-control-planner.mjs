// Wivra LIVE B2C · OBS-style operator control schema, no publisher/runtime.
// Safe effect references are local & declarative, never scripts or remote URLs.
export const CONTROL_SCHEMA='wivra-live-operator-v1';
const validId=v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(v);
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const supportedProviders=['youtube','twitch','kick','tiktok','custom'];
const allowedEffects=['cut','fade','slide','zoom','blur','grayscale','caption','sticker'];
function reject(s){throw new Error(s);}
export function createOperatorPanel({
 canvas='9:16',previewSceneId=null,programSceneId=null,
 sceneIds=[],effectLibrary=[],selectedEffect='cut',fadeMs=300,
 destinations=[]
}={}) {
 if(!['9:16','16:9','1:1','4:5'].includes(canvas)||!Array.isArray(sceneIds) ||
    sceneIds.some(x=>!validId(x))||new Set(sceneIds).size!==sceneIds.length||
    sceneIds.length>64 || !Array.isArray(effectLibrary) ||
    effectLibrary.some(x=>!allowedEffects.includes(x))||
    !allowedEffects.includes(selectedEffect)||!Number.isInteger(fadeMs)||
    fadeMs<0||fadeMs>5000) reject('Invalid OBS-style scene/effect settings.');
 if((previewSceneId!==null&&!sceneIds.includes(previewSceneId)) ||
    (programSceneId!==null&&!sceneIds.includes(programSceneId)))
    reject('Unknown scene ID.');
 if(!Array.isArray(destinations)||destinations.length>12)reject('Too many destinations.');
 const seen=new Set();
 const targets=destinations.map(item=>{
   if(!item||!validId(item.id)||!supportedProviders.includes(item.provider)||
      !['configured','needs-authorization','not-supported','disabled'].includes(item.status)||
      seen.has(item.id))reject('Invalid stream destination.');
   seen.add(item.id);
   // Connection secrets, RTMP URLs and tokens MUST remain in native secure store.
   // Do not accept or echo them into the reusable control document.
   if(Object.keys(item).some(k=>/key|token|secret|password|url|credential/i.test(k)))
     reject('Destination credentials/URLs are forbidden in panel snapshots.');
   return {id:item.id,provider:item.provider,status:item.status};
 });
 return Object.freeze({schema:CONTROL_SCHEMA,canvas,sceneIds:[...sceneIds],
   previewSceneId,programSceneId,selectedEffect,fadeMs,
   effectLibrary:[...new Set(effectLibrary)],destinations:targets,
   transport:'offline',encoderVerified:false});
}
export function planSceneTake(panel,{encoderAcknowledged=false}={}) {
 if(!panel||panel.schema!==CONTROL_SCHEMA||!panel.previewSceneId)
   reject('No scene prepared.');
 // A program TAKE is local even when encoder is absent; never mark it LIVE.
 return {...panel,programSceneId:panel.previewSceneId,
   transport:encoderAcknowledged?'awaiting-publisher':'offline',
   encoderVerified:false,transition:{kind:panel.selectedEffect,ms:panel.fadeMs},
   publicationConfirmed:false};
}
export function planVisualEffect(panel,{effect,assetId=null,locallyVerified=false}={}) {
 if(!panel||panel.schema!==CONTROL_SCHEMA||!panel.effectLibrary.includes(effect))
   reject('Effect not permitted or not installed.');
 if(['sticker'].includes(effect)&&(!validId(assetId)||!locallyVerified))
   reject('Sticker requires a locally verified asset.');
 if(assetId!==null && !validId(assetId))reject('Invalid local asset.');
 // Effect is a typed instruction; a native Metal/AVFoundation compositor
 // must report success before showing effect as executed.
 return Object.freeze({schema:'wivra-live-effect-cue-v1',effect,
   assetId:effect==='sticker'?assetId:null,needsNativeCompositor:true,
   localOnly:true,executed:false});
}
export function destinationReadiness(panel,confirmedNativeTargets=[]) {
 if(!panel||panel.schema!==CONTROL_SCHEMA||!Array.isArray(confirmedNativeTargets))
    reject('Invalid destination readiness check.');
 const confirmed=new Set(confirmedNativeTargets);
 return panel.destinations.map(d=>({
   id:d.id,provider:d.provider,configured:d.status==='configured',
   nativeConfirmed:d.status==='configured'&&confirmed.has(d.id),
   // Native encoder acknowledgement alone cannot demonstrate a platform ingest
   // is reachable, monetization/chat auth, or a complete multistream broadcast.
   platformLiveVerified:false
 }));
}
