import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../../core/project.mjs';
import { hybridToEditorOps } from '../ai/hybrid-editor.mjs';

const project = () => createProject({ assets: [
  { id: 'real', kind: 'video', duration: 10, name: 'real.mp4' },
  { id: 'photo', kind: 'image', duration: 10, name: 'photo.png' }
] });
const plan = () => ({ version: 1, duration: 10, layers: [
  { id: 'base', kind: 'video', assetId: 'real', start: 0, end: 10 },
  { id: 'still', kind: 'image', assetId: 'photo', start: 2, end: 5 },
  { id: 'title', kind: 'text', text: 'Whistler', start: 3, end: 6 },
  { id: 'anim', kind: 'animation', preset: 'zoom', start: 2, end: 5 }
] });
test('hybrid plan compiles to actual editor operations without applying', () => {
  const p = project(), before = JSON.stringify(p);
  const r = hybridToEditorOps(plan(), p);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.ops.map(o => o.op), ['add_clip', 'add_overlay_clip', 'add_text']);
  assert.equal(r.previewProject.clips.length, 1);
  assert.equal(r.previewProject.overlayClips.length, 1);
  assert.equal(r.previewProject.texts.length, 1);
  assert.equal(JSON.stringify(p), before);
});
test('animation is explicitly deferred, never silently rendered', () => {
  const r = hybridToEditorOps(plan(), project());
  assert.equal(r.deferred.length, 1);
  assert.equal(r.deferred[0].reason, 'RENDERER_REQUIRED');
});
test('unknown asset fails before any operation', () => {
  const p = plan(); p.layers[1].assetId = 'unknown';
  assert.equal(hybridToEditorOps(p, project()).code, 'UNKNOWN_ASSET');
});
test('wrong asset type fails', () => {
  const p = plan(); p.layers[1].assetId = 'real';
  assert.equal(hybridToEditorOps(p, project()).code, 'ASSET_KIND');
});
test('unsupported main-video trimming fails explicitly', () => {
  const p = plan(); p.layers[0].end = 8;
  assert.equal(hybridToEditorOps(p, project()).code, 'TRIM_REQUIRED');
});
test('invalid overlay track is rejected', () => {
  assert.equal(hybridToEditorOps(plan(), project(), { overlayTrack: 5 }).code, 'INVALID_TRACK');
});
