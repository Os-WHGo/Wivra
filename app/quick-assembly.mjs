// Montaje rápido: acorta los clips de la línea principal para que el video dure lo que quieres (15, 30, 60 s…). Solo lógica pura (sin DOM). — Claude
// Es una regla simple y honesta, NO análisis de contenido: cada clip aporta un tramo del CENTRO (así se evitan los titubeos del inicio y del final),
// las fotos duran lo mismo, el orden se respeta y todo queda pegado sin huecos. Devuelve operaciones normales del editor (un solo paso en «deshacer»).
// Nombre propio a propósito: no usamos nombres de funciones de otras apps.
export const QA_TARGETS = [15, 30, 45, 60];
export const QA_MIN_TARGET = 3, QA_MAX_TARGET = 600, QA_PHOTO_SECONDS = 2, QA_MIN_CLIP = 1, QA_FLOOR = 0.5;
const qaR = (x) => Math.round(x * 100) / 100;

/** Reparte `budget` segundos entre clips de largos `lens` sin pasarse del largo de ninguno: todos reciben min(largo, L) con L común ("nivelar por arriba"). */
export function qaLevel(lens, budget) {
  const sum = lens.reduce((a, b) => a + b, 0); if (sum <= budget + 1e-9) return lens.slice();
  const idx = lens.map((l, i) => i).sort((a, b) => lens[a] - lens[b]), out = new Array(lens.length); let left = budget, n = lens.length;
  for (const i of idx) { const share = left / n; if (lens[i] <= share) { out[i] = lens[i]; left -= lens[i]; n--; } else { out[i] = share; left -= share; n--; } }      // en orden creciente: al primero que no cabe, todos los que siguen reciben la misma parte
  return out;
}

/**
 * Audios que «van con» un video de la línea principal (p. ej. el micrófono de una captura): son pistas aparte (audioClips) y, si solo se recorta o se mueve
 * el video, siguen sonando en su sitio de antes (encima de la foto o del siguiente video). Un audio está ligado a un clip de VIDEO si al menos el 80 % de
 * su duración cae dentro de ese clip; una música que cruza varios clips NO está ligada y no se toca.
 * Devuelve las operaciones (recortar, mover o borrar) que dejan cada audio ligado dentro de la ventana que se conserva del video y pegado a él.
 */
export function qaLinkedAudioOps(project, items) {
  const ops = []; let linked = 0, other = 0;
  const byId = new Map(items.map((it) => [it.id, it])), mains = (project.clips || []).filter((c) => byId.has(c.id) && !byId.get(c.id).photo);
  for (const a of project.audioClips || []) {
    const alen = a.out - a.in, as = a.start, ae = a.start + alen; let home = null, best = 0;
    for (const c of mains) { const ov = Math.min(ae, c.start + (c.out - c.in)) - Math.max(as, c.start); if (ov > best) { best = ov; home = c; } }
    if (!home || alen <= 0 || best < 0.8 * alen) { other++; continue; }
    linked++;
    const it = byId.get(home.id), wS = home.start + (it.to[0] - it.from[0]), wE = home.start + (it.to[1] - it.from[0]), shift = it.start - wS;
    const ns = Math.max(as, wS), ne = Math.min(ae, wE);
    if (ne - ns < 0.02) { ops.push({ op: 'delete_clip', clip_id: a.id }); continue; }
    const nin = qa3(a.in + (ns - as)), nout = Math.min(a.out, qa3(nin + (ne - ns))), nstart = Math.max(0, qa3(ns + shift));
    if (Math.abs(nin - a.in) > 0.0005 || Math.abs(nout - a.out) > 0.0005) ops.push({ op: 'trim_clip', clip_id: a.id, in: nin, out: nout });
    if (Math.abs(nstart - a.start) > 0.0005) ops.push({ op: 'move_clip', clip_id: a.id, start: nstart });
  }
  return { ops, linked, other };
}
const qa3 = (x) => Math.round(x * 1000) / 1000;

/**
 * planQuickAssembly(project, { targetSeconds, photoSeconds })
 * → { ok:true, ops, before, after, trimmed, items:[{id, from:[in,out], to:[in,out], start, photo}], warnings:[…] } | { ok:false, error }
 */
