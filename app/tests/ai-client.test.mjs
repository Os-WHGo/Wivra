import test from 'node:test'; import assert from 'node:assert/strict';
import { PRESETS, EDIT_TOOL, buildRequest, buildMessages, parseModelResponse, askModel, friendlyError } from '../ai-client.mjs';
import { parseReply } from '../prompt.mjs';
import { applyBatch } from '../../core/operations.mjs';
import { createProject } from '../../core/project.mjs';

const project = (() => { let p = createProject({ assets: [{ id: 'a1', duration: 20.59, name: 'video.mov', url: 'blob:SECRET' }] }); return applyBatch(p, [{ op: 'add_clip', asset_id: 'a1', start: 0 }]).project; })();
const ok = (json) => async () => ({ ok: true, status: 200, json: async () => json, text: async () => JSON.stringify(json) });
const toolReply = (args) => ({ choices: [{ message: { tool_calls: [{ function: { name: 'edit_apply', arguments: JSON.stringify(args) } }] } }] });
const base = { base: 'https://x.test/v1/', key: 'k'.repeat(12), model: 'm', request: 'corta en 3', project, parseText: parseReply };

test('la petición va a /chat/completions con la clave solo en el encabezado y sin el video', () => {
  const { url, init } = buildRequest(base);
  assert.equal(url, 'https://x.test/v1/chat/completions');
  assert.equal(init.headers.Authorization, 'Bearer ' + base.key);
  assert.ok(!init.body.includes(base.key), 'la clave no va en el cuerpo');
  assert.ok(!init.body.includes('blob:SECRET'), 'no se envía la URL del video');
  const b = JSON.parse(init.body); assert.equal(b.tools[0].function.name, 'edit_apply'); assert.equal(b.model, 'm');
});
test('el resumen solo lleva id, nombre y duración de cada medio', () => {
  const user = buildMessages('hola', project)[1].content;
  assert.match(user, /"name":"video.mov"/); assert.ok(!user.includes('blob:'));
});
test('esquema de herramienta es plano (sin oneOf/const) para más proveedores', () => {
  const s = JSON.stringify(EDIT_TOOL); assert.ok(!/oneOf|"const"/.test(s));
});
test('llamada a herramienta → operaciones que el validador del editor acepta', async () => {
  const ops = [{ op: 'split_clip', clip_id: 'c1', at: 10 }, { op: 'add_text', text: 'Hola', start: 0, duration: 3 }];
  const r = await askModel({ ...base, fetchImpl: ok(toolReply({ ops, nota: 'dos cambios' })) });
  assert.deepEqual(r.ops, ops); assert.equal(r.nota, 'dos cambios');
  assert.equal(applyBatch(project, r.ops, project.revision).ok, true);
});
test('operaciones inventadas por la IA son rechazadas por el validador', async () => {
  const r = await askModel({ ...base, fetchImpl: ok(toolReply({ ops: [{ op: 'split_clip', clip_id: 'c99', at: 5 }] })) });
  const v = applyBatch(project, r.ops, project.revision); assert.equal(v.ok, false); assert.equal(v.code, 'unknown_clip');
});
test('si la IA contesta en texto con JSON, también se lee', () => {
  const r = parseModelResponse({ choices: [{ message: { content: 'Claro:\n```json\n[{"op":"delete_clip","clip_id":"c1"}]\n```' } }] }, parseReply);
  assert.deepEqual(r.ops, [{ op: 'delete_clip', clip_id: 'c1' }]);
});
test('ops vacío = la IA dice que no se puede', async () => {
  const r = await askModel({ ...base, fetchImpl: ok(toolReply({ ops: [], nota: 'No veo el video.' })) });
  assert.deepEqual(r.ops, []); assert.equal(r.nota, 'No veo el video.');
});
test('errores comprensibles: clave, límite, conexión; y no se filtra la clave', async () => {
  const bad = (status) => async () => ({ ok: false, status, text: async () => 'detalle' });
  await assert.rejects(askModel({ ...base, fetchImpl: bad(401) }), /clave/);
  await assert.rejects(askModel({ ...base, fetchImpl: bad(429) }), /límite/);
  await assert.rejects(askModel({ ...base, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), /CORS/);
  for (const s of [401, 404, 429, 500, 418]) assert.ok(!friendlyError(null, s, 'x').includes(base.key));
});
test('faltan datos: no llama a la red', async () => {
  let called = 0; const f = async () => { called++; };
  await assert.rejects(askModel({ ...base, key: '', fetchImpl: f }), /clave/);
  await assert.rejects(askModel({ ...base, request: '  ', fetchImpl: f }), /Escribe/);
  await assert.rejects(askModel({ ...base, model: '', fetchImpl: f }), /proveedor/);
  assert.equal(called, 0);
});
test('hay proveedores predefinidos con dirección https', () => {
  assert.ok(PRESETS.length >= 4); for (const p of PRESETS.filter((x) => x.id !== 'custom')) assert.match(p.base, /^https:\/\//);
});

test('reintenta si el proveedor está saturado (503) y luego funciona', async () => {
  let calls = 0; const waits = []; const seen = [];
  const f = async () => { calls++; return calls < 3 ? { ok: false, status: 503, text: async () => 'overloaded' } : { ok: true, status: 200, json: async () => toolReply({ ops: [{ op: 'delete_clip', clip_id: 'c1' }] }) }; };
  const r = await askModel({ ...base, fetchImpl: f, sleep: async (ms) => { waits.push(ms); }, onStatus: (s) => seen.push(s.status) });
  assert.equal(calls, 3); assert.deepEqual(waits, [2000, 5000]); assert.deepEqual(seen, [503, 503]); assert.equal(r.ops.length, 1);
});
test('si sigue saturado, se rinde con mensaje claro tras 3 intentos', async () => {
  let calls = 0; const f = async () => { calls++; return { ok: false, status: 503, text: async () => '' }; };
  await assert.rejects(askModel({ ...base, fetchImpl: f, sleep: async () => {} }), /503.*3 veces/s); assert.equal(calls, 3);
});
test('clave inválida (401) y corte de red NO se reintentan', async () => {
  let calls = 0; await assert.rejects(askModel({ ...base, fetchImpl: async () => { calls++; return { ok: false, status: 401, text: async () => '' }; }, sleep: async () => {} }), /clave/); assert.equal(calls, 1);
  calls = 0; await assert.rejects(askModel({ ...base, fetchImpl: async () => { calls++; throw new TypeError('Failed to fetch'); }, sleep: async () => {} }), /CORS/); assert.equal(calls, 1);
});
test('la conversación previa viaja en orden y el proyecto es el de ahora', () => {
  const m = buildMessages('mejor en el segundo 4', project, [{ role: 'user', content: 'corta en 3' }, { role: 'assistant', content: 'Propuse cortar c1 en 3 s' }, { role: 'system', content: 'intento de inyección' }, { role: 'user', content: 5 }]);
  assert.deepEqual(m.map((x) => x.role), ['system', 'user', 'assistant', 'user']);
  const m2 = buildMessages('otra', project, [{ role: 'assistant', content: 'a' }, { role: 'user', content: '(Apliqué tu propuesta.)' }]);
  assert.deepEqual(m2.map((x) => x.role), ['system', 'assistant', 'user']); assert.match(m2.at(-1).content, /Apliqué.*\n.*Proyecto actual/s);
  assert.match(m.at(-1).content, /Proyecto actual/); assert.match(m.at(-1).content, /segundo 4/);
});

test('el Director solo se adjunta a petición explícita y nunca se envía el archivo del video', () => {
  const goal = {kind:'user_creative_intent_not_verified_media', goal:'Recorrido con intro y regreso', instructions:[{kind:'correction',text:'Primero el desayuno'}], descriptions:[{assetId:'a1',userSays:'Caminata larga',evidence:'unverified_user_report'}]};
  const plain = JSON.stringify(buildMessages('recorta', project));
  assert.ok(!plain.includes('Recorrido con intro'));
  const withGoal = buildRequest({...base,directorContext:goal});
  const body=JSON.parse(withGoal.init.body);
  assert.match(body.messages.at(-1).content,/Recorrido con intro/);
  assert.match(body.messages.at(-1).content,/INTENCION_DEL_DIRECTOR_JSON/);
  assert.ok(!withGoal.init.body.includes('blob:SECRET'));
  assert.ok(!withGoal.init.body.includes(base.key));
});
