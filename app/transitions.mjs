// Transición en los cortes de la línea principal: es el efecto de SALIDA del clip que termina + el de ENTRADA del que sigue (los mismos de «Efectos»). Lógica pura. — Claude
// OJO: no es una mezcla de los dos clips a la vez (disolvencia cruzada real, que necesita solapar clips): cada clip sale y el siguiente entra, uno tras otro.
import { FX, MAX_TRACKS } from '../core/operations.mjs';
import { clipLength, speedOf } from '../core/project.mjs';

export const TRANSITION_SECONDS = { min: 0.1, max: 2, def: 0.5 };

/** planCutTransitions(project, type, seconds) → { ok, ops, cuts, warnings } | { ok:false, error }. type: 'none' | 'fade' | 'slide' | 'zoom'. */
export function planCutTransitions(project, type, seconds = TRANSITION_SECONDS.def) {
  if (!FX.includes(type)) return { ok: false, error: 'Esa transición no existe.' };
  const clips = [...(project?.clips || [])].sort((a, b) => a.start - b.start);
  if (clips.length < 2) return { ok: false, error: 'Necesitas al menos dos clips en la línea principal para tener un corte.' };
  const dur = Math.max(TRANSITION_SECONDS.min, Math.min(TRANSITION_SECONDS.max, Number.isFinite(seconds) ? seconds : TRANSITION_SECONDS.def));
  const ops = clips.map((c, i) => ({ op: 'set_clip_fx', clip_id: c.id, ...(i > 0 ? { intro: type } : {}), ...(i < clips.length - 1 ? { outro: type } : {}), ...(type === 'none' ? {} : { dur }) }));
  return { ok: true, ops, cuts: clips.length - 1, warnings: type === 'none' ? [] : ['Es salir y entrar, no una mezcla de los dos clips a la vez. El efecto de entrada del primer clip y el de salida del último no se tocan.'] };
}

/**
 * W85 (Claude): REAL cross-dissolve (fundido cruzado) at every cut of the main line.
 * The first `d` seconds of clip B become a full-frame layer that fades in over the last `d`
 * seconds of clip A; B on the main line then continues from where that layer ended, so B is
 * never shown twice. Each cut therefore shortens the video by `d` (like any editor without
 * spare footage), and what comes after moves `d` earlier. Only the layer's picture fades;
 * the layer is silent, so the sound cuts at the edit as before.
 * Needs the clip to have the same shape as the output frame (e.g. vertical clip in 9:16):
 * otherwise the layer would not line up and that cut keeps a plain cut (reported).
 * dimsOf(assetId) → { w, h } | null comes from the editor (media sizes).
 * → { ok, ops, cuts, skipped, shortenedBy, warnings } | { ok:false, error }
 */
