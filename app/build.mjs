// Junta core/ + prompt en UN solo archivo HTML (se puede abrir desde el teléfono sin servidor). — Claude
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadI18n } from './i18n-parse.mjs';
import { dirname, resolve } from 'node:path';
import { verifyPinnedAcceleratedVendor } from './accelerated-vendor-integrity.mjs';

// Optional, explicitly pinned OFFLINE vendor for the isolated accelerated QA
// build. Standard beta packaging still contains no Mediabunny until its native
// random-access v2 and complete timeline renderer are device-verified.
// NEVER load a media SDK from a CDN at application runtime.
const acceleratedBundlePath = process.env.WIVRA_MEDIABUNNY_BUNDLE;
let acceleratedVendor = '';
if (acceleratedBundlePath) {
  const pkg = JSON.parse(readFileSync(resolve(dirname(acceleratedBundlePath), '..', '..', 'package.json'), 'utf8'));
  if (pkg.name !== 'mediabunny' || pkg.version !== '1.61.6' || pkg.license !== 'MPL-2.0')
    throw new Error('Acelerador: versión o licencia de Mediabunny no coinciden con 1.61.6/MPL-2.0.');
  const source = readFileSync(acceleratedBundlePath, 'utf8');
  if (!source.includes('Mediabunny') || source.length < 10000)
    throw new Error('Acelerador: bundle local Mediabunny vacío o inesperado.');
  // The package version alone does not pin the exact generated JavaScript.
  // A trusted release/QA pipeline must provide the digest independently.
  verifyPinnedAcceleratedVendor({
    source,
    expectedSha256: process.env.WIVRA_MEDIABUNNY_SHA256
  });
  // Keep an explicit license notice in the generated distribution; a full
  // license/attribution must be shipped when production activates this.
  acceleratedVendor = '/* Wivra optional QA vendor: Mediabunny 1.61.6, MPL-2.0 (https://github.com/Vanilagy/mediabunny) */\n' +
    source.replace(/<\/script/gi, '<\\/script') + '\n';
}

const strip = (s) => s.replace(/^import .*$/gm, '').replace(/^export (?=async function|class|function|const|default)/gm, '');
const core = ['../core/project.mjs', '../core/filters.mjs', '../core/text-style.mjs', '../core/operations.mjs', '../core/op-schemas.mjs', '../core/session.mjs', '../core/tools.mjs', '../core/creative-director.mjs', '../core/shoot-checklist.mjs', '../core/director-production-plan.mjs', '../core/in-app-agent.mjs', './prompt.mjs', './vision.mjs', './timeline.mjs', './export-sink.mjs', './media-container.mjs', './export-engine-policy.mjs', './accelerated-cut-renderer.mjs', './accelerated-native-sink.mjs', './accelerated-memory-export.mjs', './export.mjs', '../core/multicam-plan.mjs', './capture-manifest.mjs', './director-parts.mjs', './persist.mjs', './gif.mjs', './filters-gl.mjs', './ai-client.mjs', './i18n.mjs', './describe-op.mjs', './channel-split.mjs', './subtitles.mjs', './ai/transcript-contract.mjs', './ai/whisper-adapter.mjs', './quick-assembly.mjs', './templates.mjs', './silence.mjs', './autocut-evidence.mjs', './autocut.mjs', './autocut-highlights.mjs', './teleprompter.mjs', './loudness.mjs', './rhythm.mjs', './speed.mjs', './transitions.mjs', './music-lib.mjs']
  .map((f) => strip(readFileSync(new URL(f, import.meta.url), 'utf8'))).join('\n');
