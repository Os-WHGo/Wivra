// AgentCut core · proyecto como JSON puro (fuente única de verdad). Sin dependencias.
// — Claude
export function createProject({ assets = [] } = {}) {
  return { revision: 0, assets: structuredClone(assets), format: { aspect: 'original', fit: 'cover' }, clips: [], overlayClips: [], audioClips: [], texts: [], nextId: 1 };
}
export const totalDuration = (p) => p.clips.reduce((m, c) => Math.max(m, c.start + (c.out - c.in)), 0);
// Fin de todo lo que suena o se ve (video principal, superpuestos y audios): sirve para reproducir y exportar aunque falte video principal.
export const timelineEnd = (p) => [p.clips, p.overlayClips || [], p.audioClips || []].reduce((m, g) => g.reduce((n, c) => Math.max(n, c.start + (c.out - c.in)), m), 0);
export const clipLength = (c) => c.out - c.in;
