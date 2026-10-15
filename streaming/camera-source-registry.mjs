/**
 * Wivra / AgentCut: camera-source capability discovery and safe operation
 * contracts. Facts map the *documented existence* of a vendor API, NOT that an
 * adapter is implemented, supported on a particular phone, or verified.
 * The native bridge must prove each capability for the actual model/firmware.
 * — ChatGPT, 2026-10-13
 */
export const SOURCE_FAMILIES=Object.freeze(['phone-camera','meta-wearables','gopro-open','insta360','ricoh-theta','dji-osmo-action','generic-camera']);
export const ACTIONS=Object.freeze(['manual_file_import','browse_remote_media','download_remote_media','camera_preview','broadcast_live','record_remote','local_record_from_preview','control_camera']);
export const STATUS=Object.freeze(['supported_by_vendor_api','vendor_sdk_access_required','not_verified','not_exposed_in_public_sdk','requires_model_validation']);
const cap=(status,source)=>Object.freeze({status,source});
/** These are research anchors. They are NOT a promise of integration. */
export const DOCUMENTED_CAPABILITIES=Object.freeze({
 'phone-camera':{
  manual_file_import:cap('supported_by_vendor_api','native OS document picker'),
  camera_preview:cap('supported_by_vendor_api','native phone camera APIs'),
  broadcast_live:cap('requires_model_validation','iOS/Android encoder adapter'),
  local_record_from_preview:cap('requires_model_validation','native file writer')
 },
 'meta-wearables':{
  manual_file_import:cap('supported_by_vendor_api','iOS/Android Photos/Files AFTER Meta AI export'),
  browse_remote_media:cap('not_exposed_in_public_sdk','DAT v1.0 camera SDK; see Meta discussion #28'),
  download_remote_media:cap('not_exposed_in_public_sdk','DAT v1.0 camera SDK; see Meta discussion #28'),
  camera_preview:cap('supported_by_vendor_api','Meta DAT Camera.stream'),
  local_record_from_preview:cap('supported_by_vendor_api','Meta DAT CameraAccess HEVC AVAssetWriter sample'),
  broadcast_live:cap('requires_model_validation','DAT HEVC -> phone H264/AAC RTMPS publisher'),
  control_camera:cap('supported_by_vendor_api','Meta DAT device session and camera')
 },
 'gopro-open':{
  manual_file_import:cap('supported_by_vendor_api','Photos/Files/USB transfer'),
  browse_remote_media:cap('supported_by_vendor_api','Open GoPro Wi-Fi HTTP media endpoints'),
  download_remote_media:cap('supported_by_vendor_api','Open GoPro media HTTP download'),
  camera_preview:cap('supported_by_vendor_api','Open GoPro UDP MPEG-TS WiFi/USB'),
  broadcast_live:cap('supported_by_vendor_api','supported GoPro native RTMP(S) live, STA/AP constraints'),
  control_camera:cap('supported_by_vendor_api','Open GoPro BLE and HTTP API'),
  record_remote:cap('supported_by_vendor_api','Open GoPro start/stop recording')
 },
 'insta360':{
  manual_file_import:cap('supported_by_vendor_api','select exported media, preserve 360 data'),
  browse_remote_media:cap('vendor_sdk_access_required','Insta360 Camera SDK authorization'),
  download_remote_media:cap('vendor_sdk_access_required','Insta360 Camera SDK media API'),
  camera_preview:cap('vendor_sdk_access_required','Insta360 camera preview SDK'),
  broadcast_live:cap('requires_model_validation','model and panorama streaming mode'),
  control_camera:cap('vendor_sdk_access_required','approved Camera SDK')
 },
 'ricoh-theta':{
  manual_file_import:cap('supported_by_vendor_api','select equirectangular/spherical media'),
  browse_remote_media:cap('supported_by_vendor_api','RICOH THETA OSC API listFiles'),
  download_remote_media:cap('supported_by_vendor_api','RICOH THETA OSC HTTP media URLs'),
  camera_preview:cap('supported_by_vendor_api','RICOH THETA getLivePreview MJPEG'),
  broadcast_live:cap('requires_model_validation','MJPEG preview != A/V RTMP/RTMPS publisher'),
  control_camera:cap('supported_by_vendor_api','RICOH THETA Web API')
 },
 'dji-osmo-action':{
  manual_file_import:cap('supported_by_vendor_api','phone Files/Photos, removable media'),
  browse_remote_media:cap('not_verified','model-specific third-party SDK access'),
  download_remote_media:cap('not_verified','model-specific third-party SDK access'),
  camera_preview:cap('not_verified','DJI Mimo preview not a public third-party SDK guarantee'),
  broadcast_live:cap('not_verified','DJI Osmo Action third-party access must be established'),
  control_camera:cap('not_verified','DJI Osmo Action third-party access must be established')
 },
 'generic-camera':{
  manual_file_import:cap('supported_by_vendor_api','OS permitted file picker and USB storage'),
  browse_remote_media:cap('not_verified','requires a published vendor API or supported protocol'),
  download_remote_media:cap('not_verified','requires a published vendor API or supported protocol'),
  camera_preview:cap('not_verified','requires compatible UVC, RTSP, Wi-Fi, vendor SDK etc.'),
  broadcast_live:cap('not_verified','requires real compatible A/V stream + phone encoder'),
  control_camera:cap('not_verified','Bluetooth pairing alone does not expose camera video')
 }
});
const exists=(f,a)=>!!DOCUMENTED_CAPABILITIES[f]?.[a];
const error=message=>{throw new Error(message)};
export function describeFamily(family){
 if(!SOURCE_FAMILIES.includes(family))error('Unknown camera family');
 return {family,capabilities:{...DOCUMENTED_CAPABILITIES[family]},
  usableWithoutHardwareProbe:false,
  legalCaution:'SDK terms and exact camera firmware must be verified before shipping.'};
}
/**
 * This module never declares a real device ready unless a native plugin
 * provided a signed/verified result for THIS device. The caller owns the
 * validity of nativeProbe, not an LLM or a plain user prompt.
 */
