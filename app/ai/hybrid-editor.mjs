// Adaptador conservador: composición híbrida -> operaciones reales del editor Wivra.
// No inventa render de animaciones: las reporta como pendientes de motor visual.
import { validateHybridComposition } from './hybrid-composition.mjs';
import { applyBatch } from '../../core/operations.mjs';

const fail = (code, message) => ({ ok: false, code, message });
export function hybridToEditorOps(plan, project, { overlayTrack = 1 } = {}) {
  const checked = validateHybridComposition(plan);
  if (!checked.ok) return checked;
  if (!project || !Array.isArray(project.assets) || !Array.isArray(project.clips)) return fail('INVALID_PROJECT', 'Proyecto inválido.');
  if (!Number.isInteger(overlayTrack) || overlayTrack < 1 || overlayTrack > 4) return fail('INVALID_TRACK', 'Pista de superposición inválida.');
  const assets = new Map(project.assets.map(a => [a.id, a]));
  const ops = [], deferred = [];
  for (const layer of checked.value.layers) {
    const duration = layer.end - layer.start;
    if (layer.kind === 'animation') {
      deferred.push({ id: layer.id, preset: layer.preset, start: layer.start, end: layer.end, reason: 'RENDERER_REQUIRED' });
      continue;
    }
    if (layer.kind === 'text') {
      ops.push({ op: 'add_text', text: layer.text, start: layer.start, duration });
      continue;
    }
    const asset = assets.get(layer.assetId);
    if (!asset) return fail('UNKNOWN_ASSET', 'Archivo no importado: ' + layer.assetId);
    if (!Number.isFinite(asset.duration) || asset.duration < duration) return fail('INSUFFICIENT_ASSET', 'El archivo no cubre la duración de la capa: ' + layer.id);
    if (layer.kind === 'image' && asset.kind !== 'image') return fail('ASSET_KIND', 'La capa de imagen necesita una imagen.');
    if (layer.kind === 'video' && asset.kind === 'image') return fail('ASSET_KIND', 'La capa de video necesita un video.');
    // Los videos principales solo pueden ser añadidos sobre una línea de tiempo vacía.
    if (layer.kind === 'video' && layer.start === 0 && project.clips.length === 0 && !ops.some(o => o.op === 'add_clip')) {
      if (duration !== asset.duration) return fail('TRIM_REQUIRED', 'El video principal necesita un recorte antes de incorporarlo.');
      ops.push({ op: 'add_clip', asset_id: layer.assetId, start: 0 });
    } else {
      if (layer.opacity < 0.1) return fail('OPACITY_UNSUPPORTED', 'El editor no admite capas con opacidad inferior a 0.1.');
      ops.push({ op: 'add_overlay_clip', asset_id: layer.assetId, start: layer.start, in: 0, out: duration, track: overlayTrack, x: 0.5, y: 0.5, scale: 1 });
    }
  }
  // No devolver un lote inválido ni aplicar parcialmente un plan.
  const dryRun = applyBatch(project, ops);
  if (!dryRun.ok) return fail('EDITOR_REJECTED', dryRun.message || 'El editor rechazó el plan.');
  return { ok: true, ops, deferred, previewProject: dryRun.project };
}
