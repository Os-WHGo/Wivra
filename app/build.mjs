// Junta core/ + prompt en UN solo archivo HTML (se puede abrir desde el teléfono sin servidor). — Claude
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const strip = (s) => s.replace(/^import .*$/gm, '').replace(/^export (class|function|const|default)/gm, '$1');
const core = ['../core/project.mjs', '../core/operations.mjs', '../core/session.mjs', '../core/tools.mjs', './prompt.mjs', './vision.mjs']
  .map((f) => strip(readFileSync(new URL(f, import.meta.url), 'utf8'))).join('\n');
mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/agentcut.html', import.meta.url), readFileSync(new URL('./template.html', import.meta.url), 'utf8').replace('/*__CORE__*/', () => core));
console.log('listo: app/dist/agentcut.html');
