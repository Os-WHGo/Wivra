// Separar los canales de un audio (dos micrófonos en un estéreo): el WAV de cada canal, los nombres y cuándo una pista pide separar. — Claude
// Parte pura (sin navegador): app/channel-split.mjs y app/capture-manifest.mjs. La decodificación real se prueba aparte en un navegador.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SPLIT_MAX_BYTES, splitFileName, wavFromChannel, assignAudioLanes } from '../channel-split.mjs';
import { needsChannelSplit, parseManifest, importPlan, planImportOps } from '../capture-manifest.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const FIX = JSON.parse(read('./fixtures/manifest-v2-fixtures.json')).cases;

// Mini lector de WAV PCM de 16 bits para comprobar lo escrito.
function readWav(buf) {
  const v = new DataView(buf), tag = (o) => String.fromCharCode(...[0, 1, 2, 3].map((i) => v.getUint8(o + i)));
  return { riff: tag(0), size: v.getUint32(4, true), wave: tag(8), fmt: tag(12), fmtSize: v.getUint32(16, true), format: v.getUint16(20, true), channels: v.getUint16(22, true),
    rate: v.getUint32(24, true), byteRate: v.getUint32(28, true), blockAlign: v.getUint16(32, true), bits: v.getUint16(34, true), data: tag(36), dataSize: v.getUint32(40, true),
    samples: Array.from({ length: (buf.byteLength - 44) / 2 }, (_, i) => v.getInt16(44 + i * 2, true)) };
}

test('wavFromChannel escribe un WAV PCM de 16 bits, mono, con la cabecera correcta', () => {
  const w = readWav(wavFromChannel(new Float32Array([0, 0.5, -0.5]), 48000));
  assert.deepEqual([w.riff, w.wave, w.fmt, w.data], ['RIFF', 'WAVE', 'fmt ', 'data']);
  assert.deepEqual([w.fmtSize, w.format, w.channels, w.rate, w.byteRate, w.blockAlign, w.bits], [16, 1, 1, 48000, 96000, 2, 16]);
  assert.equal(w.dataSize, 6); assert.equal(w.size, 36 + 6);
});

test('convierte las muestras, recorta lo que se pasa de rango y deja NaN en silencio', () => {
  const w = readWav(wavFromChannel(new Float32Array([0, 1, -1, 0.5, -0.5, 2, -2, NaN]), 44100));
  assert.deepEqual(w.samples, [0, 32767, -32768, 16383, -16384, 32767, -32768, 0]);
});

test('ida y vuelta: un tono de 440 Hz vuelve igual (error máximo de 1 escalón de 16 bits)', () => {
  const n = 4800, x = Float32Array.from({ length: n }, (_, i) => 0.8 * Math.sin((2 * Math.PI * 440 * i) / 48000));
  const w = readWav(wavFromChannel(x, 48000)); assert.equal(w.samples.length, n);
  let worst = 0; for (let i = 0; i < n; i++) worst = Math.max(worst, Math.abs(w.samples[i] / (x[i] < 0 ? 32768 : 32767) - x[i]));
  assert.ok(worst <= 1 / 32767 + 1e-9, 'error máximo ' + worst);
});

test('la frecuencia de muestreo se redondea y una inválida se rechaza; un audio vacío da un WAV válido', () => {
  assert.equal(readWav(wavFromChannel(new Float32Array(2), 44099.6)).rate, 44100);
  assert.throws(() => wavFromChannel(new Float32Array(2), 0), /frecuencia/);
  assert.throws(() => wavFromChannel(new Float32Array(2), NaN), /frecuencia/);
  const e = wavFromChannel(new Float32Array(0), 48000); assert.equal(e.byteLength, 44); assert.equal(readWav(e).dataSize, 0);
});

test('splitFileName: el canal 0 es «canal1» (como lo cuenta la persona) y se conserva todo menos la extensión', () => {
  assert.equal(splitFileName('entrevista.wav', 0), 'entrevista.canal1.wav');
  assert.equal(splitFileName('entrevista.wav', 1), 'entrevista.canal2.wav');
  assert.equal(splitFileName('a.b.caf', 1), 'a.b.canal2.wav');
  assert.equal(splitFileName('sin_extension', 0), 'sin_extension.canal1.wav');
  assert.equal(splitFileName('.wav', 0), 'audio.canal1.wav');
});

test('el tope de tamaño es razonable para un teléfono (se decodifica entero en memoria)', () => {
  assert.ok(SPLIT_MAX_BYTES >= 10 * 1024 * 1024 && SPLIT_MAX_BYTES <= 200 * 1024 * 1024, String(SPLIT_MAX_BYTES));
});

test('needsChannelSplit: solo un canal de un archivo con varios pide separar', () => {
  assert.equal(needsChannelSplit({ channelIndex: null }), false);
  assert.equal(needsChannelSplit({}), false);
  assert.equal(needsChannelSplit({ channelIndex: 0, channelCount: 2 }), true);
  assert.equal(needsChannelSplit({ channelIndex: 1, channelCount: 2 }), true);
  assert.equal(needsChannelSplit({ channelIndex: 2, channelCount: 6 }), true);
  assert.equal(needsChannelSplit({ channelIndex: 0, channelCount: null }), true, 'si no se sabe cuántos canales hay, se separa por precaución');
  assert.equal(needsChannelSplit({ channelIndex: 0, channelCount: 1 }), false, 'un archivo de un solo canal ya ES ese canal');
});

