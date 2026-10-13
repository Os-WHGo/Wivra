// Wivra · intermediario (proxy) para que la clave de la IA NUNCA viaje dentro de la app. — Claude
// Pensado para Cloudflare Workers (módulo ES). EJEMPLO sin desplegar: no hay clave aquí; se guarda como secreto del servidor.
// Qué hace: solo acepta el formato de Wivra (herramienta edit_apply), desde orígenes permitidos, con límites de tamaño y de uso.
// Qué NO hace todavía: identificar a cada persona (ver docs/PRODUCTION_AI_KEYS_AND_LOCAL_MODELS.md) ni límites compartidos entre servidores.
const UPSTREAM = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MAX_BODY = 32 * 1024, MAX_MESSAGES = 30;

export const hits = new Map();   // límite POR instancia del Worker (en producción: Durable Object o binding de rate limit)
export function rateLimited(key, now, perMinute) {
  const arr = (hits.get(key) || []).filter((t) => now - t < 60_000); arr.push(now); hits.set(key, arr);
  return arr.length > perMinute;
}

const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const cors = (origin) => ({ 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600', Vary: 'Origin' });
const out = (status, obj, origin) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...(origin ? cors(origin) : {}) } });

// Devuelve una Response de rechazo, o null si la petición es válida. `body` ya es JSON.
export function validate(body, env) {
  if (!body || typeof body !== 'object') return 'Cuerpo inválido.';
  if (!list(env.ALLOWED_MODELS).includes(body.model)) return 'Modelo no permitido.';
  if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > MAX_MESSAGES) return 'Mensajes inválidos.';
  if (!body.messages.every((m) => m && ['system', 'user', 'assistant'].includes(m.role) && typeof m.content === 'string')) return 'Mensajes inválidos.';
  if (!Array.isArray(body.tools) || body.tools.length !== 1 || body.tools[0]?.function?.name !== 'edit_apply') return 'Solo se permite la herramienta edit_apply.';
  if (body.stream) return 'No se permite streaming.';
  return null;
}

export async function handle(req, env, fetchImpl = fetch, now = Date.now()) {
  const origin = req.headers.get('Origin') || '';
  const allowed = list(env.ALLOWED_ORIGINS).includes(origin);
  if (req.method === 'OPTIONS') return allowed ? new Response(null, { status: 204, headers: cors(origin) }) : new Response(null, { status: 403 });
  if (!allowed) return out(403, { error: 'Origen no permitido.' }, '');
  if (req.method !== 'POST' || new URL(req.url).pathname !== '/v1/chat/completions') return out(404, { error: 'No existe.' }, origin);
  const ip = req.headers.get('CF-Connecting-IP') || 'desconocida';
  if (rateLimited(ip, now, Number(env.RATE_PER_MINUTE || 10))) return out(429, { error: 'Demasiadas peticiones. Espera un minuto.' }, origin);
  const text = await req.text();
  if (text.length > MAX_BODY) return out(413, { error: 'Petición demasiado grande.' }, origin);
  let body; try { body = JSON.parse(text); } catch { return out(400, { error: 'JSON inválido.' }, origin); }
  const bad = validate(body, env); if (bad) return out(400, { error: bad }, origin);
  if (!env.GEMINI_API_KEY) return out(500, { error: 'Servidor sin configurar.' }, origin);
  const payload = { model: body.model, messages: body.messages, tools: body.tools, tool_choice: 'auto', temperature: Math.min(Number(body.temperature ?? 0.2), 1) };
  const r = await fetchImpl(UPSTREAM, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.GEMINI_API_KEY}` }, body: JSON.stringify(payload) });
  return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json', ...cors(origin) } });
}

export default { fetch: (req, env) => handle(req, env) };
