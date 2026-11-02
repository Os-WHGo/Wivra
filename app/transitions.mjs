// Transición en los cortes de la línea principal: es el efecto de SALIDA del clip que termina + el de ENTRADA del que sigue (los mismos de «Efectos»). Lógica pura. — Claude
// OJO: no es una mezcla de los dos clips a la vez (disolvencia cruzada real, que necesita solapar clips): cada clip sale y el siguiente entra, uno tras otro.
import { FX } from '../core/operations.mjs';

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
