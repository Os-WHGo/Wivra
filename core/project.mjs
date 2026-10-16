// AgentCut core · proyecto como JSON puro (fuente única de verdad). Sin dependencias.
// — Claude
export function createProject({ assets = [] } = {}) {
  return { revision: 0, assets: structuredClone(assets), format: { aspect: 'original', fit: 'cover' }, clips: [], overlayClips: [], audioClips: [], texts: [], nextId: 1 };
}
// Velocidad de un clip (1 = normal; 0.5 = cámara lenta; 2 = el doble de rápido). `in`/`out` son SIEMPRE segundos del medio original; en la línea de tiempo el clip dura (out − in) / velocidad.
export const SPEED_MIN = 0.25, SPEED_MAX = 4;
export const speedOf = (c) => (c && typeof c.speed === 'number' && c.speed >= SPEED_MIN && c.speed <= SPEED_MAX ? c.speed : 1);
export const clipLength = (c) => (c.out - c.in) / speedOf(c);
// Segundo del medio original que se ve/oye en el instante `t` de la línea de tiempo.
export const srcTime = (c, t) => c.in + (t - c.start) * speedOf(c);
export const totalDuration = (p) => p.clips.reduce((m, c) => Math.max(m, c.start + clipLength(c)), 0);
// Fin de todo lo que suena o se ve (video principal, superpuestos y audios): sirve para reproducir y exportar aunque falte video principal.
export const timelineEnd = (p) => [p.clips, p.overlayClips || [], p.audioClips || []].reduce((m, g) => g.reduce((n, c) => Math.max(n, c.start + clipLength(c)), m), 0);
