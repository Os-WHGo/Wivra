// Una línea corta por operación, para revisar la propuesta (del modo básico o de la IA) antes de aplicarla. — Claude
// El español es el texto original y la clave de traducción. {1}, {2}… se rellenan con los valores en orden, así cada idioma puede reordenarlos.
// Una frase nueva necesita su fila en app/i18n/strings-3.tsv y strings-it.tsv: lo vigila app/tests/describe-op.test.mjs.

/** Rellena {1}, {2}… en una sola pasada (un valor que traiga «{2}» escrito no se vuelve a sustituir). Si falta un valor, deja la marca. */
export const fillTemplate = (s, args) => String(s).replace(/\{(\d+)\}/g, (m, n) => (args[n - 1] === undefined ? m : String(args[n - 1])));

/**
 * T(plantilla, ...valores): traduce la plantilla y rellena los valores (por omisión no traduce: sale en español).
 * f(n): formato de los segundos. lookName(id): nombre visible de un filtro.
 */
export function describeOperation(o, { T = (s, ...a) => fillTemplate(s, a), f = (n) => Math.round(n * 100) / 100, lookName = (id) => id } = {}) {
  const list = (xs) => { const v = xs.filter(Boolean); return v.length ? v.reduce((a, b) => T('{1}, {2}', a, b)) : ''; };
  switch (o.op) {
    case 'split_clip': return T('Cortar {1} en {2} s', o.clip_id, f(o.at));
    case 'trim_clip': return T('Recortar {1}: de {2} a {3} s', o.clip_id, f(o.in), f(o.out));
    case 'move_clip': return T('Mover {1} a {2} s', o.clip_id, f(o.start));
    case 'delete_clip': return T('Borrar {1}', o.clip_id);
    case 'set_clip_audio': return T('Audio de {1}: {2}', o.clip_id, list([o.muted === undefined ? '' : T(o.muted ? 'silenciar' : 'con sonido'), o.volume === undefined ? '' : T('volumen {1}%', Math.round(o.volume * 100))]));
    case 'add_clip': return T('Agregar {1} en {2} s', o.asset_id, f(o.start ?? 0));
    case 'add_text': return T('Texto «{1}» en {2} s por {3} s', o.text, f(o.start), f(o.duration));
    case 'add_audio_clip': return T('Pista de audio {1} en {2} s', o.asset_id, f(o.start ?? 0));
    case 'add_overlay_clip': return T('Capa {1} encima, desde {2} s', o.asset_id, f(o.start ?? 0));
    case 'set_overlay': return T('Ajustar capa {1}: {2}', o.clip_id, list(Object.keys(o).filter((k) => k !== 'op' && k !== 'clip_id')));
    case 'set_audio_clip': return T('Pista de audio {1}: {2}', o.clip_id, list([o.track !== undefined ? T('fila {1}', o.track) : '', o.role ? T('papel {1}', o.role) : '']));
    case 'set_clip_fx': return T('Efecto de {1}: {2}', o.clip_id, list([o.intro ? T('entrada {1}', o.intro) : '', o.outro ? T('salida {1}', o.outro) : '', o.dur ? T('{1} s', o.dur) : '']));
    case 'set_clip_filter': return (o.reset || o.look === 'none') ? T('Quitar filtro de {1}', o.clip_id) : T('Filtro de {1}: {2}', o.clip_id, o.look ? T(lookName(o.look)) : T('ajustes de color'));
    case 'set_format': return T('Formato: {1}', list([o.aspect ? T('cuadro {1}', o.aspect) : '', o.fit ? T(o.fit === 'cover' ? 'rellenar' : 'barras negras') : '']));
    default: return JSON.stringify(o);
  }
}
