import test from 'node:test'; import assert from 'node:assert/strict';
import { handle, hits, validate } from './worker.mjs';
const env = { ALLOWED_ORIGINS: 'https://os-whgo.github.io', ALLOWED_MODELS: 'gemini-flash-latest', GEMINI_API_KEY: 'SECRETO-DEL-SERVIDOR', RATE_PER_MINUTE: '3' };
const good = { model: 'gemini-flash-latest', messages: [{ role: 'user', content: 'hola' }], tools: [{ type: 'function', function: { name: 'edit_apply' } }] };
const req = (body, o = {}) => new Request('https://p.test/v1/chat/completions', { method: 'POST', headers: { Origin: 'https://os-whgo.github.io', 'CF-Connecting-IP': o.ip || '1.1.1.1', ...(o.headers || {}) }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const upstream = (calls) => async (url, init) => { calls.push({ url, init }); return new Response(JSON.stringify({ choices: [] }), { status: 200 }); };
test.beforeEach(() => hits.clear());

test('petición válida: se reenvía con la clave DEL SERVIDOR y el navegador no la ve', async () => {
  const calls = []; const r = await handle(req(good), env, upstream(calls), 1000);
  assert.equal(r.status, 200); assert.equal(calls[0].init.headers.Authorization, 'Bearer SECRETO-DEL-SERVIDOR');
  assert.ok(!JSON.stringify([...r.headers]).includes('SECRETO') && !(await r.text()).includes('SECRETO'));
  assert.equal(r.headers.get('Access-Control-Allow-Origin'), 'https://os-whgo.github.io');
});
test('la clave que mande el cliente se ignora', async () => {
  const calls = []; await handle(req(good, { headers: { Authorization: 'Bearer DEL-CLIENTE' } }), env, upstream(calls), 1000);
  assert.ok(!JSON.stringify(calls[0].init).includes('DEL-CLIENTE'));
});
test('origen no permitido → 403 y no llama a Google', async () => {
  const calls = []; const r = await handle(new Request('https://p.test/v1/chat/completions', { method: 'POST', headers: { Origin: 'https://malo.example' }, body: JSON.stringify(good) }), env, upstream(calls), 1000);
  assert.equal(r.status, 403); assert.equal(calls.length, 0);
});
test('preflight OPTIONS solo para orígenes permitidos', async () => {
  const ok = await handle(new Request('https://p.test/v1/chat/completions', { method: 'OPTIONS', headers: { Origin: 'https://os-whgo.github.io' } }), env, upstream([]), 1000);
  const no = await handle(new Request('https://p.test/v1/chat/completions', { method: 'OPTIONS', headers: { Origin: 'https://malo.example' } }), env, upstream([]), 1000);
  assert.equal(ok.status, 204); assert.equal(no.status, 403);
});
test('rechaza modelo no permitido, otra herramienta, streaming y mensajes raros', () => {
  assert.match(validate({ ...good, model: 'caro-model' }, env), /Modelo/);
  assert.match(validate({ ...good, tools: [{ function: { name: 'borrar_todo' } }] }, env), /edit_apply/);
  assert.match(validate({ ...good, stream: true }, env), /streaming/);
  assert.match(validate({ ...good, messages: [{ role: 'tool', content: 'x' }] }, env), /Mensajes/);
  assert.equal(validate(good, env), null);
});
test('límite de uso: la 4.ª petición por minuto da 429; otra persona no se ve afectada', async () => {
  const calls = []; const f = upstream(calls);
  for (let i = 0; i < 3; i++) assert.equal((await handle(req(good), env, f, 1000 + i)).status, 200);
  assert.equal((await handle(req(good), env, f, 1500)).status, 429);
  assert.equal((await handle(req(good, { ip: '2.2.2.2' }), env, f, 1500)).status, 200);
  assert.equal((await handle(req(good), env, f, 62_000)).status, 200);
});
test('cuerpo enorme o JSON roto, y servidor sin clave', async () => {
  assert.equal((await handle(req('x'.repeat(40000)), env, upstream([]), 1000)).status, 413);
  assert.equal((await handle(req('{no es json'), env, upstream([]), 1000)).status, 400);
  assert.equal((await handle(req(good), { ...env, GEMINI_API_KEY: '' }, upstream([]), 1000)).status, 500);
});
