import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject, clipLength, speedOf, srcTime, totalDuration, timelineEnd } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';
import { planSpeed, planSpeedAll, SPEED_CHOICES } from '../speed.mjs';
import { clipAt, splitAt, planEdit, rippleOps } from '../timeline.mjs';
import { exportPlan, audioStartAt, overlayAt, fxAt } from '../export.mjs';
import { buildMix } from '../loudness.mjs';
import { planQuickAssembly } from '../quick-assembly.mjs';
import { planSilenceCut } from '../silence.mjs';
import { analyzeRhythm } from '../rhythm.mjs';

const base = () => {
  let p = createProject({ assets: [{ id: 'a1', kind: 'video', name: 'a', duration: 20 }, { id: 'a2', kind: 'video', name: 'b', duration: 20 }, { id: 'm1', kind: 'audio', name: 'm', duration: 30 }, { id: 'i1', kind: 'image', name: 'f', duration: 5 }] });
  const r = applyBatch(p, [
    { op: 'add_clip', asset_id: 'a1', start: 0 }, { op: 'trim_clip', clip_id: 'c1', in: 0, out: 10 },       // c1: 0–10
    { op: 'add_clip', asset_id: 'a2', start: 10 }, { op: 'trim_clip', clip_id: 'c2', in: 0, out: 8 },        // c2: 10–18
    { op: 'add_audio_clip', asset_id: 'a1', start: 0, in: 0, out: 10 },                                     // u3: va con c1
    { op: 'add_audio_clip', asset_id: 'm1', start: 12, in: 0, out: 4 },                                     // u4: música que empieza después de c1
    { op: 'add_text', text: 'Hola', start: 11, duration: 2 },
  ]);
  assert.ok(r.ok, JSON.stringify(r));
  return r.project;
};