// QA-only bundled pipeline in the SAME editor HTML and its own lexical scope.
// The ordinary beta/production build includes neither vendor nor this code.
// Never enable this merely because a native bridge exists on a phone.
const qaPipeline = acceleratedVendor ? [
  './accelerated-multitrack-parity.mjs',
  './accelerated-audio-mixer.mjs',
  './accelerated-multitrack-renderer.mjs',
  './accelerated-storage-budget.mjs',
  './accelerated-native-codec-probe.mjs',
  './accelerated-runtime-identity.mjs',
  './accelerated-avc-compatibility.mjs',
  './accelerated-codec-diagnostic.mjs',
  './accelerated-codec-diagnostic-journal.mjs',
  './accelerated-codec-matrix.mjs',
  './accelerated-native-multitrack-export.mjs'
].map(f => strip(readFileSync(new URL(f, import.meta.url), 'utf8'))).join('\n') : '';
const qaAndroidHost = qaPipeline ? strip(readFileSync(new URL('./accelerated-android-host.mjs', import.meta.url), 'utf8')) : '';
const qaIOSHost = qaPipeline ? strip(readFileSync(new URL('./accelerated-ios-host.mjs', import.meta.url), 'utf8')) : '';
const qaUI = qaPipeline ? ['./accelerated-qa-export-ui.mjs','./accelerated-codec-diagnostic-ui.mjs',
  './accelerated-codec-matrix-ui.mjs']
  .map(f => strip(readFileSync(new URL(f, import.meta.url), 'utf8'))).join('\n') : '';
const qaSidecar = qaPipeline ?
  '\n;(() => {\n' + qaPipeline +
  '\nconst findAndroid = (() => {\n' + qaAndroidHost + '\nreturn detectAcceleratedAndroidHost;\n})();' +
  '\nconst findIOS = (() => {\n' + qaIOSHost + '\nreturn detectAcceleratedIOSHost;\n})();' +
  '\nasync function recordOnNative(options) {' +
  '\n if(options?.experimentalAccelerated !== true) throw new Error("La exportación acelerada requiere autorización experimental explícita.");' +
  '\n const host = findAndroid() ?? findIOS();' +
  '\n if(!host) throw new Error("No existe el puente nativo acelerado v2 en este dispositivo.");' +
  '\n return recordExperimentalNativeMultitrack({...options,host,M:globalThis.Mediabunny});' +
  '\n}' +
  '\nconst nativeHost = () => findAndroid() ?? findIOS();' +
  '\nconst saveToPhotos = ({saved,userConfirmed}) => saveVerifiedAcceleratedVideoToPhotos({host:nativeHost(),saved,userConfirmed});' +
  '\nconst diagnoseCodecs = options => runAcceleratedCodecDiagnostic({...options,M:globalThis.Mediabunny});' +
  '\nconst diagnoseCodecMatrix = options => runAcceleratedCodecMatrix({...options, diagnose: args => runAcceleratedCodecDiagnostic({...args, M:globalThis.Mediabunny})});' +
  '\nconst api = {recordExperimentalNativeMultitrack, recordOnNative, prepareAcceleratedMultitrack, renderAcceleratedMultitrack, nativeHost, saveToPhotos, diagnoseCodecs, diagnoseCodecMatrix};' +
  '\nglobalThis.WivraAcceleratedQA = Object.freeze(api);\n' + qaUI + '\n})();\n' : '';

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
// Append Director helpers without replacing the Editor's core module list.
// This keeps additions such as capture and project persistence merge-friendly.
const directorIntake = strip(readFileSync(new URL('../core/director-intake.mjs', import.meta.url), 'utf8'));
const captureNative = ['./capture-locked-session.mjs', './capture-journal-store.mjs', './capture-native-verifier.mjs', './capture-native-session.mjs']
  .map(f => strip(readFileSync(new URL(f, import.meta.url), 'utf8'))).join('\n');
writeFileSync(new URL('./dist/agentcut.html', import.meta.url), readFileSync(new URL('./template.html', import.meta.url), 'utf8').replace('/*__CORE__*/', () => acceleratedVendor + core + '\n' + directorIntake + '\n' + captureNative + qaSidecar + '\nconst I18N_DATA = ' + JSON.stringify(loadI18n()) + ';'));
console.log('listo: app/dist/agentcut.html');
