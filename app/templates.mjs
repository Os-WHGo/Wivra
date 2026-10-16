// Plantillas de Wivra: recetas de formato + duración + look + título, hechas SOLO con operaciones normales del editor (un paso en «deshacer»).
// Son recetas propias de estructura (no copian plantillas de otras apps ni usan su material). Lógica pura, sin DOM. — Claude
import { planQuickAssembly } from './quick-assembly.mjs';
import { LOOK_PRESETS } from '../core/filters.mjs';

export const TPL_CATALOG = [
  { id: 'reel', name: 'Reel vertical', desc: 'Vertical 9:16 de 30 s, con un toque de película.', format: { aspect: '9:16', fit: 'cover' }, targetSeconds: 30, look: 'film', title: true },
  { id: 'story', name: 'Historia corta', desc: 'Vertical 9:16 de 15 s, colores intensos.', format: { aspect: '9:16', fit: 'cover' }, targetSeconds: 15, look: 'vivid', title: false },
  { id: 'square', name: 'Cuadrado', desc: 'Cuadrado 1:1 de 30 s, sin cambiar los colores.', format: { aspect: '1:1', fit: 'cover' }, targetSeconds: 30, look: null, title: true },
  { id: 'wide', name: 'Horizontal', desc: 'Horizontal 16:9 de 60 s, sin recortar los bordes.', format: { aspect: '16:9', fit: 'contain' }, targetSeconds: 60, look: null, title: true },
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
  if (fmt.aspect !== t.format.aspect || fmt.fit !== t.format.fit) { ops.push({ op: 'set_format', aspect: t.format.aspect, fit: t.format.fit }); lines.push(`Formato ${t.format.aspect}`); }
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
