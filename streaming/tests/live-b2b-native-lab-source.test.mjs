import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createStudioState,preflightScene,cueScene,takePreview,makeEditingLog} from '../live/scene-deck.mjs';

const fixture=JSON.parse(readFileSync(new URL('../live/b2b-native-lab-fixtures.json',import.meta.url),'utf8'));
const native=readFileSync(new URL('../ios/B0/Sources/WivraLiveNativeSceneLab.swift',import.meta.url),'utf8');
const shell=readFileSync(new URL('../ios/B0/Sources/WivraMetaB0App.swift',import.meta.url),'utf8');
const sdk=readFileSync(new URL('../ios/B0/Sources/MetaB0Model.swift',import.meta.url),'utf8');

test('nativo y planner comparten tres escenas identificables, lienzo y títulos verificables',()=>{
 const s=createStudioState(fixture);
 assert.deepEqual(s.scenes.map(x=>x.id),['walk','news','walk-title']);
 for(const id of s.scenes.map(x=>x.id)) assert.ok(native.includes(id),'iOS missing '+id);
 assert.ok(native.includes('WIVRA · ESCENA DE PRUEBA'));
 assert.ok(!native.includes('WIVRA · EN DIRECTO'));
 assert.equal(s.canvas,'9:16');
});

test('la escena solo CG está disponible sin cámara; las dos POV requieren fuente DAT',()=>{
 const s=createStudioState(fixture);
 assert.equal(preflightScene(s,'news').ok,true);
 assert.equal(preflightScene(s,'walk').ok,false);
 assert.equal(preflightScene(s,'walk-title').ok,false);
 assert.deepEqual(preflightScene(s,'walk',{readyCameraInputs:['rayban-dat']}),{ok:true,problems:[]});
 let v=cueScene(s,'news',5);
 v=takePreview(v,9);
 assert.equal(v.programSceneId,'news');
 assert.equal(v.transport.status,'offline');
 assert.equal(makeEditingLog(v).mediaRecorded,false);
});

test('escenas iPhone aparecen mediante sheet sin lanzar capture/stream de forma autónoma',()=>{
 assert.match(shell,/Button\("B2B · Abrir laboratorio LIVE \(local\)"/);
 assert.match(shell,/WivraLiveNativeSceneLab\(/);
 assert.match(shell,/cameraFrame:\s*model\.previewImage/);
 assert.match(shell,/cameraVerified:\s*model\.hasPreview\s*&&\s*!model\.receiveCompressedHEVC/);
 assert.match(native,/guard cameraVerified, cameraFrame != nil, let last = cameraLastFrameUptime/);
 assert.match(shell,/cameraLastFrameUptime:\s*model\.lastRawFrameUptime/);
 assert.match(sdk,/lastRawFrameUptime = ProcessInfo\.processInfo\.systemUptime/);
 assert.match(sdk,/lastRawFrameUptime = nil/);
 assert.match(native,/guard canUse\(scene\) else/);
 assert.match(native,/program = scene/);
 assert.match(native,/guard let scene = staged else/);
});

test('UI no finge RTMP, ni usurpa el pipeline HEVC/B1D o su stream',()=>{
 assert.match(native,/Sin RTMP, sin audio mezclado ni grabación/);
 assert.match(native,/NO se está transmitiendo/);
 assert.match(native,/modo \.raw/);
 assert.match(sdk,/func beginRecording\(\)/);
 assert.match(sdk,/func finishRecording\(\) async/);
 assert.ok(!native.includes('RTMPStream'));
 assert.ok(!native.includes('startRegistration'));
 assert.ok(!native.includes('camera.stream.start()'));
 assert.ok(!native.includes('try await publisher'));
});

test('cue sheet nativo no proclama video grabado ni encoder validado',()=>{
 for(const marker of [
  '"wivra-live-edit-log-v1"',
  '"mediaRecorded": false',
  '"encoderValidated": false',
  '"scene-preview"',
  '"scene-take"',
  'ProcessInfo.processInfo.systemUptime',
  'ShareLink(item: logURL)'
 ]) assert.ok(native.includes(marker),'missing '+marker);
 assert.ok(!native.includes('streamKey'));
 assert.ok(!native.includes('UserDefaults.standard'));
});

test('si la cámara se pierde tras preparar una escena, se vuelve a verificar para Take',()=>{
 assert.match(native,/private func cue\(_ scene: WivraLabScene\)/);
 assert.match(native,/private func take\(\)/);
 const takeBody=native.slice(native.indexOf('private func take()'),native.indexOf('private func exportCueSheet()'));
 assert.match(takeBody,/guard canUse\(scene\) else/);
 assert.ok(takeBody.indexOf('guard canUse')<takeBody.indexOf('program = scene'));
});

test('el panel no declara cámara activa cuando el último frame es viejo',()=>{
 assert.match(native,/let age = ProcessInfo\.processInfo\.systemUptime - last/);
 assert.match(native,/age >= 0 && age < 2\.5/);
 const guarded=native.slice(native.indexOf('private func take()'), native.indexOf('private func exportCueSheet()'));
 assert.match(guarded,/guard canUse\(scene\) else/);
 assert.match(sdk,/lastRawFrameUptime: Double\?/);
});