// Las líneas de la propuesta del chat (app/describe-op.mjs) y su traducción. — Claude
// 1) En español salen EXACTAMENTE igual que antes de traducirlas (es lo que se le manda de historial al modelo).
// 2) Cada frase tiene fila en los 7 idiomas con las mismas marcas {1}, {2}… (si una traducción se come una marca, se pierde el dato).
// 3) Ningún texto en español se queda fuera de la traducción.
// 4) La plantilla y el archivo final usan el módulo.
// Si falla porque agregaste una frase: agrega su fila en app/i18n/strings-3.tsv y strings-it.tsv y una muestra aquí. No quites la prueba.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadI18n } from '../i18n-parse.mjs';
import { I18N_LANGS, i18nCompile } from '../i18n.mjs';
import { describeOperation, fillTemplate } from '../describe-op.mjs';
import { LOOK_PRESETS } from '../../core/filters.mjs';
import { localBasicCommand } from '../../core/in-app-agent.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SRC = read('../describe-op.mjs'), template = read('../template.html'), dist = read('../dist/agentcut.html'), build = read('../build.mjs');
const D = loadI18n();
const LANGS = I18N_LANGS.map((x) => x[0]).filter((l) => l !== 'es');
const lookName = (id) => LOOK_PRESETS[id]?.name || id;
const toks = (s) => (String(s).match(/\{\d+\}/g) || []).sort().join(' ');