export function planQuickAssembly(project, { targetSeconds = 30, photoSeconds = QA_PHOTO_SECONDS } = {}) {
  const T = Number(targetSeconds);
  if (!project || !Array.isArray(project.clips) || !project.clips.length) return { ok: false, error: 'No hay clips en la línea de tiempo.' };
  if (!Number.isFinite(T) || T < QA_MIN_TARGET || T > QA_MAX_TARGET) return { ok: false, error: `La duración debe estar entre ${QA_MIN_TARGET} y ${QA_MAX_TARGET} s.` };
  const ph = Number.isFinite(Number(photoSeconds)) ? Math.max(0.5, Math.min(30, Number(photoSeconds))) : QA_PHOTO_SECONDS;
  const kind = new Map((project.assets || []).map((a) => [a.id, a.kind])), clips = [...project.clips].sort((a, b) => a.start - b.start || String(a.id).localeCompare(String(b.id)));
  const isPhoto = (c) => kind.get(c.asset_id) === 'image', warnings = [];
  const photos = clips.filter(isPhoto), videos = clips.filter((c) => !isPhoto(c));
  const before = qaR(Math.max(...project.clips.map((c) => c.start + (c.out - c.in))));
  if (before <= T + 0.05) return { ok: true, ops: [], before, after: before, trimmed: 0, items: [], warnings: [`El video ya dura ${before} s, no más de ${T} s: no se recorta nada.`] };      // solo acorta: nunca alarga ni toca lo que ya cabe
  const photoLen = (c) => Math.min(c.out - c.in, ph);          // una foto más corta que `ph` no se alarga
  const photoTotal = photos.reduce((s, c) => s + photoLen(c), 0), remaining = T - photoTotal;
  let want = new Map();
  if (videos.length) {
    if (remaining <= 0) { want = new Map(videos.map((c) => [c.id, QA_FLOOR])); warnings.push(`Con tantas fotos no queda tiempo para los videos en ${T} s: cada video dura ${QA_FLOOR} s.`); }
    else {
      const minC = Math.max(QA_FLOOR, Math.min(QA_MIN_CLIP, remaining / videos.length));
      const lens = videos.map((c) => c.out - c.in), lv = qaLevel(lens.map((l) => Math.max(l, 0)), remaining);
      videos.forEach((c, i) => want.set(c.id, Math.min(lens[i], Math.max(lv[i], Math.min(minC, lens[i])))));
      // centésimas exactas: se redondea hacia abajo y lo que sobra se reparte de a 0.01 (si no, 30 s quedaba en 30.01 s)
      const cents = videos.map((c) => Math.floor(want.get(c.id) * 100 + 1e-6)), room = videos.map((c, i) => Math.floor(lens[i] * 100 + 1e-6) - cents[i]);
      let diff = Math.round(remaining * 100) - cents.reduce((a, b) => a + b, 0);
      if (lv.some((v, i) => v < lens[i] - 1e-9) && diff > 0 && videos.length * QA_FLOOR <= remaining) {
        const order = videos.map((c, i) => i).sort((a, b) => (want.get(videos[b].id) * 100 - cents[b]) - (want.get(videos[a].id) * 100 - cents[a]));
        while (diff > 0 && order.some((i) => room[i] > 0)) for (const i of order) { if (diff > 0 && room[i] > 0) { cents[i]++; room[i]--; diff--; } }
        videos.forEach((c, i) => want.set(c.id, cents[i] / 100));
      }
    }
  }
  const items = []; const ops = []; let t = 0, trimmed = 0;
  for (const c of clips) {
    const len = c.out - c.in, photo = isPhoto(c), d = qaR(photo ? photoLen(c) : want.get(c.id));
    let nin = c.in, nout = c.out;
    if (d < len - 0.005) { nin = qaR(c.in + (len - d) / 2); nout = Math.min(c.out, qaR(nin + d)); trimmed++; }
    const start = qaR(t); t += nout - nin;
    if (nin !== c.in || nout !== c.out) ops.push({ op: 'trim_clip', clip_id: c.id, in: nin, out: nout });
    if (Math.abs(start - c.start) > 0.004) ops.push({ op: 'move_clip', clip_id: c.id, start });
    items.push({ id: c.id, from: [c.in, c.out], to: [nin, nout], start, photo });
  }
  const au = qaLinkedAudioOps(project, items); ops.push(...au.ops);      // el audio que va con cada video se recorta y se mueve junto con él
  const after = qaR(t);
  if (after > T + 0.05) warnings.push(`No cabe todo en ${T} s: el video queda en ${after} s (hay muchos clips). Prueba con más tiempo o quita clips.`);
  if (!trimmed && before <= T + 0.05) warnings.push(`El video ya dura ${before} s, menos de ${T} s: no se recorta nada.`);
  if (au.linked) warnings.push('El audio que iba con cada video se recortó y se movió junto con él.');
  if ((project.overlayClips || []).length || au.other || (project.texts || []).length) warnings.push('Las capas, los audios aparte y los textos no se mueven: revisa su tiempo.');
  return { ok: true, ops, before, after, trimmed, items, warnings };
}
