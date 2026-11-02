// Volumen parejo: medición según BS.1770 (comprobada contra valores conocidos de la norma) y ganancia segura. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { kWeightCoeffs, integratedLoudness, samplePeak, toRate, pcmFromChannels, monoOf, buildMix, planLoudness, LOUD_LEVELS } from '../loudness.mjs';
import { createProject } from '../../core/project.mjs';
import { applyBatch } from '../../core/operations.mjs';

const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sine = (fs, sec, amp, f = 997) => { const x = new Float32Array(Math.round(fs * sec)); for (let i = 0; i < x.length; i++) x[i] = amp * Math.sin(2 * Math.PI * f * i / fs); return x; };

test('coeficientes a 48 kHz = valores publicados en la norma', () => {
  const [sh, hp] = kWeightCoeffs(48000);
  [1.53512485958697, -2.69169618940638, 1.19839281085285].forEach((v, i) => assert.ok(near(sh.b[i], v, 1e-9), `b${i}`));
  [-1.69065929318241, 0.73248077421585].forEach((v, i) => assert.ok(near(sh.a[i + 1], v, 1e-9), `a${i + 1}`));
  [-1.99004745483398, 0.99007225036621].forEach((v, i) => assert.ok(near(hp.a[i + 1], v, 1e-6), `hp a${i + 1}`));
});
test('norma: seno de 997 Hz con pico −23 dBFS en AMBOS canales mide −23,0 LUFS; en un solo canal, 3 dB menos (a 48 k y a 16 k)', () => {
  for (const fs of [48000, 16000]) {
    const A = 10 ** (-23 / 20), x = sine(fs, 5, A), est = integratedLoudness([x, x], fs), uno = integratedLoudness(x, fs);
    assert.ok(near(est, -23, 0.1), `${fs} Hz estéreo: ${est}`); assert.ok(near(uno, -26.01, 0.1), `${fs} Hz un canal: ${uno}`);
  }
});
test('el silencio y los tramos casi mudos no cuentan (compuertas)', () => {
  assert.equal(integratedLoudness(new Float32Array(48000), 48000), -Infinity);
  const fs = 16000, voz = sine(fs, 4, 0.3), x = new Float32Array(fs * 14); x.set(voz, 0);                       // 4 s de señal + 10 s de silencio
  assert.ok(near(integratedLoudness([x, x], fs), integratedLoudness([voz, voz], fs), 0.3));
  const bajo = new Float32Array(fs * 8); bajo.set(sine(fs, 4, 0.3), 0); bajo.set(sine(fs, 4, 0.3 * 0.05), fs * 4);     // un tramo 26 dB más bajo
  assert.ok(near(integratedLoudness(bajo, fs), integratedLoudness(voz, fs), 0.5), 'el tramo muy bajo queda fuera por la compuerta relativa');
});
test('datos dañados (NaN) no rompen la medición', () => { const x = sine(16000, 2, 0.3); x[10] = NaN; assert.ok(Number.isFinite(integratedLoudness(x, 16000))); });
test('toRate baja la frecuencia; un mono usa el mismo canal a izquierda y derecha; monoOf promedia', () => {
  assert.equal(toRate(new Float32Array(48000).fill(0.5), 48000, 16000).length, 16000); assert.equal(toRate(new Float32Array(44100), 44100, 16000).length, 16000);
  const mono = pcmFromChannels([new Float32Array(48000).fill(0.4)], 48000); assert.ok(mono.l === mono.r && near(mono.l[10], 0.4, 1e-6)); assert.equal(monoOf(mono), mono.l);
  const st = pcmFromChannels([new Float32Array(48000).fill(0.5), new Float32Array(48000).fill(-0.1)], 48000); assert.ok(near(monoOf(st)[100], 0.2, 1e-6)); assert.ok(near(st.r[5], -0.1, 1e-6));
});

const proj = () => {
  let p = createProject({ assets: [{ id: 'a1', duration: 20, name: 'v.mp4' }, { id: 'm1', duration: 30, name: 'm.wav', kind: 'audio' }, { id: 'p1', duration: 3600, name: 'f.jpg', kind: 'image' }] });
  return applyBatch(p, [{ op: 'add_clip', asset_id: 'a1', start: 0 }, { op: 'trim_clip', clip_id: 'c1', in: 2, out: 8 }, { op: 'add_photo_clip', asset_id: 'p1', start: 6, duration: 2 }, { op: 'add_audio_clip', asset_id: 'm1', start: 1, in: 0, out: 3 }]).project;
};
test('buildMix: pone cada audio en su sitio, con su volumen; fotos y silenciados no suenan', () => {
  const p = proj(), mk = (n, v) => { const l = new Float32Array(n * 16000).fill(v); return { l, r: l }; }, pcm = { a1: mk(20, 0.2), m1: mk(30, 0.1) };
  const m = buildMix(p, (id) => pcm[id]); assert.equal(m.rate, 16000); assert.ok(near(m.seconds, 6, 1e-9));
  assert.ok(near(m.channels[0][0.5 * 16000], 0.2, 1e-6)); assert.ok(near(m.channels[0][2 * 16000], 0.3, 1e-6)); assert.ok(near(m.channels[0][4.5 * 16000], 0.2, 1e-6));
  const q = applyBatch(p, [{ op: 'set_clip_audio', clip_id: 'c1', muted: true }]).project, m2 = buildMix(q, (id) => pcm[id]); assert.ok(near(m2.channels[0][0.5 * 16000], 0, 1e-9)); assert.ok(near(m2.channels[0][2 * 16000], 0.1, 1e-6));
  const m3 = buildMix(p, (id) => (id === 'a1' ? null : pcm[id])); assert.deepEqual(m3.missing, ['a1']);
});
test('planLoudness: sube hasta el objetivo, se frena por el pico y baja si hace falta', () => {
  let r = planLoudness({ lufs: -20, peak: 0.1 }, -14); assert.ok(r.ok && near(r.gainDb, 6, 1e-9) && r.reached && !r.limitedByPeak);       // pico −20 dB: cabe
  r = planLoudness({ lufs: -20, peak: 0.8 }, -14); assert.ok(near(r.peakDb + r.gainDb, -1.5, 0.01), 'el pico no pasa de −1,5 dB'); assert.ok(r.limitedByPeak && !r.reached && /romp/.test(r.note));
  r = planLoudness({ lufs: -8, peak: 0.5 }, -14); assert.ok(near(r.gainDb, -6, 1e-9) && r.reached);
  r = planLoudness({ lufs: -14.1, peak: 0.5 }, -14); assert.ok(/cerca/.test(r.note));
  r = planLoudness({ lufs: -60, peak: 0.0001 }, -14); assert.ok(r.gainDb <= 12 && r.ok);
  assert.equal(planLoudness({ lufs: -Infinity, peak: 0 }, -14).ok, false); assert.equal(planLoudness({ lufs: -20, peak: 0.1 }, null).ok, false);
});
test('opciones del selector', () => { assert.equal(LOUD_LEVELS.off.target, null); assert.equal(LOUD_LEVELS.balanced.target, -14); assert.equal(LOUD_LEVELS.quiet.target, -16); });
