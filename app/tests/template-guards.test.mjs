// Guardas de la plantilla del editor (solo lectura de archivos, sin navegador). — Claude
// Una fusión mal resuelta ya borró una vez el sistema de idiomas y el panel Ajustes sin que ninguna prueba lo notara.
// Si estas pruebas fallan: NO se arreglan quitando la prueba; se recupera lo que la fusión borró o se agrega la traducción que falta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadI18n } from '../i18n-parse.mjs';
import { I18N_LANGS, i18nCompile } from '../i18n.mjs';

const template = readFileSync(new URL('../template.html', import.meta.url), 'utf8');
const dist = readFileSync(new URL('../dist/agentcut.html', import.meta.url), 'utf8');
const D = loadI18n();
const LANGS = I18N_LANGS.map((x) => x[0]).filter((l) => l !== 'es');

// 1) Lo que no puede desaparecer de la plantilla ni del archivo final.
const PIEZAS = [
  ['el traductor en vivo', 'function i18nApply('],
  ['la traducción de lo que aparece después', 'r.addedNodes.forEach(i18nWalk)'],
  ['guardar el idioma elegido', "localStorage.setItem('wivra.lang'"],
  ['la hoja de Ajustes', 'id="sSettings"'],
  ['la lista de idiomas dentro de Ajustes', 'id="setLangs"'],
  ['la pantalla de elegir idioma la primera vez', 'id="sLang"'],
  ['el botón ⚙ que abre Ajustes', 'id="hSet"'],
];
for (const [name, s] of [['plantilla', template], ['archivo final', dist]]) {
  test(`${name}: conserva los idiomas y el panel Ajustes`, () => {
    for (const [que, marca] of PIEZAS) assert.ok(s.includes(marca), `Falta ${que} (${marca}). ¿Una fusión lo borró? Recupéralo de la rama del editor (#44).`);
  });
}

// 2) El archivo final lleva exactamente las frases de las tablas (si no, falta correr: node app/build.mjs).
test('archivo final: trae los idiomas y las mismas frases que app/i18n/*.tsv', () => {
  const ini = dist.indexOf('const I18N_DATA = '); assert.ok(ini >= 0, 'Falta I18N_DATA en el archivo final.');
  const linea = dist.slice(ini + 'const I18N_DATA = '.length, dist.indexOf('\n', ini)).trim().replace(/;$/, '');
  const data = JSON.parse(linea);
  assert.deepEqual(Object.keys(data).sort(), [...LANGS].sort(), 'Idiomas distintos a la lista oficial');
  for (const l of LANGS) assert.ok(JSON.stringify(data[l]) === JSON.stringify(D[l]), `${l}: el archivo final no coincide con las tablas. Corre: node app/build.mjs`);
});

