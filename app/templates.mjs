// Plantillas de Wivra: recetas de formato + duración + look + título, hechas SOLO con operaciones normales del editor (un paso en «deshacer»).
// Son recetas propias de estructura (no copian plantillas de otras apps ni usan su material). Lógica pura, sin DOM. — Claude
import { clipLength, speedOf } from '../core/project.mjs';
import { planQuickAssembly } from './quick-assembly.mjs';
import { LOOK_PRESETS } from '../core/filters.mjs';
import { MAX_TRACKS } from '../core/operations.mjs';

export const TPL_CATALOG = [
  { id: 'reel', name: 'Reel vertical', desc: 'Vertical 9:16 de 30 s, con un toque de película.', format: { aspect: '9:16', fit: 'cover' }, targetSeconds: 30, look: 'film', title: true },
  { id: 'story', name: 'Historia corta', desc: 'Vertical 9:16 de 15 s, colores intensos.', format: { aspect: '9:16', fit: 'cover' }, targetSeconds: 15, look: 'vivid', title: false },
  { id: 'square', name: 'Cuadrado', desc: 'Cuadrado 1:1 de 30 s, sin cambiar los colores.', format: { aspect: '1:1', fit: 'cover' }, targetSeconds: 30, look: null, title: true },
  { id: 'wide', name: 'Horizontal', desc: 'Horizontal 16:9 de 60 s, sin recortar los bordes.', format: { aspect: '16:9', fit: 'contain' }, targetSeconds: 60, look: null, title: true },
  { id: 'screenface', name: 'Pantalla + cara', desc: 'Vertical 9:16: el 1.er video es tu pantalla y el 2.º tu cara, en un círculo abajo a la izquierda.', format: { aspect: '9:16', fit: 'cover', safe: true }, targetSeconds: 0, look: null, title: false, special: 'screenface' },
  { id: 'collage', name: 'Collage', desc: 'Los primeros 2, 3 o 4 clips (videos o fotos) a la vez, en cuadros. Con 2 o 3: vertical 9:16, uno sobre otro; con 4: cuadrado 1:1, en cuadrícula.', format: { aspect: '9:16', fit: 'cover' }, targetSeconds: 0, look: null, title: false, special: 'collage' },
  { id: 'memory', name: 'Recuerdo', desc: 'Vertical 9:16 de 45 s, cálido y con grano suave.', format: { aspect: '9:16', fit: 'cover' }, targetSeconds: 45, look: 'vintage', title: true },
];
export const TPL_TITLE_MAX = 60, TPL_TITLE_SECONDS = 3;

/**
 * planTemplate(project, id, { title }) → { ok:true, ops, lines:[…], warnings:[…] } | { ok:false, error }
 * Orden: formato → montaje (acortar y pegar) → look en todos los clips → título (si la plantilla lo lleva y se escribió uno).
 */
export function planTemplate(project, id, { title = '' } = {}) {
  const t = TPL_CATALOG.find((x) => x.id === id); if (!t) return { ok: false, error: 'Esa plantilla no existe.' };
  if (!project || !Array.isArray(project.clips) || !project.clips.length) return { ok: false, error: 'No hay clips en la línea de tiempo.' };
  const ops = [], lines = [], warnings = [];
  const fmt = project.format || {};
  if (fmt.aspect !== t.format.aspect || fmt.fit !== t.format.fit || (t.format.safe === true && fmt.safe !== true)) {
    ops.push({ op: 'set_format', aspect: t.format.aspect, fit: t.format.fit, ...(t.format.safe ? { safe: true } : {}) }); lines.push(`Formato ${t.format.aspect}${t.format.safe ? ' con zona segura para textos' : ''}`);
  }
  if (t.special === 'collage') { const cl = planCollage(project); if (!cl.ok) return cl; ops.length = 0; lines.length = 0; ops.push(...cl.formatOps, ...cl.ops); lines.push(...cl.lines); warnings.push(...cl.warnings); return { ok: true, ops, lines, warnings, template: t, after: cl.after }; }
  if (t.special === 'screenface') { const sf = planScreenFace(project); if (!sf.ok) return sf; ops.push(...sf.ops); lines.push(...sf.lines); warnings.push(...sf.warnings); return { ok: true, ops, lines, warnings, template: t, after: sf.after }; }
  const qa = planQuickAssembly(project, { targetSeconds: t.targetSeconds });
  if (!qa.ok) return qa;
  ops.push(...qa.ops); warnings.push(...qa.warnings.filter((w) => !/ya dura/.test(w)));
  lines.push(qa.trimmed ? `Duración ${t.targetSeconds} s (se acortan ${qa.trimmed} clips)` : `Duración: ya cabe en ${t.targetSeconds} s`);
  if (t.look && LOOK_PRESETS[t.look]) {
    const need = project.clips.filter((c) => c.filter?.look !== t.look);
    if (need.length) { for (const c of project.clips) ops.push({ op: 'set_clip_filter', clip_id: c.id, look: t.look }); lines.push(`Color «${LOOK_PRESETS[t.look].name}»`); }
  }
  const ttl = String(title || '').replace(/\s+/g, ' ').trim();
  if (ttl && !t.title) warnings.push('Esta plantilla no lleva título: se ignora el texto escrito.');
  else if (ttl) {
    if (ttl.length > TPL_TITLE_MAX) return { ok: false, error: `El título puede tener hasta ${TPL_TITLE_MAX} caracteres.` };
    if ((project.texts || []).some((x) => x.text === ttl && x.start === 0)) warnings.push('Ese título ya está al inicio.');      // repetir la plantilla no duplica el título
    else { ops.push({ op: 'add_text', text: ttl, start: 0, duration: TPL_TITLE_SECONDS }); lines.push(`Título «${ttl}» los primeros ${TPL_TITLE_SECONDS} s`); }
  }
  if (!ops.length) { warnings.push('El proyecto ya está como esta plantilla: no hay nada que cambiar.'); }
  return { ok: true, ops, lines, warnings, template: t, after: qa.after };
}

