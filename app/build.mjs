// Junta core/ + prompt en UN solo archivo HTML (se puede abrir desde el teléfono sin servidor). — Claude
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const strip = (s) => s.replace(/^import .*$/gm, '').replace(/^export (?=async function|class|function|const|default)/gm, '');
const core = ['../core/project.mjs', '../core/operations.mjs', '../core/session.mjs', '../core/tools.mjs', '../core/creative-director.mjs', '../core/shoot-checklist.mjs', '../core/in-app-agent.mjs', './prompt.mjs', './vision.mjs', './timeline.mjs', './export.mjs', './capture-manifest.mjs', './persist.mjs', './ai-client.mjs']
  .map((f) => strip(readFileSync(new URL(f, import.meta.url), 'utf8'))).join('\n');
mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/agentcut.html', import.meta.url), readFileSync(new URL('./template.html', import.meta.url), 'utf8').replace('/*__CORE__*/', () => core));
console.log('listo: app/dist/agentcut.html');
