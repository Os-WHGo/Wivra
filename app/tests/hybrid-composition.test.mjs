import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHybridComposition } from '../ai/hybrid-composition.mjs';
const plan = () => ({ version: 1, duration: 12, layers: [
  { id: 'real', kind: 'video', assetId: 'clip_1', start: 0, end: 12 },
  { id: 'photo', kind: 'image', assetId: 'photo_1', start: 2, end: 5, opacity: 0.8 },
  { id: 'move', kind: 'animation', preset: 'zoom', start: 2, end: 5 },
  { id: 'caption', kind: 'text', text: 'Whistler', start: 3, end: 6 }
] });
test('valid hybrid composition with real video, photo, animation and text', () => {
  const result = validateHybridComposition(plan());
  assert.equal(result.ok, true);
  assert.equal(result.value.layers.length, 4);
  assert.equal(result.value.layers[0].opacity, 1);
});
test('rejects unknown animation preset', () => {
  const p = plan(); p.layers[2].preset = 'execute';
  assert.equal(validateHybridComposition(p).code, 'INVALID_PRESET');
});
test('rejects duplicate IDs and invalid asset references', () => {
  const p = plan(); p.layers[1].id = 'real';
  assert.equal(validateHybridComposition(p).code, 'INVALID_ID');
  const q = plan(); q.layers[0].assetId = '../private.mp4';
  assert.equal(validateHybridComposition(q).code, 'INVALID_ASSET');
});
test('rejects invalid timing and opacity', () => {
  const p = plan(); p.layers[0].end = 13;
  assert.equal(validateHybridComposition(p).code, 'INVALID_TIME');
  const q = plan(); q.layers[1].opacity = 2;
  assert.equal(validateHybridComposition(q).code, 'INVALID_OPACITY');
});
test('does not mutate input and enforces layer limit', () => {
  const p = plan(), before = JSON.stringify(p);
  assert.equal(validateHybridComposition(p).ok, true);
  assert.equal(JSON.stringify(p), before);
  assert.equal(validateHybridComposition(p, { maxLayers: 2 }).code, 'INVALID_LAYERS');
});
