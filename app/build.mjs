// Junta core/ + prompt en UN solo archivo HTML (se puede abrir desde el teléfono sin servidor). — Claude
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadI18n } from './i18n-parse.mjs';
const strip = (s) => s.replace(/^import .*$/gm, '').replace(/^export (?=async function|class|function|const|default)/gm, '');
const core = ['../core/project.mjs', '../core/filters.mjs', '../core/text-style.mjs', '../core/operations.mjs', '../core/op-schemas.mjs', '../core/session.mjs', '../core/tools.mjs', '../core/creative-director.mjs', '../core/shoot-checklist.mjs', '../core/director-production-plan.mjs', '../core/in-app-agent.mjs', './prompt.mjs', './vision.mjs', './timeline.mjs', './export.mjs', './capture-manifest.mjs', './director-parts.mjs', './persist.mjs', './gif.mjs', './filters-gl.mjs', './ai-client.mjs', './i18n.mjs', './describe-op.mjs', './channel-split.mjs', './subtitles.mjs', './ai/transcript-contract.mjs', './ai/whisper-adapter.mjs', './quick-assembly.mjs', './templates.mjs', './silence.mjs', './autocut-evidence.mjs', './autocut.mjs', './autocut-highlights.mjs', './teleprompter.mjs', './loudness.mjs', './rhythm.mjs', './speed.mjs', './transitions.mjs', './music-lib.mjs']
  .map((f) => strip(readFileSync(new URL(f, import.meta.url), 'utf8'))).join('\n');
mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
// Append Director helpers without replacing the Editor's core module list.
// This keeps additions such as capture and project persistence merge-friendly.
const directorIntake = strip(readFileSync(new URL('../core/director-intake.mjs', import.meta.url), 'utf8'));
writeFileSync(new URL('./dist/agentcut.html', import.meta.url), readFileSync(new URL('./template.html', import.meta.url), 'utf8').replace('/*__CORE__*/', () => core + '\n' + directorIntake + '\nconst I18N_DATA = ' + JSON.stringify(loadI18n()) + ';'));
console.log('listo: app/dist/agentcut.html');
