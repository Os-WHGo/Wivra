import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, totalDuration } from '../project.mjs';
import { Session } from '../session.mjs';

const assets = [{ id: 'v', duration: 10, name: 'v.mov' }, { id: 'm', duration: 8, name: 'mic.caf' }];
const mk = () => { const s = new Session(createProject({ assets })); assert.ok(s.apply([{ op: 'add_clip', asset_id: 'v', start: 0 }]).ok); return s; };
const audio = (s) => s.project.audioClips;

test('add_audio_clip crea una pista de audio sin alargar el video', () => {
  const s = mk(); const r = s.apply([{ op: 'add_audio_clip', asset_id: 'm', start: 1.5, role: 'voice_primary' }]); assert.ok(r.ok, JSON.stringify(r));
  const a = audio(s); assert.equal(a.length, 1);
  assert.deepEqual([a[0].asset_id, a[0].start, a[0].in, a[0].out, a[0].role], ['m', 1.5, 0, 8, 'voice_primary']);
  assert.equal(totalDuration(s.project), 10); assert.match(a[0].id, /^u\d+$/);
});
test('add_audio_clip valida medio, tiempos, rol y volumen; el lote es todo-o-nada', () => {
  const s = mk(); const before = JSON.stringify(s.project);
  for (const op of [{ asset_id: 'nada' }, { asset_id: 'm', start: -1 }, { asset_id: 'm', in: 5, out: 4 }, { asset_id: 'm', out: 99 }, { asset_id: 'm', role: 'voice-host' }, { asset_id: 'm', volume: 3 }, { asset_id: 'm', muted: 'si' }])
    assert.equal(s.apply([{ op: 'add_audio_clip', ...op }]).ok, false, JSON.stringify(op));
  assert.equal(s.apply([{ op: 'add_audio_clip', asset_id: 'm' }, { op: 'add_audio_clip', asset_id: 'nada' }]).ok, false);
  assert.equal(JSON.stringify(s.project), before);
});
test('mover, recortar, dividir, volumen y borrar también funcionan sobre clips de audio', () => {
  const s = mk(); s.apply([{ op: 'add_audio_clip', asset_id: 'm', start: 0, role: 'voice_primary' }]); const id = audio(s)[0].id;
  assert.ok(s.apply([{ op: 'move_clip', clip_id: id, start: 2 }]).ok); assert.equal(audio(s)[0].start, 2);
  assert.ok(s.apply([{ op: 'trim_clip', clip_id: id, in: 1, out: 7 }]).ok);
  assert.ok(s.apply([{ op: 'set_clip_audio', clip_id: id, muted: true, volume: 0.5 }]).ok);
  const r = s.apply([{ op: 'split_clip', clip_id: id, at: 4 }]); assert.ok(r.ok, JSON.stringify(r));
  assert.equal(audio(s).length, 2); assert.equal(s.project.clips.length, 1);
  const [a, b] = audio(s); assert.deepEqual([a.out, b.in, b.out, b.start, b.role, b.muted, b.volume], [4, 4, 7, 5, 'voice_primary', true, 0.5]); assert.match(b.id, /^u\d+$/);
  assert.ok(s.apply([{ op: 'delete_clip', clip_id: b.id }]).ok); assert.equal(audio(s).length, 1); assert.equal(s.project.clips.length, 1);
});
test('deshacer y rehacer un lote que agrega audio', () => {
  const s = mk(); s.apply([{ op: 'add_audio_clip', asset_id: 'm', start: 0 }]);
  assert.equal(audio(s).length, 1); s.undo(); assert.equal(audio(s).length, 0); s.redo(); assert.equal(audio(s).length, 1);
});
test('proyectos guardados sin audioClips siguen funcionando', () => {
  const p = createProject({ assets }); delete p.audioClips; const s = new Session(p);
  assert.ok(s.apply([{ op: 'add_clip', asset_id: 'v' }, { op: 'add_audio_clip', asset_id: 'm' }]).ok); assert.equal(audio(s).length, 1);
});
