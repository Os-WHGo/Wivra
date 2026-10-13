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
assert.equal(scripts.length, 2, 'Deben existir un script editor y un módulo de agente propios, sin CDN');
const dir = mkdtempSync(join(tmpdir(), 'agentcut-smoke-'));
try {
  for(let i=0;i<scripts.length;i++){
    const filename=join(dir,'script'+i+'.mjs');
    writeFileSync(filename,scripts[i][1]);
    execFileSync(process.execPath,['--check',filename],{stdio:'pipe'});
  }
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
assert.ok(scripts.every(s=>!/https?:\/\//.test(s[1])), 'No debe introducir direcciones externas en JavaScript.');
console.log('OK: HTML/editor/agent parseados; sin red explícita. NO probado en hardware.');
