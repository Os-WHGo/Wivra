// Modo "copiar y pegar": funciona con ChatGPT/Claude gratis, sin API. — Claude
export function buildPrompt(request, project) {
  return `Eres el asistente de edición de la app AgentCut. Responde SOLO con un bloque JSON (una lista de operaciones), sin explicaciones.

Operaciones permitidas (tiempos en segundos):
- {"op":"trim_clip","clip_id":"c1","in":2,"out":8}  (in/out dentro de la duración del medio)
- {"op":"split_clip","clip_id":"c1","at":5}
- {"op":"move_clip","clip_id":"c1","start":0}
- {"op":"delete_clip","clip_id":"c1"}
- {"op":"add_clip","asset_id":"a1","start":0}
- {"op":"add_text","text":"Hola","start":0,"duration":3}  (texto máx. 120 caracteres)

Si algo es imposible, responde [] y nada más.

Proyecto actual:
${JSON.stringify({ revision: project.revision, assets: project.assets, clips: project.clips, texts: project.texts })}

Petición del usuario: ${request}`;
}
export function parseReply(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = (m ? m[1] : text).trim();
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
  let v = tryParse(raw);
  if (v === undefined) { const a = raw.indexOf('['), b = raw.lastIndexOf(']'); if (a >= 0 && b > a) v = tryParse(raw.slice(a, b + 1)); }
  if (v && !Array.isArray(v) && Array.isArray(v.ops)) v = v.ops;
  return Array.isArray(v) && v.length ? v : null;
}