// [operación, línea en español que se mostraba antes de traducir]
const GOLDEN = [
  [{ op: 'split_clip', clip_id: 'c1', at: 3.456 }, 'Cortar c1 en 3.46 s'],
  [{ op: 'trim_clip', clip_id: 'c1', in: 2, out: 7 }, 'Recortar c1: de 2 a 7 s'],
  [{ op: 'trim_clip', clip_id: 'c2', in: 0.5, out: 12.25 }, 'Recortar c2: de 0.5 a 12.25 s'],
  [{ op: 'move_clip', clip_id: 'c2', start: 10 }, 'Mover c2 a 10 s'],
  [{ op: 'delete_clip', clip_id: 'c3' }, 'Borrar c3'],
  [{ op: 'set_clip_audio', clip_id: 'c1', muted: true }, 'Audio de c1: silenciar'],
  [{ op: 'set_clip_audio', clip_id: 'c1', muted: false }, 'Audio de c1: con sonido'],
  [{ op: 'set_clip_audio', clip_id: 'c1', volume: 0.5 }, 'Audio de c1: volumen 50%'],
  [{ op: 'set_clip_audio', clip_id: 'c1', muted: false, volume: 0.8 }, 'Audio de c1: con sonido, volumen 80%'],
  [{ op: 'set_clip_audio', clip_id: 'c1' }, 'Audio de c1: '],
  [{ op: 'add_clip', asset_id: 'a1' }, 'Agregar a1 en 0 s'],
  [{ op: 'add_clip', asset_id: 'a1', start: 4 }, 'Agregar a1 en 4 s'],
  [{ op: 'add_text', text: 'Vancouver', start: 0, duration: 3 }, 'Texto «Vancouver» en 0 s por 3 s'],
  [{ op: 'add_text', text: 'Hola {2} y {1}', start: 1.5, duration: 2.25 }, 'Texto «Hola {2} y {1}» en 1.5 s por 2.25 s'],
  [{ op: 'add_audio_clip', asset_id: 'a2' }, 'Pista de audio a2 en 0 s'],
  [{ op: 'add_audio_clip', asset_id: 'a2', start: 2.5 }, 'Pista de audio a2 en 2.5 s'],
  [{ op: 'add_overlay_clip', asset_id: 'a3', start: 1.5 }, 'Capa a3 encima, desde 1.5 s'],
  [{ op: 'add_overlay_clip', asset_id: 'a3' }, 'Capa a3 encima, desde 0 s'],
  [{ op: 'set_overlay', clip_id: 'c4', x: 0.5 }, 'Ajustar capa c4: x'],
  [{ op: 'set_overlay', clip_id: 'c4', x: 0.5, y: 0.2, scale: 0.3 }, 'Ajustar capa c4: x, y, scale'],
  [{ op: 'set_audio_clip', clip_id: 'c5', track: 2, role: 'music' }, 'Pista de audio c5: fila 2, papel music'],
  [{ op: 'set_audio_clip', clip_id: 'c5', track: 0 }, 'Pista de audio c5: fila 0'],
  [{ op: 'set_audio_clip', clip_id: 'c5', role: 'music' }, 'Pista de audio c5: papel music'],
  [{ op: 'set_clip_fx', clip_id: 'c1', intro: 'fade', outro: 'zoom', dur: 0.5 }, 'Efecto de c1: entrada fade, salida zoom, 0.5 s'],
  [{ op: 'set_clip_fx', clip_id: 'c1', intro: 'fade' }, 'Efecto de c1: entrada fade'],
  [{ op: 'set_clip_fx', clip_id: 'c1' }, 'Efecto de c1: '],
  [{ op: 'set_clip_filter', clip_id: 'c1', reset: true }, 'Quitar filtro de c1'],
  [{ op: 'set_clip_filter', clip_id: 'c1', look: 'none' }, 'Quitar filtro de c1'],
  [{ op: 'set_clip_filter', clip_id: 'c1', look: 'vintage' }, 'Filtro de c1: Cámara antigua'],
  [{ op: 'set_clip_filter', clip_id: 'c1', look: 'noir' }, 'Filtro de c1: Noir'],
  [{ op: 'set_clip_filter', clip_id: 'c1', look: 'pk:desconocido' }, 'Filtro de c1: pk:desconocido'],
  [{ op: 'set_clip_filter', clip_id: 'c1', brightness: 0.2 }, 'Filtro de c1: ajustes de color'],
  [{ op: 'set_format', aspect: '9:16', fit: 'cover' }, 'Formato: cuadro 9:16, rellenar'],
  [{ op: 'set_format', aspect: '16:9', fit: 'contain' }, 'Formato: cuadro 16:9, barras negras'],
  [{ op: 'set_format', aspect: '1:1' }, 'Formato: cuadro 1:1'],
  [{ op: 'set_format', fit: 'cover' }, 'Formato: rellenar'],
  [{ op: 'set_format' }, 'Formato: '],
  [{ op: 'algo_nuevo', x: 1 }, '{"op":"algo_nuevo","x":1}'],
];
const KNOWN = GOLDEN.filter(([o]) => o.op !== 'algo_nuevo');
const num = (n) => String(Math.round(n * 100) / 100);
const translator = (lang) => { const tr = i18nCompile(D[lang]); return (k, ...a) => fillTemplate(tr(k), a); };

test('fillTemplate: rellena en orden, en una sola pasada, y deja la marca si falta el valor', () => {
  assert.equal(fillTemplate('{2} y {1}', ['a', 'b']), 'b y a');
  assert.equal(fillTemplate('X {1} Y {2}', ['{2}', 'z']), 'X {2} Y z', 'un valor que trae «{2}» no se vuelve a sustituir');
  assert.equal(fillTemplate('a {1} {3}', ['x']), 'a x {3}');
  assert.equal(fillTemplate('{1} s', [0]), '0 s', 'el cero es un valor válido');
  assert.equal(fillTemplate('sin marcas', ['x']), 'sin marcas');
});

test('en español cada operación sale EXACTAMENTE como antes de traducir (38 casos)', () => {
  assert.equal(GOLDEN.length, 38);
  for (const [o, es] of GOLDEN) assert.equal(describeOperation(o, { lookName }), es, JSON.stringify(o));
});

