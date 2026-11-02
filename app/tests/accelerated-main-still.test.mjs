import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeAcceleratedMultitrackParity} from '../accelerated-multitrack-parity.mjs';
const base = () => ({clips:[{id:'still',asset_id:'photo',start:0,in:0,out:2}],overlayClips:[],audioClips:[],texts:[],format:{aspect:'original'}});
const media = {photo:{url:'blob:photo',kind:'image',w:1080,h:1920}};
test('main still images are eligible for parity ledger without losing timeline duration',()=>{
 const outcome=analyzeAcceleratedMultitrackParity(base(),media);
 assert.equal(outcome.valid,true);
 assert.equal(outcome.totalSeconds,2);
 assert.equal(outcome.tracks[0].sourceKind,'image');
 assert.equal(outcome.rendererReady,false);
});
