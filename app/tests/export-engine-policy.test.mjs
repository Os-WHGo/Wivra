import test from 'node:test';
import assert from 'node:assert/strict';
import { selectExportEngine, ACCELERATED_EXPORT_IMPLEMENTED } from '../export-engine-policy.mjs';

test('automatic mode preserves proven recorder until all acceleration gates pass', () => {
  assert.equal(selectExportEngine().engine, 'mediarecorder');
  assert.equal(selectExportEngine({ webCodecs: true, mediabunny: true }).engine, 'mediarecorder');
});
test('accelerated engine requires every capability and physical validation', () => {
  const capabilities = { webCodecs: true, mediabunny: true, fullTimelineRenderer: true, nativeRandomAccess: true, verifiedOnDevice: true };
  assert.equal(ACCELERATED_EXPORT_IMPLEMENTED, false, 'must not enable prototype without production renderer');
  assert.equal(selectExportEngine(capabilities).engine, 'mediarecorder', 'even forged capability flags must not enable unfinished renderer');
  for (const key of Object.keys(capabilities)) assert.equal(selectExportEngine({ ...capabilities, [key]: false }).engine, 'mediarecorder');
});
test('manual recorder mode always remains available and invalid choices fail', () => {
  assert.equal(selectExportEngine({ requested: 'mediarecorder', webCodecs: true }).engine, 'mediarecorder');
  assert.throws(() => selectExportEngine({ requested: 'unsupported' }), /desconocido/);
});
