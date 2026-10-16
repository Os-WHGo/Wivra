// Modo "copiar y pegar": funciona con ChatGPT/Claude gratis, sin API. — Claude
export function buildPrompt(request, project, observation = null) {
  return `Eres el asistente de edición de la app Wivra. Responde SOLO con un bloque JSON (una lista de operaciones), sin explicaciones.

Operaciones permitidas (tiempos en segundos):
- {"op":"trim_clip","clip_id":"c1","in":2,"out":8}  (in/out dentro de la duración del medio)
- {"op":"split_clip","clip_id":"c1","at":5}
- {"op":"move_clip","clip_id":"c1","start":0}
- {"op":"delete_clip","clip_id":"c1"}
- {"op":"set_clip_audio","clip_id":"c1","muted":true}  (o "volume": 0.5; 0 a 2, 1 = original)
- {"op":"add_clip","asset_id":"a1","start":0}
- {"op":"add_photo_clip","asset_id":"a2","start":0,"duration":3}  (foto o GIF en la línea principal; add_clip es solo para videos)
- {"op":"add_text","text":"Hola","start":0,"duration":3}  (texto máx. 120 caracteres)

Si algo es imposible, responde [] y nada más.

Proyecto actual:
${JSON.stringify({ revision: project.revision, assets: project.assets, clips: project.clips, texts: project.texts })}
Información visual local opcional (resumen numérico; NO fotografías ni reconocimiento semántico):
${observation ? JSON.stringify(observation) : 'Sin análisis visual.'}
Importante: NO afirmes que viste fotogramas, que reconociste calles, conversaciones, rostros ni acontecimientos por estas puntuaciones. Indica incertidumbre cuando la evidencia sea insuficiente.
${observation ? 'La persona decidió copiar estas métricas al chat, pero la app NO envió el video.' : ''}

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
