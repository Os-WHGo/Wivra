// Voces que suenan a la vez en una captura (por ejemplo dos micrófonos grabados en un solo archivo estéreo). — Claude
// Parte pura, sin navegador: el navegador decodifica el archivo (Web Audio) y esto empaqueta UN canal como WAV mono de 16 bits,
// que entra al editor como un audio más. Los originales no se tocan; cada voz queda como pista independiente (ver PR #71)
// y en su propia fila de la línea de tiempo (assignAudioLanes).

/** Tope del archivo a separar: el navegador lo decodifica ENTERO en memoria y en el teléfono eso pesa. */
export const SPLIT_MAX_BYTES = 80 * 1024 * 1024;

/** Nombre del archivo de un canal: «entrevista.wav», canal 1 → «entrevista.canal2.wav» (canal 0 = izquierdo = «canal1»). */
export const splitFileName = (name, channelIndex) => `${String(name).replace(/\.[^./\\]*$/, '') || 'audio'}.canal${channelIndex + 1}.wav`;

/** Muestras (Float32, -1…1) → WAV PCM de 16 bits, mono. Devuelve un ArrayBuffer. Los valores fuera de rango se recortan; NaN queda en silencio. */
export function wavFromChannel(samples, sampleRate) {
  const n = samples.length, rate = Math.round(sampleRate);
  if (!(rate > 0)) throw new Error('frecuencia de muestreo inválida');
  const bytes = 44 + n * 2, buf = new ArrayBuffer(bytes), v = new DataView(buf);
  const tag = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  tag(0, 'RIFF'); v.setUint32(4, bytes - 8, true); tag(8, 'WAVE');
  tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);        // PCM, 1 canal
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  tag(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return buf;
}

/**
 * Fila (pista) de audio de cada `add_audio_clip` de un lote: la primera libre en ese tramo de tiempo, mirando lo que ya hay (`existing`)
 * y lo que se agregó antes en el mismo lote. Sin esto, dos voces que suenan a la vez (los dos canales de un estéreo) quedarían una
 * encima de la otra en la misma fila y no se podría tocar la de abajo. Igual que al agregar un audio a mano: la fila 1 es la de siempre
 * (no se escribe `track`); si todas las filas hasta `max` están ocupadas se queda en la última. Devuelve operaciones nuevas, no modifica las de entrada.
 */
export function assignAudioLanes(ops, existing = [], max = 3) {
  const taken = existing.map((c) => ({ track: c.track || 1, a: c.start, b: c.start + (c.out - c.in) }));
  return ops.map((o) => {
    if (o.op !== 'add_audio_clip') return o;
    const a = o.start ?? 0, b = a + ((o.out ?? 0) - (o.in ?? 0));
    let t = 1; while (t < max && taken.some((x) => x.track === t && x.a < b && x.b > a)) t++;
    taken.push({ track: t, a, b });
    return t > 1 ? { ...o, track: t } : o;
  });
}
