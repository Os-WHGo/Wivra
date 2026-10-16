import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProject } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';
import { parseWhisperLine, cleanSegmentText, segmentsToCues, modelProblem, WHISPER_MODELS, WORKER_SOURCE, createWhisperEngine } from '../whisper-engine.mjs';
import { transcriptionJobs, windowAudio, jobCues, planSubtitles } from '../transcribe.mjs';

test('parseWhisperLine: lee la salida de whisper.cpp y descarta lo que no es un segmento', () => {
  assert.deepEqual(parseWhisperLine('[00:00:03.520 --> 00:01:06.000]   Hola mundo'), { startMs: 3520, endMs: 66000, text: 'Hola mundo' });
  assert.deepEqual(parseWhisperLine('[01:02:03,5 --> 01:02:04,25]  x'), { startMs: 3723500, endMs: 3724250, text: 'x' });
  assert.equal(parseWhisperLine('whisper_init: loading'), null); assert.equal(parseWhisperLine(''), null);
});
test('cleanSegmentText: quita etiquetas de silencio/música y créditos inventados', () => {
  assert.equal(cleanSegmentText(' [BLANK_AUDIO] '), ''); assert.equal(cleanSegmentText('♪♪'), ''); assert.equal(cleanSegmentText('(música) Hola [ruido]'), 'Hola');
  assert.equal(cleanSegmentText('Subtítulos por la comunidad de Amara.org'), ''); assert.equal(cleanSegmentText('  ¿Qué   tal? '), '¿Qué tal?'); assert.equal(cleanSegmentText('...'), '');
});
test('segmentsToCues: junta lo muy corto, parte lo largo con el tiempo repartido y no solapa', () => {
  const seg = (a, b, t) => ({ startMs: a, endMs: b, text: t });
  const c1 = segmentsToCues([seg(0, 2000, 'Hola'), seg(2000, 2400, 'amigos'), seg(2500, 4000, '[BLANK_AUDIO]'), seg(5000, 9000, 'uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince')], { maxChars: 30 });
  assert.equal(c1[0].text, 'Hola amigos'); assert.equal(c1[0].end, 2.4);
  const rest = c1.slice(1); assert.ok(rest.length >= 2 && rest.every((c) => c.text.length <= 30)); assert.equal(rest[0].start, 5); assert.equal(rest[rest.length - 1].end, 9);
  for (let i = 0; i < c1.length - 1; i++) assert.ok(c1[i].end <= c1[i + 1].start + 1e-9);
  assert.deepEqual(segmentsToCues([seg(5000, 5000, 'x'), seg(0, 1000, '')]), []);
  const ov = segmentsToCues([seg(0, 3000, 'a b'), seg(2000, 4000, 'c d')]); assert.ok(ov[0].end <= ov[1].start);
});
test('modelProblem: comprueba cabecera «ggml» y tamaño', () => {
  const mk = (mb, magic = [0x6c, 0x6d, 0x67, 0x67]) => { const u = new Uint8Array(Math.round(mb * 1e6)); u.set(magic); return u.buffer; };
  assert.equal(modelProblem(mk(31), WHISPER_MODELS.fast), null); assert.match(modelProblem(mk(31, [1, 2, 3, 4]), WHISPER_MODELS.fast), /no es un modelo/);
  assert.match(modelProblem(mk(5), WHISPER_MODELS.fast), /esperaban/); assert.match(modelProblem(new ArrayBuffer(10), WHISPER_MODELS.fast), /incompleto/);
});
const mkProject = () => {
  let p = createProject({ assets: [{ id: 'v1', kind: 'video', name: 'a', duration: 20 }, { id: 'v2', kind: 'video', name: 'b', duration: 20 }, { id: 'm1', kind: 'audio', name: 'voz', duration: 30 }, { id: 'i1', kind: 'image', name: 'f', duration: 5 }] });
  return applyBatch(p, [{ op: 'add_clip', asset_id: 'v1', start: 0 }, { op: 'trim_clip', clip_id: 'c1', in: 2, out: 12 }, { op: 'add_clip', asset_id: 'v2', start: 10 }, { op: 'trim_clip', clip_id: 'c2', in: 0, out: 8 }, { op: 'add_photo_clip', asset_id: 'i1', start: 18, duration: 2 }]).project;
};
test('transcriptionJobs: videos con sonido y pistas de voz; no fotos, silenciados, música ni videos cubiertos por una voz aparte', () => {
  let p = mkProject(); let j = transcriptionJobs(p);
  assert.deepEqual(j.map((x) => [x.clipId, x.group, x.from, x.to, x.start]), [['c1', 'main', 2, 12, 0], ['c2', 'main', 0, 8, 10]]);
  p = applyBatch(p, [{ op: 'set_clip_audio', clip_id: 'c2', muted: true }, { op: 'add_audio_clip', asset_id: 'm1', start: 0, in: 0, out: 10, role: 'voice_primary' }, { op: 'add_audio_clip', asset_id: 'm1', start: 0, in: 0, out: 10, role: 'music' }]).project;
  j = transcriptionJobs(p); assert.deepEqual(j.map((x) => x.group), ['audio'], 'solo la voz aparte (c1 está cubierto, c2 silenciado, la música no)');
});
test('windowAudio y jobCues: ventana del medio → tiempo de la línea (con velocidad) y recorte al clip', () => {
  const s = new Float32Array(16000 * 10).map((_, i) => i); const w = windowAudio(s, 16000, 2, 4); assert.equal(w.length, 32000); assert.equal(w[0], 32000); assert.equal(windowAudio(s, 16000, 20, 30).length, 0);
  const job = { from: 2, to: 12, start: 5, speed: 2 };      // 10 s del medio a 2× = 5 s en la línea, desde el segundo 5
  const cues = jobCues(job, [{ startMs: 0, endMs: 2000, text: 'Hola' }, { startMs: 8000, endMs: 12000, text: 'Final largo' }]);
  assert.deepEqual(cues.map((c) => [c.start, c.end]), [[5, 6], [9, 10]], 'el segundo cue se corta en el final del clip (10 s)');
});
test('planSubtitles: ordena, evita solapes, descarta los que empiezan tras el final y se aplica como add_text', () => {
  const p = mkProject(), r = planSubtitles(p, [{ start: 3, end: 6, text: 'b' }, { start: 0, end: 4, text: 'a' }, { start: 50, end: 52, text: 'tarde' }], 20);
  assert.equal(r.ops.length, 2); assert.equal(r.late, 1); assert.deepEqual(r.ops.map((o) => [o.text, o.start, o.duration]), [['a', 0, 3], ['b', 3, 3]]);
  const out = applyBatch(p, r.ops); assert.ok(out.ok, JSON.stringify(out)); assert.equal(out.project.texts.length, 2);
});
test('el worker no usa «${…}» ni etiquetas que rompan el HTML, y createWhisperEngine pide Worker', () => {
  assert.ok(!WORKER_SOURCE.includes('</script') && !WORKER_SOURCE.includes('${'));
  assert.throws(() => createWhisperEngine({ libText: '', model: new ArrayBuffer(8), WorkerImpl: null }), /Worker/);
});
