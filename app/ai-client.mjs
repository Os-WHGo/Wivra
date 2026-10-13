// Wivra · conexión directa con una IA (sin copiar y pegar). Un solo contrato "OpenAI compatible"
// que sirve para varios proveedores: tú pones dirección, modelo y tu propia clave.
// - La clave vive solo en la memoria de la página (no se guarda, no va al repositorio ni al proyecto).
// - Se envía únicamente: tu petición + un resumen del proyecto (nombres, duraciones, clips, textos). NUNCA el video.
// - La respuesta es una PROPUESTA: se valida contra el editor y solo se aplica si tú lo apruebas. — Claude

// Direcciones tomadas de la documentación de cada proveedor. Límites gratuitos y CORS: por verificar en uso real.
export const PRESETS = Object.freeze([
  { id: 'gemini', name: 'Google Gemini (AI Studio)', base: 'https://generativelanguage.googleapis.com/v1beta/openai/', model: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey' },
  { id: 'groq', name: 'Groq', base: 'https://api.groq.com/openai/v1/', model: 'openai/gpt-oss-120b', keyUrl: 'https://console.groq.com/keys' },
  { id: 'openrouter', name: 'OpenRouter', base: 'https://openrouter.ai/api/v1/', model: 'openai/gpt-oss-120b:free', keyUrl: 'https://openrouter.ai/keys' },
  { id: 'openai', name: 'OpenAI (de pago)', base: 'https://api.openai.com/v1/', model: 'gpt-4.1-mini', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'custom', name: 'Otro (compatible con OpenAI)', base: '', model: '', keyUrl: '' },
]);

const OPS = ['trim_clip', 'split_clip', 'move_clip', 'delete_clip', 'add_clip', 'add_text'];

// Esquema "plano" (sin oneOf/const) para que lo acepten más proveedores. El validador del editor es el que manda.
export const EDIT_TOOL = Object.freeze({
  type: 'function',
  function: {
    name: 'edit_apply',
    description: 'Propone un lote de operaciones sobre la línea de tiempo. Si la petición es imposible o no hay evidencia, llámala con ops vacío y explica en "nota".',
    parameters: {
      type: 'object', required: ['ops'],
      properties: {
        nota: { type: 'string', description: 'Explicación corta, en español, de lo que propones (máx. 200 caracteres).' },
        ops: {
          type: 'array', maxItems: 50,
          items: {
            type: 'object', required: ['op'],
            properties: {
              op: { type: 'string', enum: OPS },
              clip_id: { type: 'string' }, asset_id: { type: 'string' },
              in: { type: 'number' }, out: { type: 'number' }, at: { type: 'number' }, start: { type: 'number' },
              duration: { type: 'number' }, text: { type: 'string', description: 'máx. 120 caracteres' },
            },
          },
        },
      },
    },
  },
});

export const SYSTEM = `Eres el asistente de edición de Wivra, un editor de video para el teléfono.
Controlas el editor SOLO llamando a la herramienta edit_apply con operaciones (tiempos en segundos):
- trim_clip {clip_id,in,out} (in/out dentro de la duración del medio) · split_clip {clip_id,at} · move_clip {clip_id,start}
- delete_clip {clip_id} · add_clip {asset_id,start} · add_text {text,start,duration}
Usa SOLO ids que existan en el proyecto. No inventes momentos, lugares ni contenido: tú no ves el video, solo sus nombres y duraciones.
Si la petición es imposible o falta información, llama a edit_apply con ops vacío y explícalo en "nota".
Un lote es atómico: si una operación falla, no se aplica ninguna. Responde en español.`;

export function buildMessages(request, project) {
  const summary = { revision: project.revision, assets: project.assets.map((a) => ({ id: a.id, name: a.name, duration: a.duration })), clips: project.clips, texts: project.texts };
  return [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Proyecto actual:\n${JSON.stringify(summary)}\n\nPetición: ${String(request).slice(0, 2000)}` }];
}

export function buildRequest({ base, key, model, request, project, fetchOptions = {} }) {
  const url = String(base).replace(/\/+$/, '') + '/chat/completions';
  return { url, init: { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: buildMessages(request, project), tools: [EDIT_TOOL], tool_choice: 'auto', temperature: 0.2 }), ...fetchOptions } };
}

// Saca { ops, nota } de la respuesta: llamada a la herramienta, o (si el modelo contestó en texto) un JSON dentro del texto.
export function parseModelResponse(json, parseText) {
  const msg = json?.choices?.[0]?.message;
  if (!msg) throw new Error('La IA respondió algo inesperado (sin mensaje).');
  const call = (msg.tool_calls || []).find((c) => c?.function?.name === 'edit_apply');
  if (call) {
    let args; try { args = typeof call.function.arguments === 'string' ? JSON.parse(call.function.arguments) : call.function.arguments; }
    catch { throw new Error('La IA devolvió operaciones que no se pudieron leer.'); }
    return { ops: Array.isArray(args?.ops) ? args.ops : [], nota: String(args?.nota || '').slice(0, 300) };
  }
  const text = typeof msg.content === 'string' ? msg.content : '';
  const ops = parseText ? parseText(text) : null;
  return { ops: ops || [], nota: ops ? 'La IA respondió en texto (se leyó el JSON).' : text.slice(0, 300) };
}

export function friendlyError(e, status, bodyText = '') {
  if (status === 401 || status === 403) return 'La clave no sirvió (401/403). Revisa que esté completa y que sea del proveedor elegido.';
  if (status === 404) return 'No encontré ese modelo o esa dirección (404). Revisa el nombre del modelo.';
  if (status === 429) return 'Llegaste al límite gratis del proveedor (429). Espera un minuto o prueba otro proveedor.';
  if (status >= 500) return `El proveedor falló (${status}). Intenta de nuevo en un momento.`;
  if (status) return `El proveedor rechazó la petición (${status}). ${String(bodyText).slice(0, 200)}`;
  if (e && e.name === 'AbortError') return 'La petición tardó demasiado y se canceló.';
  return 'No pude conectar. Revisa tu internet. Si sigue igual, este proveedor puede no permitir llamadas desde una página web (CORS); prueba otro proveedor.';
}

// Pide una propuesta a la IA. `fetchImpl` se puede cambiar en pruebas.
export async function askModel({ base, key, model, request, project, parseText, fetchImpl = (typeof fetch === 'function' ? fetch : null), timeoutMs = 45000 }) {
  if (!base || !model) throw new Error('Falta elegir proveedor y modelo.');
  if (!key || key.length < 8) throw new Error('Falta pegar tu clave.');
  if (!String(request || '').trim()) throw new Error('Escribe qué quieres que haga la IA.');
  if (!fetchImpl) throw new Error('Este navegador no puede hacer la llamada.');
  const { url, init } = buildRequest({ base, key, model, request, project });
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null; const timer = ctl && setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try { res = await fetchImpl(url, { ...init, signal: ctl?.signal }); }
  catch (e) { throw new Error(friendlyError(e, 0)); }
  finally { if (timer) clearTimeout(timer); }
  if (!res.ok) { let t = ''; try { t = await res.text(); } catch { /* nada */ } throw new Error(friendlyError(null, res.status, t)); }
  let json; try { json = await res.json(); } catch { throw new Error('La IA respondió algo que no es JSON.'); }
  return parseModelResponse(json, parseText);
}
