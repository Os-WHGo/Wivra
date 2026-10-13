import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_FAMILIES,describeFamily,assessCameraDevice,planCameraAction,importPolicy} from '../camera-source-registry.mjs';
const probe=(family,firmware,verifiedActions)=>({fromNativeBridge:true,deviceVerified:true,family,firmware,verifiedActions});
test('source registry includes glasses, action cameras, 360, phone and unknowns',()=>{
 assert.ok(SOURCE_FAMILIES.includes('meta-wearables'));
 assert.ok(SOURCE_FAMILIES.includes('gopro-open'));
 assert.ok(SOURCE_FAMILIES.includes('insta360'));
 assert.ok(SOURCE_FAMILIES.includes('ricoh-theta'));
 assert.ok(SOURCE_FAMILIES.includes('generic-camera'));
});
test('documentation alone never means runtime feature implemented',()=>{
 for(const family of SOURCE_FAMILIES){
  const a=assessCameraDevice({family,userConsentForMedia:true});
  assert.equal(a.deviceVerified,false);
  assert.equal(a.liveReady,false);
  assert.equal(a.directRecordedMediaImportReady,false);
 }
});
test('Meta DAT can record live to app; old native videos cannot be fetched via SDK',()=>{
 const family='meta-wearables',firmware='test-fw';
 const a=assessCameraDevice({family,firmware,userConsentForMedia:true,phoneUplinkVerified:true,
  nativeProbe:probe(family,firmware,['camera_preview','local_record_from_preview','download_remote_media','broadcast_live'])});
 assert.equal(a.capabilities.camera_preview.usableNow,true);
 assert.equal(a.capabilities.local_record_from_preview.usableNow,true);
 assert.equal(a.capabilities.download_remote_media.usableNow,false);
 assert.equal(a.directRecordedMediaImportReady,false);
 assert.equal(planCameraAction(a,'download_remote_media').ok,false);
 assert.match(planCameraAction(a,'download_remote_media').alternative,/Photos\/Files/);
});
test('GoPro media download and native live are separate verified capabilities',()=>{
 const family='gopro-open',firmware='H13-test';
 const a=assessCameraDevice({family,firmware,userConsentForMedia:true,
   nativeProbe:probe(family,firmware,['browse_remote_media','download_remote_media','camera_preview'])});
 assert.equal(a.directRecordedMediaImportReady,true);
 assert.equal(a.liveReady,false);
 const b=assessCameraDevice({family,firmware,userConsentForMedia:true,phoneUplinkVerified:true,
   nativeProbe:probe(family,firmware,['broadcast_live'])});
 assert.equal(b.liveReady,true);
});
test('vendor SDK paperwork is not hardware proof, even when media API is documented',()=>{
 const a=describeFamily('insta360');
 assert.equal(a.capabilities.download_remote_media.status,'vendor_sdk_access_required');
 assert.equal(a.usableWithoutHardwareProbe,false);
});
test('Ricoh MJPEG preview is NOT automatically an audio+RTMP stream',()=>{
 const family='ricoh-theta',firmware='x-test';
 const a=assessCameraDevice({family,firmware,userConsentForMedia:true,
  phoneUplinkVerified:true,nativeProbe:probe(family,firmware,['camera_preview'])});
 assert.equal(a.capabilities.camera_preview.usableNow,true);
 assert.equal(a.liveReady,false);
 assert.equal(a.capabilities.broadcast_live.usableNow,false);
});
test('DJI vendor app preview cannot be claimed as own SDK without a probe',()=>{
 const a=assessCameraDevice({family:'dji-osmo-action',userConsentForMedia:true});
 assert.equal(a.capabilities.camera_preview.usableNow,false);
});
test('no media access or live without consent, actual connection, and verified outgoing network',()=>{
 const family='meta-wearables',firmware='B';
 const nativeProbe=probe(family,firmware,['camera_preview','broadcast_live']);
 assert.equal(assessCameraDevice({family,firmware,nativeProbe,userConsentForMedia:false,phoneUplinkVerified:true}).liveReady,false);
 assert.equal(assessCameraDevice({family,firmware,nativeProbe,userConsentForMedia:true,phoneUplinkVerified:false}).liveReady,false);
 assert.equal(assessCameraDevice({family,firmware:'mismatch',nativeProbe,userConsentForMedia:true,phoneUplinkVerified:true}).deviceVerified,false);
});
test('future-proof 360 media preserves original format and demands reframe pipeline',()=>{
 const p=importPolicy({family:'insta360',sourceFile:'holiday.insv',kind:'video',panorama:true,mediaPermission:true});
 assert.equal(p.preserveOriginal,true);
 assert.equal(p.needsStitchingOrReframe,true);
 assert.equal(p.exportedForEditing,false);
 assert.match(p.representation,/spherical/);
});
test('safe planning does not actually issue camera API calls',()=>{
 const family='phone-camera',firmware='ios-test';
 const a=assessCameraDevice({family,firmware,userConsentForMedia:true,
   nativeProbe:probe(family,firmware,['manual_file_import'])});
 assert.equal(planCameraAction(a,'manual_file_import').ok,true);
 assert.equal(planCameraAction(a,'manual_file_import').needsUserAction,true);
 assert.equal(planCameraAction(a,'broadcast_live').ok,false);
});
