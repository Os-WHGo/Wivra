// Android full beta source picker: user choice never equates to a working stream.
// Cross-check native route names against the canonical JS capability contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SOURCE_KINDS, createSourceCandidate, applyEvidence,
  canUseForLocalComposition, canStartDirectLive, validateMultiSourcePlan
} from '../../core/source-capabilities.mjs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const main = read('../android/app/src/main/java/com/oswhgo/wivra/MainActivity.java');
const manifest = read('../android/app/src/full/AndroidManifest.xml');
const screen = read('../android/app/src/full/java/com/oswhgo/wivra/WivraScreenLiveActivity.kt');
const phoneLive = read('../android/app/src/full/java/com/oswhgo/wivra/WivraPhoneLiveActivity.kt');
const phoneCamera = read('../android/app/src/main/java/com/oswhgo/wivra/WivraPhoneCameraActivity.kt');

test('camera selector routes to existing Ray-Ban DAT and CameraX, not simulated cameras', () => {
  assert.match(main, /cameraSources\.setText\("Cámara · elegir fuente"\)/);
  assert.match(main, /setTitle\("Fuentes → Cámara"\)/);
  assert.match(main, /launchRayBanCameraFromDirector\(\)/);
  assert.match(main, /launchPhoneCameraFromDirector\(\)/);
  assert.match(main, /hasSystemFeature\(PackageManager\.FEATURE_CAMERA_ANY\)/);
  assert.match(main, /showPhoneCameraUnsupported\(\)/);
  assert.match(main, /PiP o dos cámaras simultáneas aún no están habilitados/);
  assert.match(phoneCamera, /ProcessCameraProvider\.getInstance\(this\)/);
  assert.match(phoneCamera, /CameraSelector\.DEFAULT_BACK_CAMERA/);
  assert.match(phoneCamera, /CameraSelector\.DEFAULT_FRONT_CAMERA/);
  for(const kind of ['meta-dat','phone-camera']) {
    assert.ok(SOURCE_KINDS.includes(kind));
  }
});

test('full LIVE selector opens only compiled camera RTMP or consented MediaProjection', () => {
  assert.match(main, /liveSources\.setText\("LIVE · elegir fuente"\)/);
  assert.match(main, /setTitle\("Fuentes → LIVE"\)/);
  assert.match(main, /"com\.oswhgo\.wivra"\.equals\(getPackageName\(\)\)/);
  assert.match(main, /live\.setClassName\(this, "com\.oswhgo\.wivra\.WivraPhoneLiveActivity"\)/);
  assert.match(main, /live\.setClassName\(this, "com\.oswhgo\.wivra\.WivraScreenLiveActivity"\)/);
  assert.match(manifest, /android:name="\.WivraPhoneLiveActivity"/);
  assert.match(manifest, /android:name="\.WivraScreenLiveActivity"/);
  assert.match(screen, /createScreenCaptureIntent\(\)/);
  assert.match(screen, /setTitle\("Confirmar LIVE público de pantalla"\)/);
  assert.match(phoneLive, /publisher\.startStream\(address\)/);
  assert.match(main, /No hay mezcla PiP ni audio interno de aplicaciones en esta versión/);
  assert.ok(SOURCE_KINDS.includes('screen'));
  assert.ok(SOURCE_KINDS.includes('app-window'));
});

test('opening a source does not fabricate live camera frames or concurrent readiness', () => {
  const meta = createSourceCandidate({
    id:'meta-gen2',kind:'meta-dat',outputModes:['local-frames','recorded-media']
  });
  const phone = createSourceCandidate({
    id:'android-phone',kind:'phone-camera',outputModes:['local-frames','recorded-media']
  });
  const projection = createSourceCandidate({
    id:'projection-screen',kind:'screen',outputModes:['direct-stream']
  });
  assert.ok([meta, phone, projection].every(
    s => Object.values(s.capabilities).every(status => status === 'unknown')
  ));
  assert.equal(canStartDirectLive(projection),false);
  assert.equal(canUseForLocalComposition(meta),false);
  assert.equal(validateMultiSourcePlan([meta,phone],{compositorValidated:true}).ok,false);
  const unverified = applyEvidence(projection,'directLive',{
    provenance:'runtime',sessionId:'screen-session-1',
    permissionGranted:true,remoteIngestConfirmed:false,userConfirmed:true
  });
  assert.equal(canStartDirectLive(unverified),false);
  assert.doesNotMatch(main, /capabilities\.[a-zA-Z]+\s*=\s*['"]ready['"]/);
});

test('source chooser never captures or persists any RTMP key', () => {
  const body = main.split('private void showLiveSourceChooser() {')[1]
    ?.split('private void launchRayBanCameraFromDirector()')[0];
  assert.ok(body);
  assert.doesNotMatch(body, /SharedPreferences|RTMP_KEY|http:|https:|putExtra\(/);
  assert.doesNotMatch(body, /startStream\(|startRecord\(/);
  assert.match(body, /setNegativeButton\("Cancelar", null\)/);
});