// Las frases literales que el módulo pasa por T(…): se leen del código, para que una frase nueva sin fila no pase inadvertida.
function literalKeys(src) {
  const keys = new Set();
  for (const m of src.matchAll(/(?<![\w$.])T\(/g)) {
    let depth = 0, q = null, lit = '', before = '';
    scan: for (let i = m.index + 2; i < src.length; i++) {
      const c = src[i];
      if (q) { // dentro de una frase entre comillas simples
        if (c === '\\') { lit += src[++i]; continue; }
        if (c !== q) { lit += c; continue; }
        if (!/(?:===|!==|==)\s*$/.test(before)) keys.add(lit); // 'cover' en «o.fit === 'cover'» se compara, no se traduce
        before += `'${lit}'`; q = null; continue;
      }
      if (c === "'") { q = c; lit = ''; continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break scan; depth--; }
      else if (c === ',' && depth === 0) break scan; // solo el primer argumento es la frase
      before += c;
    }
  }
  return keys;
}

test('el módulo usa T(…) con frases que las muestras recorren por completo', () => {
  const fromCode = literalKeys(SRC);
  assert.ok(fromCode.size >= 28, 'frases leídas del código: ' + fromCode.size);
  assert.ok(!/(?<![\w$.])T\(\s*[`"]/.test(SRC), 'las frases de T(…) van entre comillas simples (así esta prueba las ve)');
  const seen = new Set();
  const rec = (k, ...a) => { seen.add(k); return fillTemplate(k, a); };
  for (const [o] of GOLDEN) describeOperation(o, { T: rec, lookName });
  const dynamic = new Set([...Object.values(LOOK_PRESETS).map((p) => p.name), 'pk:desconocido']); // T(lookName(id)): nombre del filtro
  const seenLiterals = new Set([...seen].filter((k) => !dynamic.has(k)));
  assert.deepEqual([...fromCode].sort(), [...seenLiterals].sort(), 'las muestras no recorren alguna rama (agrega una muestra) o el código usa una frase que esta prueba no ve');
});

test('cada frase tiene fila en los 7 idiomas, con las mismas marcas {n}', () => {
  const keys = [...literalKeys(SRC), 'Operaciones locales básicas, sin modelo de IA', ...Object.values(LOOK_PRESETS).map((p) => p.name)];
  for (const l of LANGS) for (const k of keys) {
    const v = D[l][k]; assert.ok(typeof v === 'string' && v.trim(), `${l}: falta la fila de «${k}»`);
    assert.equal(toks(v), toks(k), `${l}: «${k}» → «${v}» no conserva las marcas`);
    assert.ok(!v.includes('{}'), `${l}: «${k}» trae {} (aquí se usan {1}, {2}…)`);
  }
});

test('la nota del modo básico es la frase que el código manda, y está traducida', () => {
  const nota = localBasicCommand('pon texto "Hola"', { clips: [{ start: 0, in: 0, out: 5 }] }).description;
  assert.equal(nota, 'Operaciones locales básicas, sin modelo de IA');
  for (const l of LANGS) assert.ok(D[l][nota] && D[l][nota] !== nota, l);
});

test('ningún texto en español se queda fuera de la traducción (traductor «de mentira» que pone todo en MAYÚSCULAS)', () => {
  const up = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, ['clip_id', 'asset_id', 'text', 'role', 'intro', 'outro'].includes(k) ? String(v).toUpperCase() : v]));
  const shout = (k, ...a) => fillTemplate(String(k).toUpperCase(), a);
  for (const [o, es] of KNOWN) {
    const s = describeOperation(up(o), { T: shout, lookName }).replace(/\b(x|y|scale)\b/g, ''); // nombres de propiedad del editor: se muestran tal cual
    assert.ok(!/[a-zñáéíóúü]/.test(s), `queda texto sin pasar por T en «${es}» → «${s}»`);
  }
});

test('en cada idioma: sin marcas sueltas, con todos los datos, y distinto del español', () => {
  const MUST_DIFFER = ['en', 'fr', 'de', 'ja', 'zh'];
  for (const l of LANGS) {
    const T = translator(l);
    for (const [o, es] of KNOWN) {
      const out = describeOperation(o, { T, lookName }), tag = `${l} · ${JSON.stringify(o)} → «${out}»`;
      if (!(o.text || '').includes('{')) assert.ok(!/\{\d+\}/.test(out), 'marca sin rellenar: ' + tag);
      for (const k of ['clip_id', 'asset_id', 'text']) if (o[k] !== undefined) assert.ok(out.includes(o[k]), `falta ${k}: ` + tag);
      for (const k of ['at', 'in', 'out', 'start', 'duration']) if (typeof o[k] === 'number') assert.ok(out.includes(num(o[k])), `falta ${k}: ` + tag);
      assert.ok(out.length > 0, tag);
      if (MUST_DIFFER.includes(l)) assert.notEqual(out, es, 'quedó en español: ' + tag);
    }
  }
});

test('el orden de las palabras cambia por idioma (se pueden reordenar {1}, {2}…)', () => {
  const at = (l, o) => describeOperation(o, { T: translator(l), lookName });
  const cut = { op: 'split_clip', clip_id: 'c1', at: 3.456 };
  assert.equal(at('en', cut), 'Split c1 at 3.46 s');
  assert.equal(at('de', cut), 'c1 bei 3.46 s teilen');
  assert.equal(at('ja', cut), 'c1 を 3.46秒で分割');
  assert.equal(at('zh', cut), '在 3.46 秒处分割 c1');
  assert.equal(at('en', { op: 'add_text', text: 'Vancouver', start: 0, duration: 3 }), 'Text “Vancouver” at 0 s for 3 s');
  assert.equal(at('en', { op: 'set_clip_audio', clip_id: 'c1', muted: true, volume: 0.5 }), 'Audio for c1: mute, volume 50%');
  assert.equal(at('ja', { op: 'set_clip_audio', clip_id: 'c1', muted: true, volume: 0.5 }), 'c1 の音声: ミュート、音量 50%', 'la lista usa la coma de cada idioma');
  assert.equal(at('en', { op: 'set_clip_filter', clip_id: 'c1', look: 'vintage' }), `Filter for c1: ${D.en['Cámara antigua']}`, 'el nombre del filtro también se traduce');
});

test('la plantilla y el archivo final usan el módulo, y al modelo le llega el historial en español', () => {
  assert.ok(build.includes("'./describe-op.mjs'"), 'build.mjs no incluye describe-op.mjs');
  for (const [name, s] of [['plantilla', template], ['archivo final', dist]]) {
    assert.ok(s.includes('describeOperation('), name + ': falta describeOperation');
    assert.ok(s.includes('fillTemplate(i18nTr(key), a)'), name + ': falta el traductor de las líneas');
    assert.ok(s.includes('id="aiPropText" data-notr="1"'), name + ': la propuesta ya traducida debe ir con data-notr');
  }
  assert.ok(dist.includes('function describeOperation(') && dist.includes('const fillTemplate'), 'el archivo final no trae el módulo');
  assert.match(template, /content: 'Propuse:\\n' \+ linesEs/, 'el historial para el modelo debe seguir en español');
  assert.match(template, /aiLogAdd\('ia', \(nota \? nota \+ '\\n' : ''\) \+ lines, true\)/, 'la propuesta en el registro debe ir como texto final (sin volver a traducir)');
  assert.ok(!/function describeOp\(o\) \{/.test(template), 'quedó la función vieja con textos en español dentro de la plantilla');
  assert.match(template, /nota: local\.description, notaFija: true/, 'la nota del modo básico debe marcarse como frase fija de Wivra');
  assert.match(template, /const nota = r\.nota && r\.notaFija \? i18nTr\(r\.nota\) : r\.nota/, 'solo la nota fija se traduce; la nota libre del modelo se muestra tal cual');
});
