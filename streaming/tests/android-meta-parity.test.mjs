import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const androidGradle=readFileSync(new URL('../android/app/build.gradle',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');
const iOSProject=readFileSync(new URL('../ios/B0/project.yml',import.meta.url),'utf8');
const sharedEditor=readFileSync(new URL('../android/app/src/main/java/com/oswhgo/wivra/MainActivity.java',import.meta.url),'utf8');
const policy=readFileSync(new URL('../../docs/WIVRA_PLATFORM_PARITY_IOS_ANDROID.md',import.meta.url),'utf8');

test('Both iOS and Android declare the official Ray-Ban Meta camera SDK',()=>{
  assert.match(androidGradle,/com\.meta\.wearable:mwdat-core:1\.0\.1/);
  assert.match(androidGradle,/com\.meta\.wearable:mwdat-camera:1\.0\.1/);
  assert.match(iOSProject,/meta-wearables-dat-ios/);
  assert.match(iOSProject,/exactVersion:\s*1\.0\.1/);
});
test('Android Meta SDK telemetry defaults to opted out; no fabricated Meta account ID',()=>{
  assert.match(manifest,/com\.meta\.wearable\.mwdat\.ANALYTICS_OPT_OUT" android:value="true"/);
  assert.match(manifest,/com\.meta\.wearable\.mwdat\.CRASH_REPORTING_OPT_OUT" android:value="true"/);
  assert.doesNotMatch(manifest,/com\.meta\.wearable\.mwdat\.APPLICATION_ID" android:value="(?!\$\{)/);
});
test('Android keeps Claude shared editor; DAT declared does not imply connection completed',()=>{
  assert.match(sharedEditor,/file:\/\/\/android_asset\/agentcut\.html/);
  assert.match(policy,/conexi[oó]n PENDIENTE/);
  assert.match(policy,/igualdad de objetivos/i);
});

test('Android has a real DAT lifecycle screen, not just a declared dependency',()=>{
 const preview=readFileSync(new URL('../android/app/src/main/java/com/oswhgo/wivra/WivraMetaPreviewActivity.kt',import.meta.url),'utf8');
 assert.match(preview,/Wearables\.initialize\(applicationContext\)/);
 assert.match(preview,/Wearables\.startRegistration\(this\)/);
 assert.match(preview,/Wearables\.createSession\(AutoDeviceSelector\(\)\)/);
 assert.match(preview,/Wearables\.checkPermissionStatus\(Permission\.CAMERA\)/);
 assert.match(preview,/Wearables\.RequestPermissionContract\(\)/);
 assert.match(preview,/DeviceSessionState\.STARTED/);
 assert.match(preview,/connected\.addCamera\(/);
 assert.match(preview,/active\.videoStream\.collect/);
 assert.match(preview,/active\.start\(\)/);
 assert.match(preview,/session\?\.stop\(\)/);
 assert.match(preview,/scope\.cancel\(\)/);
 assert.doesNotMatch(preview,/startRecording\(/);
 assert.doesNotMatch(preview,/live\.start/);
 const activity=readFileSync(new URL('../android/app/src/main/java/com/oswhgo/wivra/MainActivity.java',import.meta.url),'utf8');
 assert.match(activity,/WivraMetaPreviewActivity\.class/);
 assert.match(activity,/file:\/\/\/android_asset\/agentcut\.html/);
});
