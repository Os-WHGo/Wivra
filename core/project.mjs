// AgentCut core · proyecto como JSON puro (fuente única de verdad). Sin dependencias.
// — Claude
export function createProject({ assets = [] } = {}) {
  return { revision: 0, assets: structuredClone(assets), clips: [], texts: [], nextId: 1 };
}
export const totalDuration = (p) => p.clips.reduce((m, c) => Math.max(m, c.start + (c.out - c.in)), 0);
export const clipLength = (c) => c.out - c.in;
