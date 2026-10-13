import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, totalDuration } from '../project.mjs';
import { Session } from '../session.mjs';
import { runTool, toOpenAI, toAnthropic, TOOLS } from '../tools.mjs';

const fresh = () => new Session(createProject({ assets: [{ id: 'a1', duration: 22 }] }));

test('prueba de aceptación: clip de 22 s, recortar 2–8 y texto "Vancouver"', () => {
  const s = fresh();
  const r = runTool(s, 'edit_apply', { expected_revision: 0, ops: [
    { op: 'add_clip', asset_id: 'a1' },
    { op: 'trim_clip', clip_id: 'c1', in: 2, out: 8 },
    { op: 'add_text', text: 'Vancouver', start: 0, duration: 3 },
  ] });
  assert.equal(r.ok, true);
  assert.equal(totalDuration(s.project), 6);
  assert.equal(s.project.texts[0].text, 'Vancouver');
});

test('un mensaje = un deshacer', () => {
  const s = fresh();
  runTool(s, 'edit_apply', { ops: [{ op: 'add_clip', asset_id: 'a1' }, { op: 'trim_clip', clip_id: 'c1', in: 2, out: 8 }] });
  assert.equal(runTool(s, 'edit_undo').ok, true);
  assert.equal(s.project.clips.length, 0);
});

test('el validador rechaza recortar a 100 s y no cambia nada (atómico)', () => {
  const s = fresh();
  const r = runTool(s, 'edit_apply', { ops: [{ op: 'add_clip', asset_id: 'a1' }, { op: 'trim_clip', clip_id: 'c1', in: 0, out: 100 }] });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'out_of_range');
  assert.equal(r.failed_index, 1);
  assert.equal(s.project.clips.length, 0);
  assert.equal(s.project.revision, 0);
});

test('revisión vieja y operación inventada se rechazan', () => {
  const s = fresh();
  runTool(s, 'edit_apply', { ops: [{ op: 'add_clip', asset_id: 'a1' }] });
  assert.equal(runTool(s, 'edit_apply', { expected_revision: 0, ops: [{ op: 'delete_clip', clip_id: 'c1' }] }).code, 'stale_revision');
  assert.equal(runTool(s, 'edit_apply', { ops: [{ op: 'hacer_magia' }] }).code, 'unknown_op');
});

test('split y move funcionan', () => {
  const s = fresh();
  runTool(s, 'edit_apply', { ops: [{ op: 'add_clip', asset_id: 'a1' }, { op: 'split_clip', clip_id: 'c1', at: 10 }, { op: 'move_clip', clip_id: 'c2', start: 30 }] });
  assert.equal(s.project.clips.length, 2);
  assert.equal(s.project.clips[1].start, 30);
});

test('mismas herramientas en formato OpenAI y Anthropic', () => {
  assert.equal(toOpenAI().length, TOOLS.length);
  assert.ok(toAnthropic().every((t) => t.input_schema));
});
