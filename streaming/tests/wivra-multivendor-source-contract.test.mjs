import test from 'node:test';
import assert from 'node:assert/strict';
import {createSourceCandidate,applyEvidence,canUseForLocalComposition,
  canStartDirectLive,validateMultiSourcePlan} from '../../core/source-capabilities.mjs';

const source = (id,modes) =>
  createSourceCandidate({id,kind:'wearable-vendor',outputModes:modes});
const probe = sessionId => ({
  provenance:'runtime',sessionId,permissionGranted:true,
  validFrames:2,measuredFPS:24,width:504,height:896,lastFrameAgeSeconds:0
});

test('unverified wearables are not ready for PiP or LIVE', () => {
  for(const id of ['mentra','htc','rokid','rayneo','snap','vuzix','solos','android-xr']) {
    const x=source(id,['direct-stream','on-device-bridge']);
    assert.equal(canUseForLocalComposition(x),false);
    assert.equal(canStartDirectLive(x),false);
  }
});

test('two local streams require concurrent capture and compositor validation', () => {
  const a=applyEvidence(source('meta',['local-frames']),'cameraFrames',probe('meta1'));
  const b=applyEvidence(source('phone',['local-frames']),'cameraFrames',probe('phone1'));
  assert.equal(canUseForLocalComposition(a),true);
  assert.equal(validateMultiSourcePlan([a,b]).ok,false);
  assert.equal(validateMultiSourcePlan([a,b],{compositorValidated:true}).ok,false);
});
