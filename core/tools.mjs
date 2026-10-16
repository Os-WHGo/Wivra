// Herramientas que ve la IA (independientes del proveedor) + adaptadores a formato OpenAI y Anthropic.
// — Claude
import { opsOneOf } from './op-schemas.mjs';
const ops = { type: 'array', minItems: 1, items: { oneOf: opsOneOf() } };   // las operaciones salen de core/op-schemas.mjs (tabla única)
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
