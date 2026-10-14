// Operaciones validadas. La IA propone; el validador decide. Todo-o-nada por lote.
// — Claude
import { clipLength, totalDuration } from './project.mjs';

const MAX_TEXT = 120;
const err = (code, message) => ({ ok: false, code, message });
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const findAsset = (p, id) => p.assets.find((a) => a.id === id);
const findClip = (p, id) => p.clips.find((c) => c.id === id);

const handlers = {
  add_clip(p, { asset_id, start = 0 }) {
    const a = findAsset(p, asset_id);
    if (!a) return err('unknown_asset', `No existe el medio ${asset_id}`);
    if (!num(start) || start < 0) return err('bad_time', 'start debe ser >= 0');
    const id = `c${p.nextId++}`;
    p.clips.push({ id, asset_id, in: 0, out: a.duration, start });
    return { ok: true, id };
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
    const id = `c${p.nextId++}`;
    const right = { id, asset_id: c.asset_id, in: at, out: c.out, start: c.start + (at - c.in) };
    if (c.muted !== undefined) right.muted = c.muted;
    if (c.volume !== undefined) right.volume = c.volume;   // el corte conserva el audio del clip original
    c.out = at;
    p.clips.push(right);
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
    const i = p.clips.findIndex((c) => c.id === clip_id);
    if (i < 0) return err('unknown_clip', `No existe el clip ${clip_id}`);
    p.clips.splice(i, 1);
    return { ok: true };
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