test('set_clip_speed: valida, guarda solo si ≠ 1 y se deshace con el lote', () => {
  const p = base();
  for (const bad of [{ speed: 0.1 }, { speed: 5 }, { speed: 'x' }, { clip_id: 'zz', speed: 2 }]) assert.equal(applyBatch(p, [{ op: 'set_clip_speed', clip_id: 'c1', ...bad }]).ok, false);
  const r = applyBatch(p, [{ op: 'set_clip_speed', clip_id: 'c1', speed: 2 }]); assert.ok(r.ok);
  assert.equal(r.project.clips[0].speed, 2); assert.equal(clipLength(r.project.clips[0]), 5);
  const r1 = applyBatch(r.project, [{ op: 'set_clip_speed', clip_id: 'c1', speed: 1 }]); assert.equal('speed' in r1.project.clips[0], false);
  assert.equal(p.clips[0].speed, undefined, 'el proyecto original no cambia');
});
test('las fotos no tienen velocidad', () => {
  let p = base(); p = applyBatch(p, [{ op: 'add_photo_clip', asset_id: 'i1', start: 18, duration: 2 }]).project;
  const photo = p.clips.find((c) => c.asset_id === 'i1');
  const r = applyBatch(p, [{ op: 'set_clip_speed', clip_id: photo.id, speed: 2 }]); assert.equal(r.ok, false); assert.match(r.message, /fotos/);
  assert.match(planSpeed(p, photo.id, 2).error, /fotos/);
});
test('duraciones: totalDuration, timelineEnd, clipAt y srcTime usan la velocidad', () => {
  let p = applyBatch(base(), [{ op: 'set_clip_speed', clip_id: 'c1', speed: 0.5 }]).project;      // c1 dura 20 s
  assert.equal(speedOf(p.clips[0]), 0.5); assert.equal(clipLength(p.clips[0]), 20);
  assert.equal(totalDuration(p), 20 + 0 > 18 ? 20 : 18);
  assert.equal(timelineEnd(p), Math.max(20, 18, 10, 16));
  assert.equal(srcTime(p.clips[0], 5), 2.5);
  const hit = clipAt(p, 8); assert.equal(hit.clip.id, 'c1'); assert.equal(hit.assetTime, 4);
});
test('split_clip con velocidad: el corte cae donde toca y la parte derecha conserva la velocidad', () => {
  let p = applyBatch(base(), [{ op: 'set_clip_speed', clip_id: 'c1', speed: 2 }]).project;       // c1 dura 5 s; instante 2.5 s ↔ medio 5 s
  const sp = splitAt(p, 2.5, 'c1'); assert.ok(sp.ok, JSON.stringify(sp));
  const r = applyBatch(p, sp.ops); assert.ok(r.ok);
  const [l, rt] = [r.project.clips.find((c) => c.id === 'c1'), r.project.clips.find((c) => c.in === 5)];
  assert.equal(rt.speed, 2); assert.equal(rt.start, 2.5); assert.equal(clipLength(l), 2.5); assert.equal(clipLength(rt), 2.5);
});
test('planSpeed en el video principal: corre lo que sigue y el audio ligado cambia igual', () => {
  const p = base(), r = planSpeed(p, 'c1', 2); assert.ok(r.ok); assert.equal(r.before, 10); assert.equal(r.after, 5); assert.equal(r.linked, 1);
  const out = applyBatch(p, r.ops); assert.ok(out.ok, JSON.stringify(out));
  const q = out.project, by = (id) => [...q.clips, ...q.audioClips].find((c) => c.id === id);
  assert.equal(by('c1').speed, 2); assert.equal(by('c2').start, 5, 'c2 se corre 5 s');
  assert.equal(by('u3').speed, 2); assert.equal(clipLength(by('u3')), 5);
  assert.equal(by('u4').start, 7, 'la música posterior se corre'); assert.equal(q.texts[0].start, 6);
  assert.equal(totalDuration(q), 13);
  // y la ida contraria
  const back = planSpeed(q, 'c1', 1); const q2 = applyBatch(q, back.ops).project;
  assert.equal(q2.clips[0].speed, undefined); assert.equal(q2.clips[1].start, 10); assert.equal(q2.audioClips[0].speed, undefined);
});
test('planSpeed: capa y audio solo cambian su velocidad; fotos y velocidades fuera de rango dan error en español', () => {
  const p = base();
  const a = planSpeed(p, 'u4', 0.5); assert.ok(a.ok); assert.deepEqual(a.ops.map((o) => o.op), ['set_clip_speed']);
  assert.equal(planSpeed(p, 'zz', 2).ok, false); assert.match(planSpeed(p, 'c1', 9).error, /velocidad va de/);
  assert.equal(planSpeed(p, 'c1', 1).ops.length, 0);
  for (const v of SPEED_CHOICES.filter((x) => x !== 1)) assert.ok(applyBatch(p, planSpeed(p, 'c1', v).ops).ok, String(v));
});
test('exportación: el plan, el audio, las capas y los efectos siguen el tiempo de la línea', () => {
  const p = applyBatch(base(), [{ op: 'set_clip_speed', clip_id: 'c1', speed: 2 }, { op: 'set_clip_speed', clip_id: 'u3', speed: 2 }, { op: 'move_clip', clip_id: 'c2', start: 5 }]).project;
  const plan = exportPlan(p); assert.equal(plan.segments[0].dur, 5); assert.equal(plan.total, 13, 'la exportación termina con el video principal, no con la música');
  const a = audioStartAt(p.audioClips[0], 1); assert.deepEqual([a.offset, a.dur, a.rate], [2, 8, 2]);
  assert.equal(audioStartAt(p.audioClips[0], 5.1), null);
  const o = applyBatch(p, [{ op: 'add_overlay_clip', asset_id: 'a2', start: 2, in: 2, out: 6, track: 1 }, { op: 'set_clip_speed', clip_id: 'o' + p.nextId, speed: 0.5 }]); assert.ok(o.ok, JSON.stringify(o));
  assert.equal(overlayAt(o.project.overlayClips[0], 3), 2.5); assert.equal(overlayAt(o.project.overlayClips[0], 2 + 8), null);
  const f = applyBatch(p, [{ op: 'set_clip_fx', clip_id: 'c1', outro: 'fade', dur: 1 }]).project;
  assert.ok(fxAt(f.clips[0], 4.5).alpha < 1 && fxAt(f.clips[0], 2).alpha === 1, 'la salida se aplica al final de los 5 s de pantalla');
});
test('volumen parejo: la mezcla mide el clip con su duración real', () => {
  const p = applyBatch(base(), [{ op: 'set_clip_speed', clip_id: 'c1', speed: 2 }, { op: 'set_clip_audio', clip_id: 'c2', muted: true }, { op: 'delete_clip', clip_id: 'u4' }, { op: 'delete_clip', clip_id: 'u3' }]).project;
  const rate = 1000, pcm = { l: new Float32Array(20 * rate).fill(0.1) };
  const mix = buildMix(p, () => pcm, rate); assert.equal(Math.round(mix.seconds), 5);
});
test('las funciones que reescriben clips se niegan con clips en velocidad y lo dicen', () => {
  const p = applyBatch(base(), [{ op: 'set_clip_speed', clip_id: 'c1', speed: 2 }]).project;
  assert.match(planQuickAssembly(p, { targetSeconds: 5 }).error, /1×/); assert.match(planSilenceCut(p, {}).error, /1×/);
});
test('ritmo: usa la duración con velocidad', () => {
  const p = applyBatch(base(), [{ op: 'set_clip_speed', clip_id: 'c1', speed: 4 }, { op: 'move_clip', clip_id: 'c2', start: 2.5 }]).project;
  const r = analyzeRhythm(p); assert.ok(r.ok); assert.equal(r.stats.seconds, 10.5);
});
test('rippleOps/planEdit cierran huecos con la duración real', () => {
  const p = applyBatch(base(), [{ op: 'set_clip_speed', clip_id: 'c1', speed: 2 }]).project;
  const ops = rippleOps(p); assert.deepEqual(ops, [{ op: 'move_clip', clip_id: 'c2', start: 5 }]);
});