export function planCrossfades(project, seconds = TRANSITION_SECONDS.def, dimsOf = () => null) {
  const r2 = (x) => Math.round(x * 1000) / 1000;
  const clips = [...(project?.clips || [])].sort((a, b) => a.start - b.start);
  if (clips.length < 2) return { ok: false, error: 'Necesitas al menos dos clips en la línea principal para tener un corte.' };
  const want = Math.max(TRANSITION_SECONDS.min, Math.min(TRANSITION_SECONDS.max, Number.isFinite(seconds) ? seconds : TRANSITION_SECONDS.def));
  const len = clipLength, spd = speedOf, kindOf = new Map((project.assets || []).map((x) => [x.id, x.kind]));
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(String(project?.format?.aspect || ''));
  const first = dimsOf(clips[0].asset_id);
  const frameAr = m ? Number(m[1]) / Number(m[2]) : (first && first.w > 0 && first.h > 0 ? first.w / first.h : null);
  const maxTrack = Math.max(0, ...(project.overlayClips || []).map((o) => o.track || 1));
  if (maxTrack + 1 > MAX_TRACKS) return { ok: false, error: `Las ${MAX_TRACKS} filas de capas están ocupadas: borra o junta una capa para poder hacer fundidos cruzados.` };
  const track = maxTrack + 1;
  const ops = [], shifts = [];      // shifts: [oldCutTime, d] for everything that starts at/after that cut
  let oid = project.nextId ?? 1, skipped = 0, shift = 0;
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i], newStart = r2(c.start - shift);
    if (i === 0) { if (Math.abs(newStart - c.start) > 0.0005) ops.push({ op: 'move_clip', clip_id: c.id, start: newStart }); continue; }
    const a = clips[i - 1], dims = dimsOf(c.asset_id);
    const shapeOk = kindOf.get(c.asset_id) !== 'image' && frameAr && dims && dims.w > 0 && dims.h > 0 && Math.abs(dims.w / dims.h - frameAr) / frameAr < 0.02;
    const contiguous = Math.abs(a.start + len(a) - c.start) < 0.05;
    const d = r2(Math.min(want, len(a) / 2, len(c) / 2));
    if (!shapeOk || !contiguous || d < TRANSITION_SECONDS.min) {
      skipped++; if (Math.abs(newStart - c.start) > 0.0005) ops.push({ op: 'move_clip', clip_id: c.id, start: newStart }); continue;
    }
    // Layer = first d seconds of B, ending exactly at the (new) cut, fading in over A's tail.
    ops.push({ op: 'add_overlay_clip', asset_id: c.asset_id, start: r2(newStart - d), in: c.in, out: r2(c.in + d * spd(c)), track, x: 0.5, y: 0.5, scale: 1, muted: true });
    const id = `o${oid++}`;
    if (c.speed) ops.push({ op: 'set_clip_speed', clip_id: id, speed: c.speed });
    ops.push({ op: 'set_clip_fx', clip_id: id, intro: 'fade', dur: d });
    // B continues from where the layer ended; it starts at the same (new) cut, d seconds shorter.
    ops.push({ op: 'trim_clip', clip_id: c.id, in: r2(c.in + d * spd(c)), out: c.out });
    if (Math.abs(newStart - c.start) > 0.0005) ops.push({ op: 'move_clip', clip_id: c.id, start: newStart });
    shifts.push([c.start, d, c]);
    shift = r2(shift + d);
  }
  const cuts = shifts.length;
  if (!cuts) return { ok: false, error: 'Ningún corte admite fundido cruzado: los clips deben tener la misma forma que el video final (por ejemplo, verticales en 9:16).' };
  const shiftAt = (t) => shifts.reduce((s, [cut, d]) => (t >= cut - 0.05 ? s + d : s), 0);
  // Texts, layers and separate audio that start after a cut move with the picture.
  for (const o of project.overlayClips || []) { const s = shiftAt(o.start); if (s > 0.0005) ops.push({ op: 'move_clip', clip_id: o.id, start: r2(Math.max(0, o.start - s)) }); }
  for (const t of project.texts || []) { const s = shiftAt(t.start); if (s > 0.0005) ops.push({ op: 'set_text', text_id: t.id, start: r2(Math.max(0, t.start - s)), duration: r2(t.end - t.start) }); }
  for (const au of project.audioClips || []) {
    const linked = shifts.find(([cut]) => Math.abs(au.start - cut) < 0.05);   // audio recorded with that clip: lose the same first d seconds
    if (linked) {
      const [, d] = linked, sAfter = shiftAt(au.start) - d;      // its own cut does not move B's start, only earlier cuts do
      const nIn = r2(au.in + d * speedOf(au));
      if (nIn < au.out - 0.05) ops.push({ op: 'trim_clip', clip_id: au.id, in: nIn, out: au.out });
      if (sAfter > 0.0005) ops.push({ op: 'move_clip', clip_id: au.id, start: r2(Math.max(0, au.start - sAfter)) });
      continue;
    }
    const s = shiftAt(au.start); if (s > 0.0005) ops.push({ op: 'move_clip', clip_id: au.id, start: r2(Math.max(0, au.start - s)) });
  }
  const warnings = ['Fundido cruzado real: el clip siguiente aparece poco a poco sobre el anterior. Cada corte acorta el video ' + r2(shift / cuts) + ' s; el sonido sigue cortando en el corte.'];
  if (skipped) warnings.push(`${skipped} ${skipped === 1 ? 'corte quedó' : 'cortes quedaron'} sin fundido: el clip no tiene la misma forma que el video final o hay un hueco.`);
  return { ok: true, ops, cuts, skipped, shortenedBy: shift, warnings };
}