export function assessCameraDevice({
 family,model='',firmware='',nativeProbe=null,
 userConsentForMedia=false,phoneUplinkVerified=false
}={}){
 if(!SOURCE_FAMILIES.includes(family))error('Unknown camera family');
 if(typeof model!=='string'||model.length>140||typeof firmware!=='string'||firmware.length>100)error('Invalid device descriptor');
 const consent=userConsentForMedia===true;
 const p=nativeProbe&&nativeProbe.fromNativeBridge===true&&
   nativeProbe.deviceVerified===true&&
   nativeProbe.family===family&&
   nativeProbe.firmware===firmware&&
   Array.isArray(nativeProbe.verifiedActions)?nativeProbe:null;
 const verified=new Set(p?.verifiedActions?.filter(a=>ACTIONS.includes(a)&&exists(family,a))||[]);
 const capabilities=Object.fromEntries(ACTIONS.map(action=>{
  const documented=DOCUMENTED_CAPABILITIES[family][action]??cap('not_verified','not documented');
  // Fundamental: a native bridge must verify support; documentation alone is insufficient.
  let available=!!p&&consent&&verified.has(action)&&
     documented.status!=='not_exposed_in_public_sdk';
  if(action==='broadcast_live'&&!phoneUplinkVerified&&family!=='gopro-open')
     available=false; // direct external GoPro native RTMP route has separate network gate below
  if(action==='broadcast_live'&&family==='gopro-open'&&!phoneUplinkVerified)
     available=false; // explicit uplink/network verification still mandatory.
  return [action,{documented:documented.status,source:documented.source,
     usableNow:available,reason:!consent?'user media permission required':!p?'native device/firmware not verified':
       !verified.has(action)?'native adapter did not confirm capability':
       !available?'uplink or SDK limitation not cleared':'validated by device-specific adapter'}];
 }));
 return {
  family,model,firmware,deviceVerified:!!p,
  consentForMedia:consent,
  capabilities,liveReady:capabilities.broadcast_live.usableNow,
  directRecordedMediaImportReady:capabilities.download_remote_media.usableNow,
  note:'Capability handshakes are not native implementations and do not initiate recording, download or streaming.'
 };
}
/** Return a safe staged route, never pretend the phone imported a camera file. */
export function planCameraAction(assessment,action){
 if(!assessment||!SOURCE_FAMILIES.includes(assessment.family)||!ACTIONS.includes(action))error('Invalid plan request');
 const capab=assessment.capabilities?.[action];
 if(!capab?.usableNow)return {ok:false,action,
   reason:capab?.reason||'unsupported action',
   alternative:action==='download_remote_media'?'Use a user-selected file from Photos/Files after official camera transfer.':
    action==='broadcast_live'?'Try importing an existing video or a phone camera while vendor live transport is unverified.':
     'Ask for supported device permissions or select a media file manually.'};
 return {ok:true,action,family:assessment.family,
  needsUserAction:true,
  instruction:'Execute through the native SDK adapter only after user confirmation; never initiate from an unauthenticated AI response.'};
}
export function importPolicy({family,kind='video',panorama=false,sourceFile='',mediaPermission=false}={}){
 if(!SOURCE_FAMILIES.includes(family)||!['video','photo'].includes(kind))error('Invalid media source');
 if(typeof sourceFile!=='string'||sourceFile.length>400)error('Invalid filename');
 return {family,kind,sourceFile,mediaPermissionGranted:mediaPermission===true,
  preserveOriginal:true,originalIsImmutable:true,
  representation:panorama?'spherical-equirectangular-original-plus-editable-reframed-view':'standard-source-file',
  needsStitchingOrReframe:panorama,
  noFullTranscodeByDefault:true,
  exportedForEditing:false,
  warning:'360 data may require vendor stitching/dewarp; do not flatten or overwrite original automatically.'};
}