test('velocidad a todos: un lote único, video principal y voz ligada, música sin cambio de velocidad', () => {
  const p = base();
  const result = planSpeedAll(p, 2);
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.count, 2);
  const applied = applyBatch(p, result.ops);
  assert.ok(applied.ok, JSON.stringify(applied));
  const q = applied.project;
  assert.deepEqual(q.clips.map(c => c.speed), [2, 2]);
  assert.equal(q.audioClips[0].speed, 2, 'voz ligada acompaña el video');
  assert.equal(q.audioClips[1].speed, undefined, 'la música mantiene velocidad');
  assert.equal(q.clips[1].start, 5, 'sin huecos entre videos');
  assert.equal(q.audioClips[1].start, 7, 'música desplazada con el montaje');
  assert.equal(p.clips[0].speed, undefined, 'no se muta el original');
  assert.equal(planSpeedAll(q, 2).ops.length, 0, 'idempotente');
  assert.equal(planSpeedAll(p, 9).ok, false);
});

test('regresión: música completamente dentro de un video no se acelera por coincidencia temporal', () => {
  const p = base();
  const r = applyBatch(p, [{ op: 'move_clip', clip_id: 'u4', start: 2 }]);
  assert.ok(r.ok);
  const plan = planSpeed(r.project, 'c1', 2);
  assert.ok(plan.ok);
  const applied = applyBatch(r.project, plan.ops);
  assert.ok(applied.ok, JSON.stringify(applied));
  const music = applied.project.audioClips.find(c => c.id === 'u4');
  assert.equal(music.speed, undefined, 'la música no cambia de velocidad');
  assert.equal(music.start, 2, 'la música interior mantiene su posición');
  const voice = applied.project.audioClips.find(c => c.id === 'u3');
  assert.equal(voice.speed, 2, 'la voz asociada sí acompaña al video');
});
