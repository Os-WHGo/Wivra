// Herramientas que ve la IA (independientes del proveedor) + adaptadores a formato OpenAI y Anthropic.
// — Claude
const time = { type: 'number', minimum: 0, description: 'segundos' };
const ops = {
  type: 'array', minItems: 1,
  items: { oneOf: [
    { type: 'object', required: ['op', 'asset_id'], properties: { op: { const: 'add_clip' }, asset_id: { type: 'string' }, start: time } },
    { type: 'object', required: ['op', 'clip_id', 'in', 'out'], properties: { op: { const: 'trim_clip' }, clip_id: { type: 'string' }, in: time, out: time } },
    { type: 'object', required: ['op', 'clip_id', 'at'], properties: { op: { const: 'split_clip' }, clip_id: { type: 'string' }, at: time } },
    { type: 'object', required: ['op', 'clip_id', 'start'], properties: { op: { const: 'move_clip' }, clip_id: { type: 'string' }, start: time } },
    { type: 'object', required: ['op', 'clip_id'], properties: { op: { const: 'delete_clip' }, clip_id: { type: 'string' } } },
    { type: 'object', required: ['op', 'text', 'start', 'duration'], properties: { op: { const: 'add_text' }, text: { type: 'string', maxLength: 120 }, start: time, duration: { type: 'number', exclusiveMinimum: 0 } } },
  ] },
};
export const TOOLS = [
  { name: 'project_get', description: 'Lee el proyecto actual (medios, clips, textos, revisión). Úsalo antes de editar.', parameters: { type: 'object', properties: {} } },
  { name: 'edit_apply', description: 'Aplica un lote de operaciones de forma atómica: si una falla, no se aplica ninguna. Pasa expected_revision de project_get.', parameters: { type: 'object', required: ['ops'], properties: { ops, expected_revision: { type: 'integer' } } } },
  { name: 'edit_undo', description: 'Deshace el último cambio del chat.', parameters: { type: 'object', properties: {} } },
];
export const toOpenAI = (t = TOOLS) => t.map((x) => ({ type: 'function', function: { name: x.name, description: x.description, parameters: x.parameters } }));
export const toAnthropic = (t = TOOLS) => t.map((x) => ({ name: x.name, description: x.description, input_schema: x.parameters }));

// Ejecuta una llamada de la IA contra una sesión. Los errores vuelven como datos para que la IA corrija.
export function runTool(session, name, args = {}) {
  switch (name) {
    case 'project_get': return { ok: true, project: session.project };
    case 'edit_apply': return session.apply(args.ops, args.expected_revision);
    case 'edit_undo': return session.undo();
    default: return { ok: false, code: 'unknown_tool', message: `Herramienta desconocida: ${name}` };
  }
}
