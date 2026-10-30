// Contrato puro de composición híbrida para videos reales, imágenes y animaciones.
// Solo genera una propuesta validada: nunca ejecuta FFmpeg ni altera el proyecto.
const finite = n => typeof n === 'number' && Number.isFinite(n);
const fail = (code, message) => ({ ok: false, code, message });
export const HYBRID_COMPOSITION_VERSION = 1;
export function validateHybridComposition(plan, { maxLayers = 200, maxDuration = 86400 } = {}) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || plan.version !== 1) return fail('INVALID_PLAN', 'Plan de composición no compatible.');
  if (!finite(plan.duration) || plan.duration <= 0 || plan.duration > maxDuration) return fail('INVALID_DURATION', 'Duración inválida.');
  if (!Array.isArray(plan.layers) || plan.layers.length > maxLayers) return fail('INVALID_LAYERS', 'Capas inválidas.');
  const ids = new Set();
  const layers = [];
  for (const [i, layer] of plan.layers.entries()) {
    if (!layer || typeof layer !== 'object' || typeof layer.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(layer.id) || ids.has(layer.id)) return fail('INVALID_ID', 'Identificador de capa inválido o duplicado: ' + i);
    ids.add(layer.id);
    if (!['video', 'image', 'animation', 'text'].includes(layer.kind)) return fail('INVALID_KIND', 'Tipo de capa no compatible: ' + i);
    if (!finite(layer.start) || !finite(layer.end) || layer.start < 0 || layer.end <= layer.start || layer.end > plan.duration) return fail('INVALID_TIME', 'Tiempo de capa inválido: ' + i);
    if (layer.kind === 'video' || layer.kind === 'image') {
      if (typeof layer.assetId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(layer.assetId)) return fail('INVALID_ASSET', 'Referencia de archivo inválida: ' + i);
    } else if (layer.kind === 'text') {
      if (typeof layer.text !== 'string' || !layer.text.trim() || layer.text.length > 120) return fail('INVALID_TEXT', 'Texto inválido: ' + i);
    } else if (!['fade', 'zoom', 'pan', 'slide'].includes(layer.preset)) {
      return fail('INVALID_PRESET', 'Animación no compatible: ' + i);
    }
    if (layer.opacity !== undefined && (!finite(layer.opacity) || layer.opacity < 0 || layer.opacity > 1)) return fail('INVALID_OPACITY', 'Opacidad inválida: ' + i);
    layers.push({ id: layer.id, kind: layer.kind, start: layer.start, end: layer.end,
      ...(layer.assetId === undefined ? {} : { assetId: layer.assetId }),
      ...(layer.text === undefined ? {} : { text: layer.text }),
      ...(layer.preset === undefined ? {} : { preset: layer.preset }),
      opacity: layer.opacity === undefined ? 1 : layer.opacity });
  }
  return { ok: true, value: { version: 1, duration: plan.duration, layers } };
}