// Ayudas para mirar los textos visibles de una zona del HTML.
const NO_TRADUCIR = new Set(['https://…/v1/']); // direcciones y marcas que se dejan tal cual
function zona(html, id) {
  const marca = html.indexOf(`id="${id}"`); assert.ok(marca > 0, `No existe #${id} en la plantilla.`);
  const abre = html.lastIndexOf('<div', marca), re = /<div\b|<\/div>/g; re.lastIndex = abre; let prof = 0, m;
  while ((m = re.exec(html))) { prof += m[0] === '</div>' ? -1 : 1; if (prof === 0) return html.slice(abre, re.lastIndex); }
  throw new Error(`#${id}: falta cerrar un div`);
}
const decodifica = (s) => s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[e]);
function textosVisibles(fragmento) {
  const f = fragmento.replace(/<(script|style)[\s\S]*?<\/\1>/g, '').replace(/<(\w+)\b[^>]*\bdata-notr\b[^>]*>[\s\S]*?<\/\1>/g, ''); // lo marcado data-notr no se traduce
  const salida = new Set();
  for (const a of f.matchAll(/\s(?:placeholder|title|aria-label)=(?:"([^"]*)"|'([^']*)')/g)) salida.add(decodifica((a[1] ?? a[2]).trim()));
  for (const trozo of f.split(/<[^>]*>/)) { const t = decodifica(trozo).replace(/\s+/g, ' ').trim(); if (t) salida.add(t); }
  return [...salida].filter((t) => /[A-Za-zÁÉÍÓÚÜáéíóúüñÑ]{2}/.test(t) && !NO_TRADUCIR.has(t));
}
// ¿Tiene fila (frase exacta, plantilla {} o prefijo:)? Marca cada traducción para distinguir "traducida igual" de "sin traducir".
const cubre = Object.fromEntries(LANGS.map((l) => {
  const marcada = i18nCompile(Object.fromEntries(Object.entries(D[l]).map(([k, v]) => [k, '\u0001' + v])));
  return [l, (s) => marcada(s).includes('\u0001')];
}));

// 3) Zonas que ya están 100 % traducidas: chat de IA, Ajustes y elegir idioma.
for (const id of ['sAI', 'sSettings', 'sLang']) {
  test(`#${id}: todo texto visible tiene traducción en los 7 idiomas`, () => {
    const faltan = [];
    for (const t of textosVisibles(zona(template, id))) for (const l of LANGS) if (!cubre[l](t)) faltan.push(`${l}: «${t}»`);
    assert.deepEqual(faltan, [], 'Falta traducir (agrega la fila en app/i18n/strings-3.tsv y strings-it.tsv):\n' + faltan.join('\n'));
  });
}

// 4) Mensajes que el chat escribe con código (no están en el HTML), uno por uno y los que aparecen en aiSay('…').
const MENSAJES_DEL_CHAT = [
  'Pensando…', 'El proveedor está saturado. Reintentando (1/2)…', 'No propongo cambios.', 'No propongo cambios: no hay nada que hacer',
  'La IA no propone cambios.', 'Mi propuesta fue rechazada por el editor (operación 2): falta el clip', 'Nada cambió. Corrígela con otra frase.',
  'Revisa la propuesta. Nada cambia hasta que toques Aplicar. Para corregirla, escribe o dicta otra frase.', 'Propuesta descartada. No cambió nada.',
  'Conversación nueva.', 'Escuchando… habla y toca Detener cuando termines.', 'No pude iniciar el dictado: boom', 'Micrófono: network',
  'El navegador no dejó usar el micrófono. Actívalo en Ajustes del teléfono, o usa el micrófono del teclado.',
  'El proyecto cambió mientras tanto. Vuelve a pedir el cambio.', 'No se pudo aplicar: boom', 'Aplicado. Puedes deshacerlo con la flecha.',
  'Para dictar, usa el micrófono del teclado del teléfono en el cuadro de arriba.', 'Idea preparada como contexto, no enviada. Revisa tu petición y envíala cuando quieras.',
  'Idea separada de la conversación con IA.', 'Pedir propuesta a IA', 'Revisar cambio gratis', '⏹ Detener', '🎤 Dictar',
  'Ej.: Recorta clip 1 de 2 a 7 y agrega texto "Vancouver"', 'Ej.: Recorta clip 1 desde 2 a 7 y pon texto "Vancouver"',
  'El modo local básico solo entiende texto entre comillas o recortes explícitos. Para comprender ideas generales necesitas conectar un modelo de IA.',
  'Primero importa un video para poner texto', 'No existe ese número de clip',
];
test('chat: sus mensajes de código están traducidos en los 7 idiomas', () => {
  const faltan = []; for (const t of MENSAJES_DEL_CHAT) for (const l of LANGS) if (!cubre[l](t)) faltan.push(`${l}: «${t}»`);
  assert.deepEqual(faltan, [], 'Falta traducir:\n' + faltan.join('\n'));
});
test('chat: cada aiSay(\'…\') escrito en la plantilla está traducido (un mensaje nuevo sin traducir falla aquí)', () => {
  const literales = [...template.matchAll(/\baiSay\(\s*(?:'((?:[^'\\]|\\.)*)'|`((?:[^`\\]|\\.)*)`)/g)]
    .map((m) => (m[1] ?? m[2].replace(/\$\{[^}]*\}/g, '1')).replace(/\\(.)/g, '$1')).filter((t) => /[A-Za-zÁÉÍÓÚáéíóúñ]{3}/.test(t));
  assert.ok(literales.length >= 10, 'No encontré los aiSay(…) de la plantilla: ¿cambió el nombre de la función?');
  const faltan = []; for (const t of literales) for (const l of LANGS) if (!cubre[l](t)) faltan.push(`${l}: «${t}»`);
  assert.deepEqual(faltan, [], 'Falta traducir:\n' + faltan.join('\n'));
});

// 4b) Errores del cliente de IA (app/ai-client.mjs) que el chat muestra tal cual: los que arma friendlyError y cada throw new Error('…').
test('chat: los errores del cliente de IA están traducidos (incluido «se intentó N veces»)', async () => {
  const { friendlyError } = await import('../ai-client.mjs');
  const fuente = readFileSync(new URL('../ai-client.mjs', import.meta.url), 'utf8');
  const mensajes = [401, 403, 404, 429, 500, 503, 418, 0].map((s) => friendlyError(null, s, 'detalle del proveedor'));
  mensajes.push(friendlyError(null, 418, ''), friendlyError({ name: 'AbortError' }, 0));
  for (const s of [429, 503]) mensajes.push(friendlyError(null, s, '') + ' (se intentó 3 veces)');
  mensajes.push(...[...fuente.matchAll(/throw new Error\('((?:[^'\\]|\\.)*)'\)/g)].map((m) => m[1]));
  assert.ok(mensajes.length >= 18, 'No encontré los errores de ai-client.mjs: ¿cambió su estructura?');
  const faltan = []; for (const t of mensajes) for (const l of LANGS) if (!cubre[l](t)) faltan.push(`${l}: «${t}»`);
  assert.deepEqual(faltan, [], 'Falta traducir:\n' + faltan.join('\n'));
});

// 5) El traductor en vivo no ve el texto que el CSS dibuja (content:"…"): ahí un texto quedaría siempre en español.
test('CSS: ningún texto con palabras se dibuja con content:"…" (no se puede traducir)', () => {
  const css = [...template.matchAll(/<style[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
  const malos = [...css.matchAll(/content:\s*(["'])((?:(?!\1).)*)\1/g)].map((m) => m[2]).filter((t) => /[A-Za-zÁÉÍÓÚáéíóúñ]{3}/.test(t));
  assert.deepEqual(malos, [], 'Pasa ese texto a un elemento del HTML para que se pueda traducir.');
});

// 5) El archivo final es un solo <script> con todos los módulos pegados: si dos módulos declaran el mismo nombre global
//    (p. ej. `const clean` dos veces) el navegador no ejecuta NADA y la app queda muerta. Aquí lo detectamos sin navegador. — Claude
import vm from 'node:vm';
test('el archivo final se puede analizar sin nombres globales repetidos', () => {
  const scripts = [...dist.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 2, 'faltan los <script> del archivo final');
  scripts.forEach((s, i) => assert.doesNotThrow(() => new vm.Script(s, { filename: `agentcut.html#script${i}` }), `el script ${i} no se puede analizar`));
});
