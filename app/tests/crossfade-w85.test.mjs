// W85 (Claude): real cross-dissolve at cuts, built only from normal editor operations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, clipLength } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';
import { planCrossfades } from '../transitions.mjs';

const vertical = () => ({ w: 1080, h: 1920 });
const mk = (n, extra = []) => {
  const p = createProject({ assets: [{ id: 'a', kind: 'video', name: 'a', duration: 10 }, { id: 'm', kind: 'audio', name: 'm', duration: 60 }] });
  const r = applyBatch(p, [{ op: 'set_format', aspect: '9:16', fit: 'cover' }, ...Array.from({ length: n }, (_, i) => ({ op: 'add_clip', asset_id: 'a', start: i * 10 })), ...extra]);
  assert.ok(r.ok, JSON.stringify(r)); return r.project;
};

test('each cut: B\'s first d s become a full-frame layer fading in over A\'s tail; B continues after it', () => {
  const p = mk(3), plan = planCrossfades(p, 0.5, vertical);
  assert.ok(plan.ok, plan.error); assert.equal(plan.cuts, 2); assert.equal(plan.shortenedBy, 1);
  const out = applyBatch(p, plan.ops); assert.ok(out.ok, JSON.stringify(out));
  const [a, b, c] = [...out.project.clips].sort((x, y) => x.start - y.start);
  assert.deepEqual([a.start, b.start, c.start], [0, 10, 19.5]);
  assert.deepEqual([b.in, clipLength(b), c.in, clipLength(c)], [0.5, 9.5, 0.5, 9.5]);
  const layers = out.project.overlayClips;
  assert.equal(layers.length, 2);
  assert.deepEqual(layers.map((o) => [o.start, o.in, o.out, o.x, o.y, o.scale, o.muted, o.fxIn, o.fxDur]),
    [[9.5, 0, 0.5, 0.5, 0.5, 1, true, 'fade', 0.5], [19, 0, 0.5, 0.5, 0.5, 1, true, 'fade', 0.5]]);
  // No picture is shown twice: the layer ends where B's main-line part begins.
  assert.equal(layers[0].start + clipLength(layers[0]), b.start); assert.equal(layers[0].out, b.in);
});

test('texts and audio after a cut move with the picture; audio recorded with B loses the same first d seconds', () => {
  const p = mk(2, [{ op: 'add_text', text: 'Hola', start: 12, duration: 2 }, { op: 'add_audio_clip', asset_id: 'm', start: 10, in: 0, out: 10 }, { op: 'add_audio_clip', asset_id: 'm', start: 15, in: 20, out: 25 }]);
  const out = applyBatch(p, planCrossfades(p, 0.5, vertical).ops); assert.ok(out.ok, JSON.stringify(out));
  const [t] = out.project.texts; assert.deepEqual([t.start, t.end], [11.5, 13.5]);
  const [linked, later] = [...out.project.audioClips].sort((x, y) => x.start - y.start);
  assert.deepEqual([linked.start, linked.in], [10, 0.5]);
  assert.equal(later.start, 14.5);
});

test('cuts whose clip shape differs from the frame keep a plain cut, with a clear message', () => {
  const p = mk(2);
  const r = planCrossfades(p, 0.5, () => ({ w: 1920, h: 1080 }));
  assert.equal(r.ok, false); assert.match(r.error, /misma forma/);
  assert.match(planCrossfades(mk(1), 0.5, vertical).error, /al menos dos/);
});
