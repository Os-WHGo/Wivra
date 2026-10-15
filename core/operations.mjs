// Operaciones validadas. La IA propone; el validador decide. Todo-o-nada por lote.
// — Claude
import { clipLength, totalDuration } from './project.mjs';

const MAX_TEXT = 120;
const err = (code, message) => ({ ok: false, code, message });
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const findAsset = (p, id) => p.assets.find((a) => a.id === id);
// Los clips de audio (pistas aparte, p. ej. el micrófono de una captura) viven en p.audioClips y comparten operaciones con los de video.
// Hay tres grupos: p.clips (video principal), p.overlayClips (videos superpuestos, con x/y/scale) y p.audioClips (pistas de audio).
const GROUPS = [['clips', 'c'], ['overlayClips', 'o'], ['audioClips', 'u']];
const findClip = (p, id) => { for (const [g] of GROUPS) { const c = (p[g] || []).find((k) => k.id === id); if (c) return c; } return undefined; };
const groupOf = (p, c) => GROUPS.find(([g]) => (p[g] || []).includes(c));
const MAX_TRACKS = 4;
const AUDIO_ROLES = ['voice_primary', 'voice_guest', 'music', 'scratch', 'ambience', 'other'];

// Formato (forma del cuadro de salida): 'original' = la del primer video. fit: 'cover' rellena y recorta lo que sobra (centrado); 'contain' deja barras negras.
export const SHAPE_IDS = ['none', 'rounded', 'circle', 'heart', 'star', 'diamond', 'triangle', 'hexagon'];
export const FX = ['none', 'fade', 'slide', 'zoom'];
export const FORMATS = ['original', '9:16', '1:1', '4:5', '16:9'];
export const FITS = ['cover', 'contain'];
const overlayProblem = ({ track, x, y, scale, shape, zoom, px, py }) => {
  if (shape !== undefined && !SHAPE_IDS.includes(shape)) return `shape debe ser uno de ${SHAPE_IDS.join(', ')}`;
  if (zoom !== undefined && !(num(zoom) && zoom >= 1 && zoom <= 4)) return 'zoom debe estar entre 1 y 4';
  for (const [k, v] of [['px', px], ['py', py]]) if (v !== undefined && !(num(v) && v >= 0 && v <= 1)) return `${k} debe estar entre 0 y 1`;
  if (!Number.isInteger(track) || track < 1 || track > MAX_TRACKS) return `track debe ser un entero de 1 a ${MAX_TRACKS}`;
  if (!num(x) || !num(y) || x < 0 || x > 1 || y < 0 || y > 1) return 'x e y deben estar entre 0 y 1';
  if (!num(scale) || scale < 0.05 || scale > 1) return 'scale debe estar entre 0.05 y 1';
  return null;
};
const handlers = {
  add_clip(p, { asset_id, start = 0 }) {
    const a = findAsset(p, asset_id);
    if (!a) return err('unknown_asset', `No existe el medio ${asset_id}`);
    if (!num(start) || start < 0) return err('bad_time', 'start debe ser >= 0');
    const id = `c${p.nextId++}`;
    p.clips.push({ id, asset_id, in: 0, out: a.duration, start });
    return { ok: true, id };
  },
  // Pista de audio aparte (no cambia la duración del video). start puede ser el tiempo del video + el desfase medido; in/out recortan el medio.
  add_audio_clip(p, { asset_id, start = 0, in: tin = 0, out, role = 'other', volume, muted, track }) {
    const a = findAsset(p, asset_id);
    if (!a) return err('unknown_asset', `No existe el medio ${asset_id}`);
    const o = out === undefined ? a.duration : out;
    if (!num(start) || start < 0) return err('bad_time', 'start debe ser >= 0');
    if (!num(tin) || !num(o) || tin < 0 || o > a.duration + 1e-6 || o <= tin) return err('out_of_range', `El medio dura ${a.duration} s; pediste ${tin}–${o}`);
    if (!AUDIO_ROLES.includes(role)) return err('bad_audio', `role debe ser uno de ${AUDIO_ROLES.join(', ')}`);
    if (volume !== undefined && (!num(volume) || volume < 0 || volume > 2)) return err('bad_audio', 'volume debe estar entre 0 y 2 (1 = original)');
    if (muted !== undefined && typeof muted !== 'boolean') return err('bad_audio', 'muted debe ser verdadero o falso');
    if (track !== undefined && (!Number.isInteger(track) || track < 1 || track > MAX_TRACKS)) return err('bad_audio', `track debe ser un entero de 1 a ${MAX_TRACKS}`);
    const id = `u${p.nextId++}`;
    const c = { id, asset_id, in: tin, out: Math.min(o, a.duration), start, role };
    if (track !== undefined) c.track = track;
    if (volume !== undefined) c.volume = volume;
    if (muted !== undefined) c.muted = muted;
    (p.audioClips ||= []).push(c);
    return { ok: true, id };
  },
  // Video superpuesto sobre el video principal. x,y = centro (0 a 1 del cuadro), scale = ancho (0.05 a 1 del cuadro), track = pista 1..4 (mayor = más arriba).
  add_overlay_clip(p, { asset_id, start = 0, in: tin = 0, out, track = 1, x = 0.72, y = 0.28, scale = 0.4, volume, muted }) {
    const a = findAsset(p, asset_id);
    if (!a) return err('unknown_asset', `No existe el medio ${asset_id}`);
    const o = out === undefined ? a.duration : out;
    if (!num(start) || start < 0) return err('bad_time', 'start debe ser >= 0');
    if (!num(tin) || !num(o) || tin < 0 || o > a.duration + 1e-6 || o <= tin) return err('out_of_range', `El medio dura ${a.duration} s; pediste ${tin}–${o}`);
    const bad = overlayProblem({ track, x, y, scale }); if (bad) return err('bad_overlay', bad);
    if (volume !== undefined && (!num(volume) || volume < 0 || volume > 2)) return err('bad_audio', 'volume debe estar entre 0 y 2 (1 = original)');
    if (muted !== undefined && typeof muted !== 'boolean') return err('bad_audio', 'muted debe ser verdadero o falso');
    const id = `o${p.nextId++}`;
    const c = { id, asset_id, in: tin, out: Math.min(o, a.duration), start, track, x, y, scale };
    if (volume !== undefined) c.volume = volume;
    if (muted !== undefined) c.muted = muted;
    (p.overlayClips ||= []).push(c);
    return { ok: true, id };
  },
  // Tamaño y posición de un video superpuesto (y, si se pide, su pista).
  set_overlay(p, { clip_id, x, y, scale, track, shape, zoom, px, py }) {
    const c = (p.overlayClips || []).find((k) => k.id === clip_id);
    if (!c) return err('unknown_clip', `No existe el video superpuesto ${clip_id}`);
    if ([x, y, scale, track, shape, zoom, px, py].every((v) => v === undefined)) return err('bad_overlay', 'Indica x, y, scale, track, shape, zoom, px y/o py');
    const n = { track: track ?? c.track, x: x ?? c.x, y: y ?? c.y, scale: scale ?? c.scale };
    const bad = overlayProblem({ ...n, shape, zoom, px, py }); if (bad) return err('bad_overlay', bad);
    Object.assign(c, n);
    if (shape !== undefined) { if (shape === 'none') delete c.shape; else c.shape = shape; }     // forma de recorte (corazón, estrella…)
    if (zoom !== undefined) { if (zoom === 1) delete c.zoom; else c.zoom = zoom; }               // zoom del video dentro de la forma
    if (px !== undefined) { if (px === 0.5) delete c.px; else c.px = px; }
    if (py !== undefined) { if (py === 0.5) delete c.py; else c.py = py; }
    return { ok: true };
  },
  set_audio_clip(p, { clip_id, track, role }) {      // pasar una pista de audio a otra fila, o cambiar su papel (voz 1, voz 2, música…)
    const c = (p.audioClips || []).find((k) => k.id === clip_id);
    if (!c) return err('unknown_clip', `No existe la pista de audio ${clip_id}`);
    if (track === undefined && role === undefined) return err('bad_audio', 'Indica track y/o role');
    if (track !== undefined && (!Number.isInteger(track) || track < 1 || track > MAX_TRACKS)) return err('bad_audio', `track debe ser un entero de 1 a ${MAX_TRACKS}`);
    if (role !== undefined && !AUDIO_ROLES.includes(role)) return err('bad_audio', `role debe ser uno de ${AUDIO_ROLES.join(', ')}`);
    if (track !== undefined) c.track = track;
    if (role !== undefined) c.role = role;
    return { ok: true };
  },
  set_clip_fx(p, { clip_id, intro, outro, dur }) {      // efecto al aparecer / desaparecer (video principal o superpuesto)
    const c = [...(p.clips || []), ...(p.overlayClips || [])].find((k) => k.id === clip_id);
    if (!c) return err('unknown_clip', `No existe el clip de video ${clip_id}`);
    if (intro === undefined && outro === undefined && dur === undefined) return err('bad_fx', 'Indica intro, outro y/o dur');
    for (const [k, v] of [['intro', intro], ['outro', outro]]) if (v !== undefined && !FX.includes(v)) return err('bad_fx', `${k} debe ser uno de ${FX.join(', ')}`);
    if (dur !== undefined && !(num(dur) && dur >= 0.1 && dur <= 3)) return err('bad_fx', 'dur debe estar entre 0.1 y 3 s');
    if (intro !== undefined) { if (intro === 'none') delete c.fxIn; else c.fxIn = intro; }
    if (outro !== undefined) { if (outro === 'none') delete c.fxOut; else c.fxOut = outro; }
    if (dur !== undefined) c.fxDur = dur;
    return { ok: true };
  },
  set_format(p, { aspect, fit }) {
    if (aspect === undefined && fit === undefined) return err('bad_format', 'Indica aspect y/o fit');
    if (aspect !== undefined && !FORMATS.includes(aspect)) return err('bad_format', `aspect debe ser uno de ${FORMATS.join(', ')}`);
    if (fit !== undefined && !FITS.includes(fit)) return err('bad_format', `fit debe ser uno de ${FITS.join(', ')}`);
    p.format = { aspect: aspect ?? p.format?.aspect ?? 'original', fit: fit ?? p.format?.fit ?? 'cover' };
    return { ok: true };
  },
  trim_clip(p, { clip_id, in: tin, out }) {
    const c = findClip(p, clip_id);
    if (!c) return err('unknown_clip', `No existe el clip ${clip_id}`);
    const a = findAsset(p, c.asset_id);
    if (!num(tin) || !num(out)) return err('bad_time', 'in y out deben ser números');
    if (tin < 0 || out > a.duration) return err('out_of_range', `El medio dura ${a.duration} s; pediste ${tin}–${out}`);
    if (out <= tin) return err('bad_time', 'out debe ser mayor que in');
    c.in = tin; c.out = out;
    return { ok: true };
  },
  split_clip(p, { clip_id, at }) {
    const c = findClip(p, clip_id);
    if (!c) return err('unknown_clip', `No existe el clip ${clip_id}`);
    if (!num(at) || at <= c.in || at >= c.out) return err('out_of_range', `at debe estar entre ${c.in} y ${c.out}`);
    const [grp, prefix] = groupOf(p, c);
    const id = `${prefix}${p.nextId++}`;
    const right = { id, asset_id: c.asset_id, in: at, out: c.out, start: c.start + (at - c.in) };
    for (const k of ['role', 'track', 'x', 'y', 'scale', 'shape', 'zoom', 'px', 'py']) if (c[k] !== undefined) right[k] = c[k];
    if (c.muted !== undefined) right.muted = c.muted;
    if (c.volume !== undefined) right.volume = c.volume;   // el corte conserva el audio del clip original
    if (c.fxOut !== undefined) { right.fxOut = c.fxOut; delete c.fxOut; }   // la salida se queda en la última parte; la entrada, en la primera
    if (c.fxDur !== undefined) right.fxDur = c.fxDur;
    c.out = at;
    p[grp].push(right);
    return { ok: true, id };
  },
  move_clip(p, { clip_id, start }) {
    const c = findClip(p, clip_id);
    if (!c) return err('unknown_clip', `No existe el clip ${clip_id}`);
    if (!num(start) || start < 0) return err('bad_time', 'start debe ser >= 0');
    c.start = start;
    return { ok: true };
  },
  // Audio del propio clip: silenciar y/o volumen (0 a 2; 1 = original). Los cambios se pueden deshacer como cualquier lote.
  set_clip_audio(p, { clip_id, muted, volume }) {
    const c = findClip(p, clip_id);
    if (!c) return err('unknown_clip', `No existe el clip ${clip_id}`);
    if (muted === undefined && volume === undefined) return err('bad_audio', 'Indica muted y/o volume');
    if (muted !== undefined && typeof muted !== 'boolean') return err('bad_audio', 'muted debe ser verdadero o falso');
    if (volume !== undefined && (!num(volume) || volume < 0 || volume > 2)) return err('bad_audio', 'volume debe estar entre 0 y 2 (1 = original)');
    if (muted !== undefined) c.muted = muted;
    if (volume !== undefined) c.volume = volume;
    return { ok: true };
  },
  delete_clip(p, { clip_id }) {
    for (const [g] of GROUPS) {
      const i = (p[g] || []).findIndex((c) => c.id === clip_id);
      if (i >= 0) { p[g].splice(i, 1); return { ok: true }; }
    }
    return err('unknown_clip', `No existe el clip ${clip_id}`);
  },
  add_text(p, { text, start, duration }) {
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) return err('bad_text', `Texto vacío o de más de ${MAX_TEXT} caracteres`);
    if (!num(start) || !num(duration) || start < 0 || duration <= 0) return err('bad_time', 'start >= 0 y duration > 0');
    const total = totalDuration(p);
    if (start >= total) return err('out_of_range', `El video dura ${total} s; el texto empieza en ${start}`);
    const id = `t${p.nextId++}`;
    p.texts.push({ id, text, start, end: Math.min(start + duration, total) });
    return { ok: true, id };
  },
};

export const OPERATION_NAMES = Object.keys(handlers);

// Aplica un lote de forma atómica. Si una operación falla, el proyecto queda intacto.
export function applyBatch(project, ops, expectedRevision) {
  if (expectedRevision !== undefined && expectedRevision !== project.revision)
    return { ok: false, code: 'stale_revision', message: `El proyecto está en la revisión ${project.revision}, no ${expectedRevision}. Vuelve a leerlo.` };
  if (!Array.isArray(ops) || ops.length === 0) return { ok: false, code: 'empty_batch', message: 'No hay operaciones' };
  const draft = structuredClone(project);
  const results = [];
  for (let i = 0; i < ops.length; i++) {
    const { op, ...args } = ops[i] ?? {};
    const h = handlers[op];
    if (!h) return { ok: false, failed_index: i, code: 'unknown_op', message: `Operación desconocida: ${op}`, applied: 0 };
    const r = h(draft, args);
    if (!r.ok) return { ...r, failed_index: i, applied: 0 };
    results.push(r);
  }
  draft.revision = project.revision + 1;
  return { ok: true, project: draft, results };
}
