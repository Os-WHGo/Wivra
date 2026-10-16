// Biblioteca de música original: determinista, sin silencio ni NaN, WAV válido. — Claude
import test from 'node:test'; import assert from 'node:assert/strict';
import { MUSIC_TRACKS, MUSIC_SR, musicTrackById, musicBars, musicSeconds, renderMusicTrack, encodeWavMono, musicWav, musicClock } from '../music-lib.mjs';

test('hay pistas con id y nombre únicos y duración de unos 30 s', () => {
  assert.ok(MUSIC_TRACKS.length >= 6);
  assert.equal(new Set(MUSIC_TRACKS.map((t) => t.id)).size, MUSIC_TRACKS.length);
  assert.equal(new Set(MUSIC_TRACKS.map((t) => t.name)).size, MUSIC_TRACKS.length);
  for (const t of MUSIC_TRACKS) { assert.equal(musicBars(t) % 4, 0, t.id); assert.ok(musicSeconds(t) >= 24 && musicSeconds(t) <= 40, `${t.id} ${musicSeconds(t)}`); assert.equal(t.kick.length, 16); assert.equal(t.bass.length, 16); assert.equal(t.arp.length, 16); }
  assert.equal(musicTrackById('nope'), null); assert.equal(musicClock(27), '0:27'); assert.equal(musicClock(65), '1:05');
});
test('cada pista suena (no es silencio), sin NaN, pico ≤ 0,8 y sin corte brusco al inicio y al final', () => {
  for (const t of MUSIC_TRACKS) {
    const a = renderMusicTrack(t); let sq = 0, peak = 0, bad = 0; for (const v of a) { if (!Number.isFinite(v)) bad++; sq += v * v; peak = Math.max(peak, Math.abs(v)); }
    assert.equal(bad, 0, t.id); assert.ok(Math.sqrt(sq / a.length) > 0.05, `${t.id} muy bajo`); assert.ok(peak <= 0.8001 && peak > 0.7, `${t.id} pico ${peak}`);
    assert.ok(Math.abs(a[0]) < 0.01 && Math.abs(a[a.length - 1]) < 0.01, `${t.id} sin fundidos`);
    assert.ok(Math.abs(a.length / MUSIC_SR - musicSeconds(t)) < 0.01, `${t.id} duración`);
  }
});
test('es determinista y las pistas se distinguen entre sí', () => {
  const t = MUSIC_TRACKS[0], a = renderMusicTrack(t), b = renderMusicTrack(t); assert.equal(a.length, b.length); assert.ok(a.every((v, i) => v === b[i]));
  const c = renderMusicTrack(MUSIC_TRACKS[1]); let diff = 0; for (let i = 0; i < Math.min(a.length, c.length); i += 97) if (Math.abs(a[i] - c[i]) > 0.01) diff++; assert.ok(diff > 100);
});
test('el WAV es válido: RIFF/fmt/data, 16 bits mono y tamaños coherentes', () => {
  const w = musicWav('calma'), v = new DataView(w.bytes.buffer), tag = (o) => String.fromCharCode(...w.bytes.slice(o, o + 4));
  assert.equal(tag(0), 'RIFF'); assert.equal(tag(8), 'WAVE'); assert.equal(tag(12), 'fmt '); assert.equal(tag(36), 'data');
  assert.equal(v.getUint16(20, true), 1); assert.equal(v.getUint16(22, true), 1); assert.equal(v.getUint32(24, true), MUSIC_SR); assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), w.bytes.length - 44); assert.equal(v.getUint32(4, true), w.bytes.length - 8);
  assert.equal(w.fileName, 'Wivra - Calma.wav'); assert.equal(musicWav('nope'), null);
  const s = encodeWavMono(new Float32Array([0, 1, -1, 2, -2]), 8000), q = new DataView(s.buffer);      // recorta a ±1
  assert.equal(q.getInt16(44 + 2, true), 32767); assert.equal(q.getInt16(44 + 4, true), -32767); assert.equal(q.getInt16(44 + 6, true), 32767);
});
test('una pista desconocida lanza un error claro', () => { assert.throws(() => renderMusicTrack({ scale: 'x' }), /desconocida/); assert.throws(() => renderMusicTrack(null), /desconocida/); });
