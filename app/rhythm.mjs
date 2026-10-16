// Revisión de ritmo del Director: mira el proyecto (tiempos, cortes, textos) y avisa en español de lo que suele restar atención. Solo lógica pura, sin DOM. — Claude
// NO ve ni oye el video: solo cuenta tiempos. Los avisos «warn» son problemas objetivos (huecos, textos que no da tiempo a leer, música que sobra);
// los «tip» son GUÍA EDITORIAL de Wivra (gancho en los primeros 3 s, planos largos, cierre) y cada autor puede ignorarlos. No cambia nada por sí sola.
import { safeZoneOn } from '../core/text-style.mjs';

export const RH = {
  hookSeconds: 3,            // el «gancho»: lo que pasa en los primeros 3 s
  longShot: 8, longShotLong: 15, longPhoto: 4,     // plano largo (video corto / video largo) y foto fija larga, en segundos
  longVideoFrom: 90,         // desde esta duración se tolera el plano largo de `longShotLong`
  endSeconds: 3,             // zona de cierre: los últimos 3 s
  maxCps: 18,                // caracteres por segundo que se pueden leer cómodos (guía de subtítulos; la cifra de 17 cps de Netflix NO se verificó en esta sesión)
  minTextSeconds: 1, gap: 0.1, tail: 0.5, listMax: 3,
};
const rhR = (x) => Math.round(x * 10) / 10;
export const rhClock = (s) => { const t = Math.max(0, Math.round(s)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };

/**
 * analyzeRhythm(project) → { ok, items:[{ level:'warn'|'tip'|'ok', code, text, at, action? }], stats:{ seconds, shots, avgShot } } | { ok:false, error }
 * `at` = segundo de la línea de tiempo al que llevar al usuario. `action:'safe'` = se puede arreglar con la zona segura de textos.
 */
export function analyzeRhythm(project) {
  if (!project || !Array.isArray(project.clips) || !project.clips.length) return { ok: false, error: 'Primero agrega videos a la línea de tiempo.' };
  const kind = new Map((project.assets || []).map((a) => [a.id, a.kind])), mains = [...project.clips].sort((a, b) => a.start - b.start);
  const len = (c) => c.out - c.in, endOf = (c) => c.start + len(c), texts = project.texts || [], overlays = project.overlayClips || [], audio = project.audioClips || [];
  const mainEnd = mains.reduce((m, c) => Math.max(m, endOf(c)), 0), items = [];
  const long = mainEnd >= RH.longVideoFrom, add = (level, code, text, at = 0, extra = {}) => items.push({ level, code, text, at: Math.max(0, rhR(at)), ...extra });
  const group = (list, code, level, line, more) => {      // muestra hasta `listMax` casos y resume el resto
    list.slice(0, RH.listMax).forEach((x) => add(level, code, line(x), x.at));
    if (list.length > RH.listMax) add(level, code, more(list.length - RH.listMax), list[RH.listMax].at);
  };

  // 1. Huecos en la línea principal (se ven negros).
  const gaps = []; let cursor = 0;
  for (const c of mains) { if (c.start - cursor > RH.gap) gaps.push({ at: cursor, secs: c.start - cursor }); cursor = Math.max(cursor, endOf(c)); }
  group(gaps, 'gap', 'warn', (g) => `Hay un hueco negro de ${rhR(g.secs)} s en ${rhClock(g.at)}.`, (n) => `Y ${n} huecos negros más.`);

  // 2. Música o capas que pasan del último video (el video exportado queda negro ahí).
  const tailOf = [...audio.map((c) => ({ c, what: 'El audio' })), ...overlays.map((c) => ({ c, what: 'Una capa' }))].filter((x) => endOf(x.c) - mainEnd > RH.tail).sort((a, b) => endOf(b.c) - endOf(a.c))[0];
  if (tailOf) add('warn', 'tail', `${tailOf.what} sigue ${rhR(endOf(tailOf.c) - mainEnd)} s después del último video: el resultado termina en negro.`, mainEnd);

  // 3. Textos que no da tiempo a leer.
  const reads = texts.map((t) => ({ t, secs: t.end - t.start, at: t.start })).filter(({ t, secs }) => secs < RH.minTextSeconds || String(t.text).length / Math.max(secs, 0.01) > RH.maxCps);
  group(reads, 'read', 'warn', ({ t, secs }) => `El texto «${String(t.text).slice(0, 24)}${String(t.text).length > 24 ? '…' : ''}» dura ${rhR(secs)} s: se lee muy rápido. Alárgalo a ${Math.max(RH.minTextSeconds, Math.ceil(String(t.text).length / RH.maxCps * 2) / 2)} s o más.`, (n) => `Y ${n} textos más que se leen muy rápido.`);

  // 4. Gancho: los primeros 3 s.
  if (mainEnd >= 8) {
    const first = mains[0], isPhoto = kind.get(first.asset_id) === 'image';
    const cutsEarly = mains.some((c) => c.start > 0.3 && c.start < RH.hookSeconds) || overlays.some((c) => c.start < RH.hookSeconds);
    if (!cutsEarly && len(first) > RH.hookSeconds + 2) add('tip', 'hook-cut', `El primer plano dura ${rhR(len(first))} s sin cortes${isPhoto ? ' (es una foto fija)' : ''}. Un corte o un cambio dentro de los primeros ${RH.hookSeconds} s ayuda a que sigan mirando.`, 0);
    if (!texts.some((t) => t.start < RH.hookSeconds && t.end > 0.3)) add('tip', 'hook-text', `No hay texto en los primeros ${RH.hookSeconds} s. Una frase corta al inicio dice de qué trata el video.`, 0);
  }

  // 5. Planos largos sin ningún cambio visual (ni texto nuevo ni capa que empiece dentro).
  const limit = long ? RH.longShotLong : RH.longShot, longs = [];
  for (const c of mains) {
    const photo = kind.get(c.asset_id) === 'image', max = photo ? RH.longPhoto : limit;
    if (len(c) <= max) continue;
    const s = c.start, e = endOf(c), change = texts.some((t) => t.start > s + 0.5 && t.start < e - 0.5) || overlays.some((o) => o.start > s + 0.5 && o.start < e - 0.5);
    if (!change) longs.push({ c, photo, at: s });
  }
  group(longs, 'long', 'tip', ({ c, photo, at }) => `${photo ? 'La foto' : 'El plano'} de ${rhClock(at)} dura ${rhR(len(c))} s sin cambios. Prueba cortarlo, acortarlo o poner un texto en medio.`, (n) => `Y ${n} planos largos más.`);

  // 6. Cierre y bucle (solo videos cortos).
  if (mainEnd >= 8 && mainEnd <= 120) {
    const last = mains[mains.length - 1], zoneStart = mainEnd - RH.endSeconds, closing = texts.some((t) => t.end > zoneStart + 0.3);
    const loops = mains.length > 1 && last.asset_id === mains[0].asset_id;
    if (loops) add('ok', 'loop', 'El final vuelve a la misma toma del inicio: sirve de cierre en bucle.', zoneStart);
    else if (!closing && len(last) > RH.endSeconds + 2) add('tip', 'end', `El final no tiene cierre: el último plano dura ${rhR(len(last))} s sin texto. Una frase final (o repetir la imagen del inicio para que haga bucle) lo redondea.`, zoneStart);
  }

  // 7. Zona segura de los textos (solo 9:16).
  const f = project.format || {};
  if (f.aspect === '9:16' && !safeZoneOn(f)) {
    const risky = texts.filter((t) => (t.pos || 'bottom') !== 'middle');
    if (risky.length) add('tip', 'safe', `${risky.length === 1 ? 'Un texto está' : risky.length + ' textos están'} arriba o abajo, donde los botones de Reels, TikTok y Shorts pueden taparlos. Activa «Zona segura» en Formato.`, risky[0].start, { action: 'safe' });
  }

  const shots = mains.length;
  const order = { warn: 0, tip: 1, ok: 2 }; items.sort((a, b) => order[a.level] - order[b.level] || a.at - b.at);
  if (!items.some((i) => i.level !== 'ok')) add('ok', 'clean', 'No veo nada que corregir en el ritmo. Recuerda: solo cuento tiempos, no veo el contenido.', 0);
  return { ok: true, items, stats: { seconds: rhR(mainEnd), shots, avgShot: rhR(mains.reduce((s, c) => s + len(c), 0) / shots) } };
}
