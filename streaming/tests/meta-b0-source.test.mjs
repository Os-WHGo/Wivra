import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(file)=>readFileSync(new URL('../ios/B0/'+file,import.meta.url),'utf8');
test('B0 is real iOS source with exact SDK dependency but not fabricated CI hardware proof',()=>{
 const project=read('project.yml'),doc=read('README.md');
 assert.match(project,/exactVersion:\s*1\.0\.1/);
 assert.match(project,/MWDATCore/);assert.match(project,/MWDATCamera/);
 assert.match(doc,/compilación Xcode para iOS Simulator completada con éxito/);
 assert.match(doc,/NO firmado\/instalado en iPhone físico/);
 assert.match(doc,/Criterio de éxito B0/);
});
test('Bluetooth camera path is explicitly configured; Wi-Fi softAP not accidentally active',()=>{
 const info=read('Info.plist');
 assert.match(info,/com\.meta\.ar\.wearable/);
 assert.match(info,/<string>external-accessory<\/string>/);
 assert.match(info,/wivrametab0:\/\//);
 assert.match(info,/NSLocalNetworkUsageDescription/);
 assert.match(info,/NSBonjourServices/);
 assert.match(info,/_bonjour\._tcp/);
 assert.doesNotMatch(info,/HotspotConfiguration|wifi-info/);
});
test('DAT registration and permission request require the actual SDK and a human choice',()=>{
 const app=read('Sources/WivraMetaB0App.swift'),model=read('Sources/MetaB0Model.swift');
 assert.match(app,/onOpenURL/);
 assert.match(model,/startRegistration\(\)/);
 assert.match(model,/handleUrl\(url\)/);
 assert.match(model,/checkPermissionStatus\(\.camera\)/);
 assert.match(model,/showCameraPermissionConfirm = true/);
 assert.match(app,/Abrir Meta AI y dar permiso/);
});
test('session and stream lifecycles request real raw preview frames',()=>{
 const source=read('Sources/MetaB0Model.swift');
 assert.match(source,/createSession\(deviceSelector:/);
 assert.match(source,/newSession\.start\(\)/);
 assert.match(source,/session\.addCamera\(config:/);
 assert.match(source,/frame\.makeUIImage\(\)/);
 assert.match(source,/videoFramePublisher/);
 assert.match(source,/framesReceived \+= 1/);
 assert.match(source,/measuredFPS/);
 assert.match(source,/resolution: economy \? \.low : \.medium/);
 assert.match(source,/frameRate: economy \? 15 : 24/);
});
test('B0 explicitly stops on thermal emergencies and when app backgrounds',()=>{
 const app=read('Sources/WivraMetaB0App.swift'),model=read('Sources/MetaB0Model.swift');
 assert.match(model,/case \.thermalHot:/);
 assert.match(model,/self\.stopPreview\(\)/);
 assert.match(app,/UIApplication\.didEnterBackgroundNotification/);
 assert.match(app,/model\.endSession\(\)/);
 assert.doesNotMatch(app,/RTMP|HaishinKit|publishLive/);
});
