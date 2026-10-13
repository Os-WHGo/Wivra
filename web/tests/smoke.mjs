// Comprobación estática, NO sustituye pruebas reales en iPhone/Android.
// Ejecutar: node web/tests/smoke.mjs
// — ChatGPT
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length, 1, 'Debe haber un único script propio sin CDN');
const dir = mkdtempSync(join(tmpdir(), 'agentcut-smoke-'));
try {
  const filename = join(dir, 'editor.js');
  writeFileSync(filename, scripts[0][1]);
  execFileSync(process.execPath, ['--check', filename], { stdio: 'pipe' });
} finally {
  rmSync(dir, { recursive: true, force: true });
}

for (const id of ['file','video','start','end','seek','title','renderCanvas','keepAudio','export','result','status']) {
  const found = html.match(new RegExp('\\bid="' + id + '"','g')) || [];
  assert.equal(found.length, 1, 'Control ausente/duplicado: ' + id);
}
for (const needle of ['type="file"', 'playsinline', 'captureStream(', 'new MediaRecorder(', 'createMediaElementSource(', 'ctx.fillText(']) {
  assert.ok(html.includes(needle), 'Falta función de prototipo: ' + needle);
}
assert.ok(!/<script[^>]+src=|<iframe|<form|\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\(/i.test(html),
  'El prototipo M0 no debe tener red ni servidores externos.');
assert.ok(!/https?:\/\//.test(scripts[0][1]), 'No debe introducir direcciones externas en JavaScript.');
console.log('OK: HTML requerido presente; JavaScript válido; sin red explícita. NO probado en hardware.');