const track = (id, extra = {}) => ({ id, role: 'voice_primary', file: 'iv.wav', channelIndex: null, channelCount: null, offsetSeconds: 0, offsetKnown: true, ...extra });

test('planImportOps: un archivo de un solo canal con channelIndex 0 se importa entero (no hay nada que separar)', () => {
  const plan = { videoFile: 'v.mov', audioTracks: [track('t1', { file: 'solo.wav', channelIndex: 0, channelCount: 1 })] };
  const r = planImportOps(plan, { videoStart: 0, assets: { 'v.mov': { id: 'v', duration: 10 }, 'solo.wav': { id: 'w', duration: 10 } } });
  assert.deepEqual(r.ops.map((o) => [o.op, o.asset_id]), [['add_clip', 'v'], ['add_audio_clip', 'w']]); assert.deepEqual(r.skipped, []);
});

test('planImportOps: con los canales separados de verdad, cada pista usa SU audio y nunca el archivo entero', () => {
  const plan = { videoFile: 'v.mov', audioTracks: [track('host', { channelIndex: 0, channelCount: 2 }), track('guest', { channelIndex: 1, channelCount: 2, role: 'voice_guest' })] };
  const r = planImportOps(plan, { videoStart: 0, assets: { 'v.mov': { id: 'v', duration: 10 }, 'iv.wav': { id: 'whole', duration: 10 } },
    splitChannelAssets: { host: { id: 'L', duration: 10 }, guest: { id: 'R', duration: 10 } } });
  assert.deepEqual(r.ops.filter((o) => o.op === 'add_audio_clip').map((o) => [o.asset_id, o.role]), [['L', 'voice_primary'], ['R', 'voice_guest']]);
  assert.ok(!r.ops.some((o) => o.asset_id === 'whole')); assert.deepEqual(r.skipped, []); assert.deepEqual(r.warnings, []);
});

test('planImportOps: sin separar, avisa con el número de canal que ve la persona (1 y 2, no 0 y 1)', () => {
  const plan = { videoFile: 'v.mov', audioTracks: [track('host', { channelIndex: 0, channelCount: 2 }), track('guest', { channelIndex: 1, channelCount: 2 })] };
  const r = planImportOps(plan, { videoStart: 0, assets: { 'v.mov': { id: 'v', duration: 10 }, 'iv.wav': { id: 'whole', duration: 10 } } });
  assert.equal(r.ops.filter((o) => o.op === 'add_audio_clip').length, 0);
  assert.ok(r.warnings.some((w) => /host: canal 1 no separado/.test(w)) && r.warnings.some((w) => /guest: canal 2 no separado/.test(w)), r.warnings.join(' | '));
});

test('el manifiesto de ejemplo con dos micrófonos (interview.wav, canales 0 y 1) se importa como dos pistas', () => {
  const m = parseManifest(FIX.find((c) => c.name === 'usb-stereo-two-transmitters-hypothetical').manifest).manifest, plan = importPlan(m);
  assert.deepEqual(plan.audioTracks.map((t) => [t.file, t.channelIndex, t.channelCount]), [['interview.wav', 0, 2], ['interview.wav', 1, 2]]);
  assert.ok(plan.audioTracks.every(needsChannelSplit));
  const split = Object.fromEntries(plan.audioTracks.map((t, i) => [t.id, { id: 'ch' + i, duration: 30 }]));
  const r = planImportOps(plan, { videoStart: 0, assets: { [plan.videoFile]: { id: 'v', duration: 30 } }, splitChannelAssets: split });
  assert.deepEqual(r.ops.filter((o) => o.op === 'add_audio_clip').map((o) => o.asset_id), ['ch0', 'ch1']);
});

// ───────── una fila de la línea de tiempo por voz ─────────
const au = (start, dur, extra = {}) => ({ op: 'add_audio_clip', asset_id: 'x', start, in: 0, out: dur, role: 'other', ...extra });

test('assignAudioLanes: dos voces a la vez → fila 1 (sin escribir track) y fila 2', () => {
  const r = assignAudioLanes([au(0, 3), au(0, 3)]);
  assert.equal(r[0].track, undefined); assert.equal(r[1].track, 2);
});

test('assignAudioLanes: tres voces a la vez → filas 1, 2 y 3; con más que el máximo se quedan en la última', () => {
  assert.deepEqual(assignAudioLanes([au(0, 3), au(0, 3), au(0, 3)]).map((o) => o.track ?? 1), [1, 2, 3]);
  assert.deepEqual(assignAudioLanes([au(0, 3), au(0, 3), au(0, 3), au(0, 3)]).map((o) => o.track ?? 1), [1, 2, 3, 3]);
  assert.deepEqual(assignAudioLanes([au(0, 3), au(0, 3), au(0, 3)], [], 2).map((o) => o.track ?? 1), [1, 2, 2], 'respeta el máximo que se pida');
});

