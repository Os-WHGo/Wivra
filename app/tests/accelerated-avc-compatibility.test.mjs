import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyDiagnosticAvcOutput as verify} from '../accelerated-avc-compatibility.mjs';

const baseline=(patch={})=>({codec:'avc1.42E01F',width:320,height:240,
  framerate:30,bitrate:3000000,...patch});

test('compatible constrained-baseline SPS may advertise a lower sufficient level',()=>{
  assert.equal(verify(baseline(),'avc1.42C015'),true);
  assert.equal(verify(baseline(),'avc1.42e015'),true);
  assert.equal(verify(baseline(),'avc1.42E01F'),true);
  assert.equal(verify(baseline({codec:'avc1.42C01F'}),'avc1.42E015'),true);
});

test('actual AVC level must carry requested frame dimensions, frame rate and bitrate',()=>{
  assert.equal(verify(baseline(),'avc1.42C014'),false); // Level 2: 2 Mbit/s ceiling.
  assert.equal(verify(baseline({bitrate:2000000}),'avc1.42C014'),true);
  assert.equal(verify(baseline({width:640,height:360}),'avc1.42C015'),false);
  assert.equal(verify(baseline({framerate:60}),'avc1.42C015'),true);
  assert.equal(verify(baseline({framerate:67}),'avc1.42C015'),false);
  assert.equal(verify(baseline({bitrate:4000001}),'avc1.42C015'),false);
  // Annex A also bounds each dimension, even if aggregate MaxFS fits.
  assert.equal(verify(baseline({width:16,height:12672,framerate:1}),'avc1.42C015'),false);
});

test('720p60 requires its FPS-aware level rather than a resolution-only level',()=>{
  const config=baseline({codec:'avc1.42E020',width:1280,height:720,framerate:60});
  assert.equal(verify(config,'avc1.42C020'),true);
  assert.equal(verify(config,'avc1.42C01F'),false);
});

test('exact High profile and sufficient High levels remain valid without profile drift',()=>{
  const config=baseline({codec:'avc1.640028',width:1920,height:1080});
  assert.equal(verify(config,'avc1.640028'),true);
  assert.equal(verify(config,'avc1.64001F'),false);
  assert.equal(verify(config,'avc1.42C028'),false);
  assert.equal(verify(baseline(),'avc1.640015'),false);
  assert.equal(verify(config,'avc1.640C28'),false);
  assert.equal(verify({...config,bitrate:25000000},'avc1.640028'),true);
  assert.equal(verify({...config,bitrate:25000001},'avc1.640028'),false);
});

test('higher, unknown or ambiguous levels and reserved profile bits fail closed',()=>{
  for(const codec of ['avc1.42C020','avc1.42C00B','avc1.42D00B',
    'avc1.42C009','avc1.42C035','avc1.42C11F','avc1.42C21F',
    'avc1.420015','avc1.4D4015','avc1.58C015','avc3.42C015',
    'avc1.42C015extra','avc1.42C01','avc1.42CZ15','vp09.00.51.08',null,42]){
    assert.equal(verify(baseline(),codec),false,String(codec));
  }
});

test('missing or unsafe requested fields never produce a compatible verdict',()=>{
  assert.equal(verify(null,'avc1.42C015'),false);
  for(const patch of [{codec:'avc1.42D00B'},{codec:'avc1.640C28'},
    {width:0},{width:320.5},{height:-1},{height:Number.MAX_SAFE_INTEGER},
    {framerate:NaN},{framerate:Infinity},{framerate:0},
    {bitrate:undefined},{bitrate:NaN},{bitrate:0},{bitrate:3e6+.1}]){
    assert.equal(verify(baseline(patch),'avc1.42C015'),false,JSON.stringify(patch));
  }
});
