// Biblioteca de música ORIGINAL de Wivra: pistas compuestas con código (sintetizador propio, sin muestras ni música de terceros), así no hay derechos ajenos. — Claude
// Todo se genera en el teléfono, sin conexión y de forma determinista (mismo resultado siempre). Solo lógica pura: sin DOM ni WebAudio, se prueba en Node.
// Licencia: obra original de este repositorio; queda bajo la licencia que el propietario apruebe para el repo (propuesta: MIT, PR #36). NO usa muestras, loops ni melodías ajenas.
// Calidad: son pistas sencillas de fondo (ritmo, bajo, acordes, melodía corta). Su gusto musical NO se ha evaluado con oyentes reales.

export const MUSIC_SR = 32000;            // Hz; suficiente para fondo y ligero (30 s ≈ 1,9 MB en WAV de 16 bits mono)
export const MUSIC_TARGET_SECONDS = 30;

// Escalas en semitonos desde la tónica.
const MU_SC = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], pent: [0, 3, 5, 7, 10] };
const muX = (s) => [...s.replace(/\s/g, '')].map((c) => c === 'x' || c === 'X' ? 1 : c === 'o' ? 0.5 : 0);   // x = golpe fuerte, o = golpe suave, . = silencio

/**
 * Cada pista: bpm, tónica (Hz), escala, progresión de acordes (grado de la escala por compás), patrones de 16 pasos por compás
 * (kick/snare/hat/bass/arp) y mezcla. `arp` son grados dentro del acorde del compás (0 = tónica, 1 = tercera, 2 = quinta, 3 = octava).
 */
export const MUSIC_TRACKS = [
  { id: 'pulso', name: 'Pulso', mood: 'Alegre y con ritmo', bpm: 118, root: 220, scale: 'minor', prog: [0, 5, 2, 6],
    kick: muX('x...x...x...x...'), snare: muX('....x.......x...'), hat: muX('..o...o...o...o.'), bass: muX('x..x..x.x..x..x.'), arp: [0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 2, 3, 2, 1, 3], pad: 0.5, arpGain: 0.5, swing: 0 },
  { id: 'calma', name: 'Calma', mood: 'Suave, para fondo', bpm: 72, root: 196, scale: 'major', prog: [0, 4, 5, 3],
    kick: muX('x.......x.......'), snare: [], hat: [], bass: muX('x.......x.......'), arp: [0, null, 2, null, 3, null, 2, null, 1, null, 2, null, 3, null, 2, null], pad: 1, arpGain: 0.45, swing: 0 },
  { id: 'viaje', name: 'Viaje', mood: 'Abierto, de paseo', bpm: 100, root: 196, scale: 'major', prog: [0, 3, 4, 0],
    kick: muX('x.....x.x.......'), snare: muX('....o.......o...'), hat: muX('o.o.o.o.o.o.o.o.'), bass: muX('x.....x.x.....x.'), arp: [0, null, 2, 3, null, 2, 1, null, 0, null, 2, 3, null, 2, 1, null], pad: 0.7, arpGain: 0.55, swing: 0 },
  { id: 'energia', name: 'Energía', mood: 'Fuerte, para deporte', bpm: 138, root: 164.8, scale: 'minor', prog: [0, 0, 5, 6],
    kick: muX('x...x...x...x...'), snare: muX('....x.......x...'), hat: muX('.o.o.o.o.o.o.o.o'), bass: muX('xxoxxoxxxxoxxoxx'), arp: [0, 3, 2, 3, 0, 3, 2, 3, 0, 3, 2, 3, 0, 3, 2, 3], pad: 0.35, arpGain: 0.4, swing: 0 },
  { id: 'suspenso', name: 'Suspenso', mood: 'Oscuro y tenso', bpm: 84, root: 130.8, scale: 'minor', prog: [0, 0, 5, 4],
    kick: muX('x...............'), snare: [], hat: muX('....o.......o...'), bass: muX('x...............'), arp: [3, null, null, null, null, null, 2, null, null, null, null, null, 1, null, null, null], pad: 1, arpGain: 0.35, swing: 0 },
  { id: 'lofi', name: 'Lo-fi', mood: 'Tranquilo, con groove', bpm: 82, root: 207.7, scale: 'major', prog: [1, 4, 0, 5],
    kick: muX('x.....x...x.....'), snare: muX('....x.......x...'), hat: muX('o.o.o.o.o.o.o.o.'), bass: muX('x.......x.....x.'), arp: [null, null, 2, null, null, 1, null, null, null, null, 3, null, null, 2, null, null], pad: 0.8, arpGain: 0.5, swing: 0.18 },
];

export const musicTrackById = (id) => MUSIC_TRACKS.find((t) => t.id === id) || null;
export const musicBarSeconds = (t) => 4 * 60 / t.bpm;
/** Compases enteros (múltiplo de 4, para cerrar la progresión) que se acercan a 30 s. */
export const musicBars = (t) => Math.max(4, Math.round(MUSIC_TARGET_SECONDS / musicBarSeconds(t) / 4) * 4);
export const musicSeconds = (t) => Math.round(musicBars(t) * musicBarSeconds(t) * 100) / 100;
export const musicClock = (s) => { const n = Math.round(s); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };

const muHz = (root, semis) => root * Math.pow(2, semis / 12);
function muDeg(scaleName, deg) { const s = MU_SC[scaleName], n = s.length, oct = Math.floor(deg / n); return s[((deg % n) + n) % n] + 12 * oct; }
/** Notas (semitonos) del acorde sobre el grado `deg`: tónica, tercera, quinta y octava. */
function muChord(scaleName, deg) { return [0, 2, 4, 7].map((k) => muDeg(scaleName, deg + k)); }
function muArp(scaleName, deg) { const s = MU_SC[scaleName].length; return [muDeg(scaleName, deg), muDeg(scaleName, deg + 2), muDeg(scaleName, deg + 4), muDeg(scaleName, deg + s)]; }