test('assignAudioLanes: no modifica lo que recibe y deja pasar tal cual las demás operaciones', () => {
  const clip = { op: 'add_clip', asset_id: 'v', start: 0 }, a = au(0, 3), b = au(0, 3), snap = JSON.stringify([clip, a, b]);
  const r = assignAudioLanes([clip, a, b]);
  assert.equal(JSON.stringify([clip, a, b]), snap, 'las operaciones de entrada quedaron intactas');
  assert.equal(r[0], clip, 'add_clip pasa igual'); assert.equal(r[1], a, 'la fila 1 pasa igual (misma operación)'); assert.notEqual(r[2], b); assert.equal(r[2].track, 2);
});

test('assignAudioLanes: clips uno detrás de otro (sin tocarse) comparten la fila 1', () => {
  assert.deepEqual(assignAudioLanes([au(0, 3), au(3, 2), au(5, 1)]).map((o) => o.track ?? 1), [1, 1, 1], 'terminar donde empieza el siguiente no es solaparse');
  assert.deepEqual(assignAudioLanes([au(0, 3), au(2.9, 2)]).map((o) => o.track ?? 1), [1, 2], 'pero 0,1 s de solape sí');
});

test('assignAudioLanes: tiene en cuenta lo que ya hay en el proyecto y usa la primera fila LIBRE', () => {
  const existing = [{ start: 0, in: 0, out: 10, track: 1 }, { start: 0, in: 2, out: 6 }];      // el segundo no trae track = fila 1
  assert.deepEqual(assignAudioLanes([au(5, 3)], existing).map((o) => o.track ?? 1), [2], 'la fila 1 está ocupada de 0 a 10');
  assert.deepEqual(assignAudioLanes([au(10, 3)], existing).map((o) => o.track ?? 1), [1], 'después de 10 s la fila 1 está libre');
  assert.deepEqual(assignAudioLanes([au(0, 3)], [{ start: 0, in: 0, out: 5, track: 2 }]).map((o) => o.track ?? 1), [1], 'si solo la fila 2 está ocupada, se usa la 1');
});

test('assignAudioLanes: el plan de dos micrófonos queda en dos filas y el video no se toca', () => {
  const m = parseManifest(FIX.find((c) => c.name === 'usb-stereo-two-transmitters-hypothetical').manifest).manifest, plan = importPlan(m);
  const split = Object.fromEntries(plan.audioTracks.map((t, i) => [t.id, { id: 'ch' + i, duration: 30 }]));
  const ops = assignAudioLanes(planImportOps(plan, { videoStart: 0, assets: { [plan.videoFile]: { id: 'v', duration: 30 } }, splitChannelAssets: split }).ops);
  assert.deepEqual(ops.map((o) => [o.op, o.asset_id, o.track ?? 1]), [['add_clip', 'v', 1], ['add_audio_clip', 'ch0', 1], ['add_audio_clip', 'ch1', 2]]);
});

test('assignAudioLanes: sin operaciones o con datos incompletos no falla', () => {
  assert.deepEqual(assignAudioLanes([]), []);
  assert.doesNotThrow(() => assignAudioLanes([{ op: 'add_audio_clip', asset_id: 'x' }, { op: 'add_audio_clip', asset_id: 'y' }]));
});

test('el aviso de importación pone primero la causa y no repite «canal independiente sin extraer»', () => {
  const piece = "const all = [...notes, ...failed.filter(x => !/^falta /.test(x)), ...out.warnings, ...out.skipped.filter(x => x.reason !== 'canal independiente sin extraer').map(";
  for (const [name, s] of [['plantilla', read('../template.html')], ['archivo final', read('../dist/agentcut.html')]]) assert.ok(s.includes(piece), `${name}: cambió el armado del aviso`);
});

test('la plantilla y el archivo final separan canales de verdad y se lo pasan al planificador', () => {
  for (const [name, s] of [['plantilla', read('../template.html')], ['archivo final', read('../dist/agentcut.html')]]) {
    for (const piece of ['async function decodeChannelWavs(', 'wavFromChannel(buf.getChannelData(ch)', 'needsChannelSplit(t) ? splitOf(t)', 'splitChannelAssets: split', 'splitFileName(f.name, x.channelIndex)', 'assignAudioLanes(out.ops, session.project.audioClips || [], UI_MAX_AUDIO)'])
      assert.ok(s.includes(piece), `${name}: falta «${piece}»`);
    assert.ok(!s.includes('todavía no se extraen canales'), name + ': quedó el aviso viejo de que no se separan canales');
  }
  const dist = read('../dist/agentcut.html');
  assert.ok(dist.includes('function wavFromChannel(') && dist.includes('function assignAudioLanes(') && dist.includes('const SPLIT_MAX_BYTES') && dist.includes('const needsChannelSplit'), 'el archivo final no trae el módulo');
  assert.ok(read('../build.mjs').includes("'./channel-split.mjs'"), 'build.mjs no incluye channel-split.mjs');
});