/** Medidas de la plantilla «Pantalla + cara» (fracciones del cuadro 1080×1920; el círculo queda dentro de la zona segura: x ≥ 90, y ≤ 1470). */
export const SF_BUBBLE = { x: 0.3, y: 0.62, scale: 0.38, zoom: 1.3, py: 0.4, frame: 0.03, frameColor: '#ffffff', shape: 'circle' };
const sfR = (x) => Math.round(x * 1000) / 1000;

/**
 * planScreenFace(project) → { ok, ops, lines, warnings, after } | { ok:false, error }
 * El 1.er video de la línea principal queda como fondo (tu pantalla); el 2.º pasa a ser una capa circular (tu cara) que empieza a la vez.
 * Lo que venga después se corre para no dejar un hueco, y el audio que iba con la cara se va con ella.
 */
export function planScreenFace(project) {
  const kind = new Map((project.assets || []).map((a) => [a.id, a.kind])), len = clipLength;
  const vids = [...project.clips].sort((a, b) => a.start - b.start).filter((c) => kind.get(c.asset_id) !== 'image');
  if (vids.length < 2) return { ok: false, error: 'Esta plantilla necesita dos videos en la línea de tiempo: el 1.º es tu pantalla y el 2.º tu cara.' };
  if (vids[0].speed || vids[1].speed) return { ok: false, error: 'Esta plantilla no funciona con clips en cámara lenta o rápida: vuelve la velocidad a 1× en los dos primeros videos.' };
  const screen = vids[0], face = vids[1], tracks = (project.overlayClips || []).map((o) => o.track || 1), track = Math.max(0, ...tracks) + 1;
  if (track > MAX_TRACKS) return { ok: false, error: `Ya hay ${MAX_TRACKS} capas: no cabe otra para la cara.` };
  const dur = sfR(Math.min(len(face), len(screen))), ops = [], warnings = [], lines = [];
  ops.push({ op: 'delete_clip', clip_id: face.id });
  const faceEnd = face.start + len(face);
  for (const c of [...project.clips].sort((a, b) => a.start - b.start)) if (c.id !== face.id && c.start >= faceEnd - 0.01) ops.push({ op: 'move_clip', clip_id: c.id, start: Math.max(0, sfR(c.start - len(face))) });
  const oid = `o${project.nextId ?? 1}`;      // el id de la capa nueva es predecible: prefijo + nextId
  ops.push({ op: 'add_overlay_clip', asset_id: face.asset_id, start: screen.start, in: face.in, out: sfR(face.in + dur), track, x: SF_BUBBLE.x, y: SF_BUBBLE.y, scale: SF_BUBBLE.scale });
  ops.push({ op: 'set_overlay', clip_id: oid, shape: SF_BUBBLE.shape, zoom: SF_BUBBLE.zoom, py: SF_BUBBLE.py, frame: SF_BUBBLE.frame, frameColor: SF_BUBBLE.frameColor });
  // Audio que iba con un video: el de la cara se va con ella; el de los videos que se corren, también.
  let moved = 0;
  for (const a of project.audioClips || []) {
    const alen = clipLength(a); let home = null, best = 0;
    for (const c of project.clips) { const ov = Math.min(a.start + alen, c.start + len(c)) - Math.max(a.start, c.start); if (ov > best) { best = ov; home = c; } }
    if (!home || alen <= 0 || best < 0.8 * alen) continue;
    if (home.id === face.id) {
      const ns = sfR(Math.max(0, screen.start + (a.start - face.start))), keep = sfR(Math.min(alen, Math.max(0.05, dur - (a.start - face.start))));
      if (a.start - face.start >= dur) { ops.push({ op: 'delete_clip', clip_id: a.id }); moved++; continue; }
      if (keep < alen - 0.001) ops.push({ op: 'trim_clip', clip_id: a.id, in: a.in, out: sfR(a.in + keep) });
      if (Math.abs(ns - a.start) > 0.0005) ops.push({ op: 'move_clip', clip_id: a.id, start: ns });
      moved++;
    } else if (home.start >= faceEnd - 0.01) { ops.push({ op: 'move_clip', clip_id: a.id, start: Math.max(0, sfR(a.start - len(face))) }); moved++; }
  }
  lines.push('Video 1 = tu pantalla (de fondo)', `Video 2 = tu cara, en un círculo (capa ${track})`);
  if (moved) lines.push('El audio que iba con cada video se mueve con él');
  if (len(face) > len(screen) + 0.05) warnings.push(`La cara dura ${sfR(len(face) - len(screen))} s más que la pantalla: se usa solo lo que cabe.`);
  else if (len(screen) > len(face) + 0.05) warnings.push(`La cara termina ${sfR(len(screen) - len(face))} s antes que la pantalla.`);
  if (vids.length > 2) warnings.push('Los demás videos siguen en la línea principal, uno tras otro.');
  if ((project.texts || []).some((t) => t.end > faceEnd)) warnings.push('Los textos no se mueven: revisa su tiempo.');
  warnings.push('Si tu voz suena en los dos videos, silencia uno: toca el clip y elige Audio.');
  const after = Math.max(0, ...project.clips.filter((c) => c.id !== face.id).map((c) => (c.start >= faceEnd - 0.01 ? c.start - len(face) : c.start) + len(c)));
  return { ok: true, ops, lines, warnings, after: sfR(after) };
}

