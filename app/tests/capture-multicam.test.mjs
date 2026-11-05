// Two-camera capture bundles: manifest block, editor plan with the real
// operations, and the import guards in the editor. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseManifest, importPlan, planImportOps } from '../capture-manifest.mjs';
import { pipOverlayOp, applyPipComposition } from '../../core/multicam-plan.mjs';
import { createProject } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';

const base = (extra = {}) => ({
  schemaVersion: 2, captureID: 'c1', cameraSource: 'iphone-avfoundation', audioSource: 'none',
  originalVideoFile: 'A.mov', muxedVideoFile: null, createdAtISO8601: '2026-11-05T10:00:00Z',
  tracks: [], muxedFromTrackIDs: [], ...extra
});
const mc = (extra = {}) => ({ schema: 'wivra-multicam-v1', secondaryVideoFile: 'B.mov', secondaryOffsetSeconds: 0.12,
  primaryPosition: 'back', secondaryPosition: 'front', corner: 'bottom-right', audio: 'primary', ...extra });

test('a valid multicam block is normalized; old manifests are unchanged', () => {
  const r = parseManifest(base({ multicam: mc() }));
  assert.ok(r.ok);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.manifest.multicam, { secondaryVideoFile: 'B.mov', offsetSeconds: 0.12, offsetKnown: true,
    corner: 'bottom-right', audio: 'primary', primaryPosition: 'back', secondaryPosition: 'front' });
  const old = parseManifest(base());
  assert.ok(old.ok);
  assert.equal(old.manifest.multicam, null);
  const unknown = parseManifest(base({ multicam: mc({ secondaryOffsetSeconds: null }) }));
  assert.equal(unknown.manifest.multicam.offsetKnown, false);
});

test('a corrupt block never blocks the main camera', () => {
  for (const bad of [
    mc({ schema: 'v9' }), mc({ secondaryVideoFile: '../x.mov' }), mc({ secondaryVideoFile: 'A.mov' }),
    mc({ secondaryOffsetSeconds: 11 }), mc({ secondaryOffsetSeconds: 'soon' }), mc({ corner: 'middle' }),
    mc({ audio: 'both' }), 'yes', [1]
  ]) {
    const r = parseManifest(base({ multicam: bad }));
    assert.ok(r.ok, JSON.stringify(bad));
    assert.equal(r.manifest.multicam, null);
    assert.match(r.warnings.join(' '), /segunda cámara ignorados/);
  }
  // A secondary named like an audio track would play twice: rejected.
  const clash = parseManifest(base({
    audioSource: 'x',
    tracks: [{ id: 'a1', kind: 'audio', role: 'voice_primary', source: 'x', file: 'B.mov' }],
    multicam: mc()
  }));
  assert.equal(clash.manifest.multicam, null);
});

test('editor plan: main clip + muted PiP layer in one atomic batch', () => {
  const r = parseManifest(base({ multicam: mc({ secondaryOffsetSeconds: -0.3 }) }));
  const project = createProject({ assets: [{ id: 'va', duration: 10, name: 'A.mov' }, { id: 'vb', duration: 9, name: 'B.mov' }] });
  const out = planImportOps(importPlan(r.manifest), { videoStart: 0, assets: { 'A.mov': { id: 'va', duration: 10 } } });
  const pip = pipOverlayOp({ secondaryAssetId: 'vb', primaryDurationS: 10, secondaryDurationS: 9,
    secondaryOffsetMs: r.manifest.multicam.offsetSeconds * 1000, corner: r.manifest.multicam.corner,
    frameWidth: 1080, frameHeight: 1920, at: 0 });
  assert.ok(pip.ok);
  const res = applyBatch(project, [...out.ops, pip.op]);
  assert.ok(res.ok, JSON.stringify(res));
  const [main] = res.project.clips;
  const [inset] = res.project.overlayClips;
  assert.equal(main.asset_id, 'va');
  assert.equal(main.muted, undefined, 'main camera audible');
  assert.deepEqual([inset.asset_id, inset.start, inset.in, inset.out, inset.muted], ['vb', 0, 0.3, 9, true]);
  assert.ok(inset.x > 0.5 && inset.y > 0.5, 'bottom-right');
  // Same result as the composition helper used elsewhere: no second compositor.
  const viaHelper = applyPipComposition(project, { primaryAssetId: 'va', secondaryAssetId: 'vb', primaryDurationS: 10,
    secondaryDurationS: 9, secondaryOffsetMs: -300, corner: 'bottom-right', frameWidth: 1080, frameHeight: 1920 });
  const { id: _a, ...fromImport } = inset;
  const { id: _b, ...fromHelper } = viaHelper.project.overlayClips[0];
  assert.deepEqual(fromImport, fromHelper);
  // Timeline after earlier clips: the inset follows its main clip.
  const later = pipOverlayOp({ secondaryAssetId: 'vb', primaryDurationS: 10, secondaryDurationS: 9,
    secondaryOffsetMs: 120, at: 42 });
  assert.equal(later.op.start, 42.12);
  // No overlap: the editor imports the main camera alone.
  assert.equal(pipOverlayOp({ secondaryAssetId: 'vb', primaryDurationS: 2, secondaryDurationS: 2, secondaryOffsetMs: 5000 }).ok, false);
});

for (const f of ['../template.html', '../dist/agentcut.html']) {
  test(`capture import adds the inset in the same batch and falls back to one camera (${f})`, () => {
    const h = readFileSync(new URL(f, import.meta.url), 'utf8');
    const block = h.slice(h.indexOf('async function importCapture(files)'), h.indexOf('// The same import path handles user-selected files'));
    assert.match(block, /pipSecondary = byName\.has\(m\.multicam\.secondaryVideoFile\) \? await open\(m\.multicam\.secondaryVideoFile, 'video'\) : null/);
    assert.match(block, /if \(pip\.ok\) \{\s*out\.ops\.push\(pip\.op\)/);
    assert.match(block, /se importó solo la cámara principal/);
    assert.match(block, /audio: m\.multicam\.audio === 'secondary' \? 'secondary' : 'primary'/);
    // Inserted after the all-or-nothing audio check, before the single run().
    assert.ok(block.indexOf('if (out.skipped.length)') < block.indexOf('out.ops.push(pip.op)'));
    assert.ok(block.indexOf('out.ops.push(pip.op)') < block.indexOf('const res = run(out.ops)'));
  });
}