function muRng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; }; }

/** renderMusicTrack(track, sr) → Float32Array mono, normalizado a un pico de 0,8, con entrada y salida suaves. Determinista. */
export function renderMusicTrack(t, sr = MUSIC_SR) {
  if (!t || !MU_SC[t.scale]) throw new Error('Pista de música desconocida.');
  const bars = musicBars(t), step = 60 / t.bpm / 4, total = Math.ceil(bars * 16 * step * sr), out = new Float32Array(total), noise = muRng(7 + t.bpm);
  const put = (at, f) => { const i0 = Math.max(0, Math.floor(at * sr)); f(i0); };
  const TAU = Math.PI * 2;
  const kick = (at, g) => put(at, (i0) => { const n = Math.min(total - i0, Math.floor(0.3 * sr)); let ph = 0; for (let i = 0; i < n; i++) { const x = i / sr, f = 45 + 90 * Math.exp(-x * 28); ph += TAU * f / sr; out[i0 + i] += Math.sin(ph) * Math.exp(-x * 11) * g; } });
  const snare = (at, g) => put(at, (i0) => { const n = Math.min(total - i0, Math.floor(0.2 * sr)); for (let i = 0; i < n; i++) { const x = i / sr; out[i0 + i] += (noise() * 0.7 + Math.sin(TAU * 190 * x) * 0.3) * Math.exp(-x * 24) * g; } });
  const hat = (at, g) => put(at, (i0) => { const n = Math.min(total - i0, Math.floor(0.06 * sr)); let prev = 0; for (let i = 0; i < n; i++) { const x = i / sr, w = noise(); out[i0 + i] += (w - prev) * 0.5 * Math.exp(-x * 90) * g; prev = w; } });
  const tone = (at, dur, freq, g, o) => put(at, (i0) => {      // voz con ataque/caída; o.h = armónicos [amp2, amp3], o.rel = cola, o.dec = caída exponencial
    const n = Math.min(total - i0, Math.floor((dur + (o.rel || 0.05)) * sr)), atk = o.atk ?? 0.005, dec = o.dec ?? 0;
    for (let i = 0; i < n; i++) {
      const x = i / sr, env = Math.min(1, x / atk) * (x < dur ? 1 : Math.max(0, 1 - (x - dur) / (o.rel || 0.05))) * Math.exp(-x * dec);
      const w = TAU * freq * x, v = Math.sin(w) + (o.h ? (o.h[0] || 0) * Math.sin(2 * w) + (o.h[1] || 0) * Math.sin(3 * w) : 0);
      out[i0 + i] += v * env * g;
    }
  });
  const sw = (s) => (s % 2 === 1 ? step * t.swing : 0);      // las semicorcheas impares se retrasan (groove)
  for (let bar = 0; bar < bars; bar++) {
    const deg = t.prog[bar % t.prog.length], b0 = bar * 16 * step, ch = muChord(t.scale, deg), ar = muArp(t.scale, deg);
    // colchón (pad): acorde largo, tres notas con un ligero desafinado
    if (t.pad) for (const k of [0, 1, 2]) for (const dt of [-0.004, 0.004]) tone(b0, 16 * step, muHz(t.root, ch[k]) * (1 + dt), 0.07 * t.pad, { atk: Math.min(0.6, 8 * step), rel: 0.4 });
    for (let s = 0; s < 16; s++) {
      const at = b0 + s * step + sw(s);
      if (t.kick[s]) kick(at, 0.9 * t.kick[s]);
      if (t.snare && t.snare[s]) snare(at, 0.45 * t.snare[s]);
      if (t.hat && t.hat[s]) hat(at, 0.35 * t.hat[s]);
      if (t.bass[s]) tone(at, step * 1.8, muHz(t.root / 2, ch[0]), 0.34 * t.bass[s], { atk: 0.006, rel: 0.06, dec: 3.5, h: [0.45, 0.2] });
      const a = t.arp[s]; if (a !== null && a !== undefined) tone(at, step * 1.6, muHz(t.root * 2, ar[a]), 0.16 * t.arpGain, { atk: 0.004, rel: 0.1, dec: 5, h: [0.25, 0.08] });
    }
  }
  let peak = 0; for (let i = 0; i < total; i++) { const a = Math.abs(out[i]); if (a > peak) peak = a; }
  const k = peak > 0 ? 0.8 / peak : 1, fin = Math.floor(0.01 * sr), fout = Math.min(total, Math.floor(1.2 * sr));
  for (let i = 0; i < total; i++) { let g = k; if (i < fin) g *= i / fin; if (i >= total - fout) g *= (total - i) / fout; out[i] *= g; }
  return out;
}

/** encodeWavMono(samples, sr) → Uint8Array con un WAV PCM de 16 bits, mono. */
export function encodeWavMono(samples, sr = MUSIC_SR) {
  const n = samples.length, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf), w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767 | 0, true);
  return new Uint8Array(buf);
}

/** musicWav(id) → { name, fileName, bytes, seconds } | null */
export function musicWav(id) {
  const t = musicTrackById(id); if (!t) return null;
  return { name: t.name, fileName: `Wivra - ${t.name}.wav`, bytes: encodeWavMono(renderMusicTrack(t)), seconds: musicSeconds(t) };
}