/** Cuadros del collage (centros y ancho como fracción del cuadro de salida). Todos son cuadrados: con 2 o 3 en 9:16 llenan el alto; con 4 en 1:1 llenan el cuadro. */
export const COLLAGE_LAYOUTS = {
  2: { aspect: '9:16', scale: 0.8889, cells: [[0.5, 0.25], [0.5, 0.75]] },
  3: { aspect: '9:16', scale: 0.5926, cells: [[0.5, 1 / 6], [0.5, 0.5], [0.5, 5 / 6]] },
  4: { aspect: '1:1', scale: 0.5, cells: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]] },
};
const clR = (x) => Math.round(x * 1000) / 1000;

/**
 * planCollage(project) → { ok, formatOps, ops, lines, warnings, after } | { ok:false, error }
 * Los primeros N (2 a 4) clips de la línea principal pasan a verse a la vez, cada uno en su cuadro (una capa cuadrada por clip). El 1.º se queda en la línea principal
 * (lleva el sonido) y además tiene su cuadro; los demás se quitan de la línea principal. Duran lo que dura el VIDEO más corto. Solo suena el 1.º: el resto queda silenciado.
 * Lo que venga después en la línea principal se corre para no dejar un hueco.
 */
export function planCollage(project) {
  const kind = new Map((project.assets || []).map((a) => [a.id, a])), clips = [...project.clips].sort((a, b) => a.start - b.start);
  const n = Math.min(4, clips.length); if (n < 2) return { ok: false, error: 'Esta plantilla necesita al menos dos clips (videos o fotos) en la línea de tiempo.' };
  const cells = clips.slice(0, n), base = Math.max(0, ...(project.overlayClips || []).map((o) => o.track || 1));
  if (base + n > MAX_TRACKS) return { ok: false, error: `Ya hay ${base} capa(s): el collage de ${n} necesita ${n} filas libres (máximo ${MAX_TRACKS}). Borra o junta capas primero.` };
  const lay = COLLAGE_LAYOUTS[n], isImg = (c) => (kind.get(c.asset_id) || {}).kind === 'image';
  const vids = cells.filter((c) => !isImg(c)), pool = vids.length ? vids : cells;
  const L = clR(Math.min(60, ...pool.map((c) => clipLength(c)))), S0 = cells[0].start, oldEnd = Math.max(...cells.map((c) => c.start + clipLength(c)));
  const ops = [], lines = [], warnings = [], fmtOps = [];
  const f = project.format || {};
  if (f.aspect !== lay.aspect || f.fit !== 'cover') fmtOps.push({ op: 'set_format', aspect: lay.aspect, fit: 'cover' });
  // 1) el 1.º se recorta a L; 2) cada clip (incluido el 1.º) genera su cuadro; 3) los clips 2..N salen de la línea principal.
  const srcLen = (c) => clR(L * speedOf(c)), maxOut = (c) => (kind.get(c.asset_id) || {}).duration ?? Infinity;
  const first = cells[0]; if (clipLength(first) > L + 0.005) ops.push({ op: 'trim_clip', clip_id: first.id, in: first.in, out: clR(Math.min(maxOut(first), first.in + srcLen(first))) });
  let oid = project.nextId ?? 1;
  cells.forEach((c, i) => {
    const out = clR(Math.min(maxOut(c), c.in + srcLen(c)));
    ops.push({ op: 'add_overlay_clip', asset_id: c.asset_id, start: S0, in: c.in, out, track: base + i + 1, x: clR(lay.cells[i][0]), y: clR(lay.cells[i][1]), scale: lay.scale, muted: true });
    const id = `o${oid++}`; ops.push({ op: 'set_overlay', clip_id: id, shape: 'square' });
    if (c.speed) ops.push({ op: 'set_clip_speed', clip_id: id, speed: c.speed });
  });
  for (const c of cells.slice(1)) ops.push({ op: 'delete_clip', clip_id: c.id });
  const delta = (S0 + L) - oldEnd;      // negativo: lo que sigue se corre hacia atrás
  const shiftable = (st) => st >= oldEnd - 0.01;
  for (const c of clips.slice(n)) ops.push({ op: 'move_clip', clip_id: c.id, start: Math.max(0, clR(c.start + delta)) });
  // Audio aparte que iba con un clip: el del 1.º se recorta a L; el de los cuadros 2..N se silencia y se pone junto a su cuadro; el de lo que sigue se corre.
  let linkedAudio = 0, otherAudio = 0;
  for (const a of project.audioClips || []) {
    const alen = clipLength(a); let home = null, best = 0;
    for (const c of clips) { const ov = Math.min(a.start + alen, c.start + clipLength(c)) - Math.max(a.start, c.start); if (ov > best) { best = ov; home = c; } }
    if (!home || alen <= 0 || best < 0.8 * alen) { otherAudio++; continue; }
    const k = cells.indexOf(home);
    if (k === -1) { if (shiftable(home.start)) { ops.push({ op: 'move_clip', clip_id: a.id, start: Math.max(0, clR(a.start + delta)) }); linkedAudio++; } continue; }
    const ns = k === 0 ? a.start : clR(S0 + (a.start - home.start)), keep = clR(Math.min(alen, Math.max(0.05, L - (ns - S0))));
    if (ns - S0 >= L - 0.05) { ops.push({ op: 'delete_clip', clip_id: a.id }); linkedAudio++; continue; }
    if (keep < alen - 0.001) ops.push({ op: 'trim_clip', clip_id: a.id, in: a.in, out: clR(a.in + keep * speedOf(a)) });
    if (Math.abs(ns - a.start) > 0.0005) ops.push({ op: 'move_clip', clip_id: a.id, start: ns });
    if (k > 0) ops.push({ op: 'set_clip_audio', clip_id: a.id, muted: true });
    linkedAudio++;
  }
  lines.push(lay.aspect === '9:16' ? `Collage de ${n} clips a la vez, uno sobre otro (9:16)` : `Collage de ${n} clips a la vez, en cuadrícula (1:1)`, `Duran ${L} s (lo que dura el video más corto)`, 'Suena el 1.er clip; los demás quedan silenciados');
  if (linkedAudio) lines.push('El audio que iba con cada clip se recortó y se movió con él');
  if (clips.length > n) warnings.push(`Solo entran los primeros ${n} clips; los demás siguen después, uno tras otro.`);
  if (L < Math.max(...cells.map((c) => clipLength(c))) - 0.05) warnings.push('Los clips más largos se recortaron al final para que todos duren lo mismo.');
  if (cells.some(isImg) && vids.length) warnings.push('Las fotos duran lo mismo que el video más corto.');
  if (otherAudio || (project.texts || []).length || (project.overlayClips || []).length) warnings.push('Los textos, capas y audios que cruzan varios clips no se mueven: revisa su tiempo.');
  warnings.push('Para oír otro cuadro: toca su capa y elige Audio.');
  return { ok: true, formatOps: fmtOps, ops, lines, warnings, after: clR(Math.max(0, ...clips.slice(n).map((c) => c.start + delta + clipLength(c)), S0 + L)) };
}
