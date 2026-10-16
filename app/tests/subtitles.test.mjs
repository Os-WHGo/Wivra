// Subtítulos SRT/VTT ↔ textos del editor (app/subtitles.mjs). — Claude
import test from 'node:test'; import assert from 'node:assert/strict';
import { parseSubtitles, parseTimestamp, formatTimestamp, splitText, toSRT, toVTT, cuesToOps, SUB_MAX_BYTES } from '../subtitles.mjs';
import { applyBatch } from '../../core/operations.mjs';
import { createProject } from '../../core/project.mjs';

test('horas: SRT con coma, VTT con punto y sin horas, milisegundos de 1 a 3 dígitos', () => {
  assert.equal(parseTimestamp('00:00:01,500'), 1.5); assert.equal(parseTimestamp('01:02:03.250'), 3723.25); assert.equal(parseTimestamp('02:03.500'), 123.5);
  assert.equal(parseTimestamp('00:00:01,5'), 1.5, '"5" = 500 ms'); assert.equal(parseTimestamp('00:00:01,05'), 1.05);
  for (const bad of ['', '1', '00:61:00,000', '00:00:61,000', 'abc', '00:00:01', '-00:00:01,000']) assert.equal(parseTimestamp(bad), null, bad);
});
test('formatTimestamp redondea a milisegundos, pasa de 59 s a minutos y nunca sale negativo', () => {
  assert.equal(formatTimestamp(1.5), '00:00:01,500'); assert.equal(formatTimestamp(3723.25, '.'), '01:02:03.250'); assert.equal(formatTimestamp(59.9996), '00:01:00,000');
  assert.equal(formatTimestamp(-3), '00:00:00,000'); assert.equal(formatTimestamp(NaN), '00:00:00,000');
});
test('SRT básico: números, varias líneas, CRLF y BOM', () => {
  const raw = '﻿1\r\n00:00:01,000 --> 00:00:03,500\r\nHola\r\nmundo\r\n\r\n2\r\n00:00:04,000 --> 00:00:05,000\r\nAdiós\r\n';
  const r = parseSubtitles(raw); assert.ok(r.ok); assert.equal(r.format, 'srt'); assert.deepEqual(r.cues, [{ start: 1, end: 3.5, text: 'Hola mundo' }, { start: 4, end: 5, text: 'Adiós' }]);
});
test('WebVTT: cabecera, NOTE, STYLE, identificadores, ajustes de posición, etiquetas y entidades', () => {
  const raw = `WEBVTT - título\n\nSTYLE\n::cue { color: red }\n\nNOTE esto es un comentario\n\nintro\n00:01.000 --> 00:02.500 align:start position:10%\n<v Ana><b>Hola</b> &amp; <i>adiós</i></v>\n\n01:00:00.000 --> 01:00:01.000\n{\\an8}Arriba <00:01:00.500>y abajo\n`;
  const r = parseSubtitles(raw); assert.ok(r.ok); assert.equal(r.format, 'vtt');
  assert.deepEqual(r.cues, [{ start: 1, end: 2.5, text: 'Hola & adiós' }, { start: 3600, end: 3601, text: 'Arriba y abajo' }]);
});
test('los cues inválidos se descartan con aviso y el resto se importa', () => {
  const raw = '1\n00:00:05,000 --> 00:00:04,000\nal revés\n\n2\n00:00:06,000 --> 00:00:07,000\n\n\n3\n00:00:08,000 --> 00:00:09,000\nbueno\n';
  const r = parseSubtitles(raw); assert.ok(r.ok); assert.deepEqual(r.cues.map((c) => c.text), ['bueno']); assert.match(r.warnings[0], /2 subtítulo\(s\)/);
});
test('un archivo que no es SRT/VTT, vacío, o demasiado grande se rechaza con un mensaje claro', () => {
  for (const raw of ['', 'hola\nesto no es un subtítulo', 'WEBVTT\n\n']) { const r = parseSubtitles(raw); assert.equal(r.ok, false); assert.match(r.errors[0], /No encontré subtítulos/); }
  assert.equal(parseSubtitles(5).ok, false); assert.match(parseSubtitles('x'.repeat(SUB_MAX_BYTES + 1)).errors[0], /demasiado grande/);
});
test('los cues se ordenan por tiempo', () => {
  const r = parseSubtitles('1\n00:00:05,000 --> 00:00:06,000\nB\n\n2\n00:00:01,000 --> 00:00:02,000\nA\n'); assert.deepEqual(r.cues.map((c) => c.text), ['A', 'B']);
});
test('un cue de más de 120 caracteres se parte en palabras completas y el tiempo se reparte por largo', () => {
  const text = Array.from({ length: 40 }, (_, i) => 'palabra' + i).join(' '), r = parseSubtitles(`1\n00:00:10,000 --> 00:00:20,000\n${text}\n`);
  assert.ok(r.ok && r.cues.length >= 3); assert.ok(r.cues.every((c) => c.text.length <= 120)); assert.equal(r.cues.map((c) => c.text).join(' '), text, 'no se pierde ni se cambia ninguna palabra');
  assert.equal(r.cues[0].start, 10); assert.equal(r.cues.at(-1).end, 20); for (let i = 1; i < r.cues.length; i++) assert.ok(Math.abs(r.cues[i].start - r.cues[i - 1].end) < 1e-9, 'sin huecos ni solapes');
  assert.match(r.warnings.join(' '), /partieron/);
});
test('splitText: palabra gigante cortada a la fuerza; tope exacto; vacío', () => {
  assert.deepEqual(splitText('a'.repeat(250), 120).map((s) => s.length), [120, 120, 10]); assert.deepEqual(splitText('x'.repeat(120), 120), ['x'.repeat(120)]); assert.deepEqual(splitText('', 120), []);
});
test('toSRT / toVTT: orden, numeración, formato y sin saltos ni «-->» dentro del texto', () => {
  const texts = [{ id: 't2', text: 'Segundo', start: 4, end: 5.25 }, { id: 't1', text: 'Primero\nlínea --> dos', start: 1, end: 3 }, { id: 'x', text: 'sin duración', start: 7, end: 7 }];
  assert.equal(toSRT(texts), '1\n00:00:01,000 --> 00:00:03,000\nPrimero línea –> dos\n\n2\n00:00:04,000 --> 00:00:05,250\nSegundo\n');
  assert.equal(toVTT(texts), 'WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nPrimero línea –> dos\n\n00:00:04.000 --> 00:00:05.250\nSegundo\n');
  assert.equal(toSRT([]), '');
});
test('ida y vuelta: lo que se exporta se vuelve a leer igual (SRT y VTT)', () => {
  const texts = [{ text: 'Hola, ¿qué tal? ñandú — “comillas”', start: 0.04, end: 2.5 }, { text: 'Segundo', start: 3.001, end: 4 }];
  for (const [f, fn] of [['srt', toSRT], ['vtt', toVTT]]) { const r = parseSubtitles(fn(texts)); assert.ok(r.ok && r.format === f); assert.deepEqual(r.cues, texts.map((t) => ({ start: t.start, end: t.end, text: t.text }))); }
});
test('cuesToOps: descarta lo que empieza después del final, acepta el desfase y el lote lo valida el motor', () => {
  const cues = [{ start: 1, end: 3, text: 'a' }, { start: 9.5, end: 12, text: 'b' }, { start: 15, end: 16, text: 'tarde' }];
  const { ops, late } = cuesToOps(cues, 10); assert.equal(late, 1); assert.equal(ops.length, 2);
  let p = applyBatch(createProject({ assets: [{ id: 'a1', duration: 10, name: 'v.mp4' }] }), [{ op: 'add_clip', asset_id: 'a1' }]).project;
  const r = applyBatch(p, ops); assert.ok(r.ok, r.message); assert.deepEqual(r.project.texts.map((t) => [t.start, t.end]), [[1, 3], [9.5, 10]], 'el final se recorta al video');
  assert.equal(cuesToOps(cues, 10, -1).ops[0].start, 0, 'con desfase negativo no sale un start < 0'); assert.equal(cuesToOps(cues, 0).ops.length, 0);
});
