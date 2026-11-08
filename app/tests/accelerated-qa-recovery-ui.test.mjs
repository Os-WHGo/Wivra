import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validAcceleratedRecoveryEntry} from '../accelerated-qa-export-ui.mjs';

const code=(path)=>readFileSync(new URL(path,import.meta.url),'utf8');
const build=code('../build.mjs');
const qa=code('../accelerated-qa-export-ui.mjs');
const editor=code('../template.html');
const swift=code('../../streaming/ios/B0/Sources/WivraAcceleratedExportNativeBridge.swift');
const kotlin=code('../../streaming/android/app/src/main/java/com/oswhgo/wivra/WivraAcceleratedExportBridge.kt');
const store=code('../../streaming/android/app/src/main/java/com/oswhgo/wivra/WivraRandomExportStore.kt');

test('recovered private names are bounded and cannot select arbitrary phone files',()=>{
 const valid={name:'Wivra_Fast_11111111-1111-1111-1111-111111111111.mp4',
  bytes:4000000,durationMs:2400};
 assert.equal(validAcceleratedRecoveryEntry(valid),true);
 for(const name of ['../secret.mp4','Wivra_Fast_../../foo.mp4','Wivra_Fast_bad.mp4',
  'Wivra_Fast_123456789.webm/other','Wivra_Fast_xyz.txt'])
  assert.equal(validAcceleratedRecoveryEntry({...valid,name}),false);
 for(const bytes of [-1,0,NaN,Infinity,1.5])
  assert.equal(validAcceleratedRecoveryEntry({...valid,bytes}),false);
 for(const durationMs of [-1,0,NaN,Infinity,0.5])
  assert.equal(validAcceleratedRecoveryEntry({...valid,durationMs}),false);
});

// MU V4 (owner decision): the accelerated route is connected to the real editor. The controls are always
// built, the pinned Mediabunny is embedded compressed and run only on explicit use; consent stays mandatory.
test('accelerated controls are in the real editor; the pinned vendor loads only on explicit use',()=>{
 assert.ok(build.includes("'./accelerated-storage-budget.mjs'"));
 assert.ok(build.includes("'./accelerated-native-codec-probe.mjs'"));
 assert.ok(build.includes("'./accelerated-qa-export-ui.mjs'"));
 assert.match(build,/const qaPipeline = \[/);
 assert.match(build,/createHash\('sha256'\)\.update\(mbVendored\)\.digest\('hex'\) !== MEDIABUNNY_MIN_SHA256/);
 assert.match(build,/if \(await wvSha256Hex\(src\) !== MB_SHA256\)/);
 assert.match(build,/M:await loadMediabunny\(\)/);
 assert.match(build,/\+ qaUI \+/);
 assert.match(build,/const nativeHost = \(\) => findAndroid\(\) \?\? findIOS\(\)/);
 assert.match(qa,/if\(!host \|\| !\['ios','android'\]\.includes\(host\.platform\)\)return/);
 assert.match(qa,/enable\.checked/);
 assert.match(qa,/experimentalAccelerated:true/);
 assert.match(qa,/expectAudio:requireAudio\.checked/);
 assert.match(qa,/No se ha cambiado automáticamente de motor/);
});

test('Photos requires explicit confirmation and prevents implicit double saves',()=>{
 assert.match(qa,/window\.confirm\('¿Guardar una copia verificada en Fotos/);
 assert.match(qa,/photos\.disabled=true/);
 assert.match(qa,/saveVerifiedAcceleratedVideoToPhotos/);
 assert.match(qa,/Revisa Fotos antes de repetir/);
});

test('Android/iOS bridge can only restore verified app-private assets',()=>{
 assert.match(swift,/case "listRecovered":/);
 assert.match(swift,/case "shareRecovered":/);
 assert.match(swift,/await store\.recovered\(\)/);
 assert.match(swift,/lastPathComponent == request\.name/);
 assert.match(kotlin,/"listRecovered" ->/);
 assert.match(kotlin,/"restoreRecovered" ->/);
 assert.match(kotlin,/WivraRandomExportStore\.restore\(/);
 assert.doesNotMatch(swift+kotlin,/"deleteRecovered"/);
 assert.match(qa,/host\.platform==='ios'\?'shareRecovered':'restoreRecovered'/);
 assert.match(qa,/window\.confirm\(message\)/);
});

test('Android recovered copy is verified before reuse and UI distinguishes idempotent restore',()=>{
 assert.match(store,/existingRecoveryCopy\(context, verified\)/);
 assert.match(store,/MediaStore\.MediaColumns\.OWNER_PACKAGE_NAME/);
 assert.match(store,/MediaStore\.QUERY_ARG_MATCH_PENDING/);
 assert.match(store,/it\.getInt\(pendingColumn\) != 0/);
 assert.match(store,/verifiedCopy|isVerifiedRecoveryCopy/);
 assert.match(store,/alreadyPublished = true/);
 assert.match(qa,/response\.alreadyPublished===true/);
 assert.match(qa,/No se creó ninguna copia duplicada/);
});

test('owner beta prioritizes accelerated UI but keeps classic MediaRecorder one tap away',()=>{
 assert.match(qa,/enable\.checked=true/);
 assert.match(qa,/Exportar rápido \(beta\) · WebCodecs \+ Mediabunny','btn'/);
 assert.match(qa,/startStable\.textContent='Exportar con motor clásico \(MediaRecorder\)'/);
 assert.match(qa,/startStable\.classList\.add\('sec'\)/);
 assert.match(qa,/if\(running\|\|!enable\.checked\)/);
 assert.match(qa,/experimentalAccelerated:true/);
 assert.match(qa,/No se ha cambiado automáticamente de motor/);
 // There must never be an unconditional export call on page load.
 assert.match(qa,/start\.onclick=async\(\)=>/);
 assert.doesNotMatch(qa,/start\.click\(\)/);
 // The guard in export-engine-policy.mjs is intentionally unchanged.
 assert.match(build,/export-engine-policy\.mjs/);
});

test('native beta export sheet discloses real-time classic versus codec-gated fast export',()=>{
 assert.match(editor,/const fastBeta = Boolean\(globalThis\.WivraAcceleratedQA\?\.nativeHost\?\.\(\)\)/);
 assert.match(editor,/WebCodecs \+ Mediabunny/);
 assert.match(editor,/MediaRecorder, que exporta en tiempo real/);
 assert.match(editor,/const classicRiskText = exportRisk\.level/);
 assert.match(editor,/Si eliges MediaRecorder:.*classicRiskText/);
 assert.match(qa,/enable\.checked=true;\}\s*\};/);
 assert.doesNotMatch(qa,/enable\.checked=false;\}\s*\};/);
});
