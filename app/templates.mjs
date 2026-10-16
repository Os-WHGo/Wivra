// Plantillas de Wivra: recetas de formato + duración + look + título, hechas SOLO con operaciones normales del editor (un paso en «deshacer»).
// Son recetas propias de estructura (no copian plantillas de otras apps ni usan su material). Lógica pura, sin DOM. — Claude
import { planQuickAssembly } from './quick-assembly.mjs';
import { LOOK_PRESETS } from '../core/filters.mjs';
import { MAX_TRACKS } from '../core/operations.mjs';

export const TPL_CATALOG = [
  { id: 'reel', name: 'Reel vertical', desc: 'Vertical 9:16 de 30 s, con un toque de película.', format: { aspect: '9:16', fit: 'cover' }, targetSeconds: 30, look: 'film', title: true },
  { id: 'story', name: 'Historia corta', desc: 'Vertical 9:16 de 15 s, colores intensos.', format: { aspect: '9:16', fit: 'cover' }, targetSeconds: 15, look: 'vivid', title: false },
  { id: 'square', name: 'Cuadrado', desc: 'Cuadrado 1:1 de 30 s, sin cambiar los colores.', format: { aspect: '1:1', fit: 'cover' }, targetSeconds: 30, look: null, title: true },
  { id: 'wide', name: 'Horizontal', desc: 'Horizontal 16:9 de 60 s, sin recortar los bordes.', format: { aspect: '16:9', fit: 'contain' }, targetSeconds: 60, look: null, title: true },
  { id: 'screenface', name: 'Pantalla + cara', desc: 'Vertical 9:16: el 1.er video es tu pantalla y el 2.º tu cara, en un círculo abajo a la izquierda.', format: { aspect: '9:16', fit: 'cover', safe: true }, targetSeconds: 0, look: null, title: false, special: 'screenface' },
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
  const kind = new Map((project.assets || []).map((a) => [a.id, a.kind])), len = (c) => c.out - c.in;
  const vids = [...project.clips].sort((a, b) => a.start - b.start).filter((c) => kind.get(c.asset_id) !== 'image');
  if (vids.length < 2) return { ok: false, error: 'Esta plantilla necesita dos videos en la línea de tiempo: el 1.º es tu pantalla y el 2.º tu cara.' };
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
    const alen = a.out - a.in; let home = null, best = 0;
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
