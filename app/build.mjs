// Junta core/ + prompt en UN solo archivo HTML (se puede abrir desde el teléfono sin servidor). — Claude
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadI18n } from './i18n-parse.mjs';
import { dirname, resolve } from 'node:path';
import { verifyPinnedAcceleratedVendor } from './accelerated-vendor-integrity.mjs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { WV_ENGINE_SHA256 } from './ai/whisper-wasm.mjs';
import { MEDIABUNNY_VERSION, MEDIABUNNY_MIN_SHA256 } from './accelerated-vendor-pin.mjs';

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

// MU V4 (owner decision, Claude): WebCodecs + Mediabunny is connected to the REAL editor. The vendored,
// pinned Mediabunny is embedded compressed and INERT: it is decompressed, checked again (SHA-256) and run only
// when an accelerated export is explicitly chosen. Automatic activation stays off (export-engine-policy.mjs).
// A CI QA build may still inject a separately downloaded bundle with WIVRA_MEDIABUNNY_BUNDLE (eager, as before).
const mbVendored = readFileSync(new URL('./vendor/mediabunny/mediabunny.min.cjs', import.meta.url));
if (createHash('sha256').update(mbVendored).digest('hex') !== MEDIABUNNY_MIN_SHA256)
  throw new Error('Acelerador: el SHA-256 de vendor/mediabunny/mediabunny.min.cjs no coincide con el pin.');
const mbEngineTag = acceleratedVendor ? '' : '<script type="text/plain" id="mbEngine" data-notr data-version="' + MEDIABUNNY_VERSION + '">' +
  gzipSync(mbVendored, { level: 9 }).toString('base64') + '</script>';
const mbLoader = `
const MB_SHA256 = '${MEDIABUNNY_MIN_SHA256}';
let mbLoading = null;
/** Mediabunny ${MEDIABUNNY_VERSION} (MPL-2.0), embedded compressed: decompressed, re-checked and run on first use only. */
async function loadMediabunny() {
  if (globalThis.Mediabunny) return globalThis.Mediabunny;
  if (!mbLoading) mbLoading = (async () => {
    const tag = document.getElementById('mbEngine'), b64 = (tag && tag.textContent || '').trim();
    if (!b64) throw new Error('Esta versión no incluye el motor acelerado.');
    const gz = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const src = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    if (await wvSha256Hex(src) !== MB_SHA256) throw new Error('El motor acelerado no coincide con la versión verificada.');
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    try {
      await new Promise((ok, no) => { const s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = () => no(new Error('No se pudo cargar el motor acelerado.')); document.head.appendChild(s); });
    } finally { URL.revokeObjectURL(url); }
    if (!globalThis.Mediabunny) throw new Error('El motor acelerado no se inició.');
    return globalThis.Mediabunny;
  })();
  try { return await mbLoading; } catch (e) { mbLoading = null; throw e; }
}`;
const strip = (s) => s.replace(/^import .*$/gm, '').replace(/^export (?=async function|class|function|const|default)/gm, '');
const core = ['../core/project.mjs', '../core/filters.mjs', '../core/text-style.mjs', '../core/operations.mjs', '../core/op-schemas.mjs', '../core/session.mjs', '../core/tools.mjs', '../core/creative-director.mjs', '../core/shoot-checklist.mjs', '../core/director-production-plan.mjs', '../core/in-app-agent.mjs', './prompt.mjs', './vision.mjs', './timeline.mjs', './export-sink.mjs', './media-container.mjs', './export-engine-policy.mjs', './accelerated-cut-renderer.mjs', './accelerated-native-sink.mjs', './accelerated-memory-export.mjs', './export.mjs', '../core/multicam-plan.mjs', './capture-manifest.mjs', './director-parts.mjs', './persist.mjs', './file-identity.mjs', './gif.mjs', './filters-gl.mjs', './ai-client.mjs', './i18n.mjs', './describe-op.mjs', './channel-split.mjs', './subtitles.mjs', './ai/transcript-contract.mjs', './ai/whisper-adapter.mjs', './ai/whisper-wasm.mjs', './quick-assembly.mjs', './templates.mjs', './silence.mjs', './autocut-evidence.mjs', './autocut.mjs', './autocut-highlights.mjs', './teleprompter.mjs', './loudness.mjs', './rhythm.mjs', './speed.mjs', './transitions.mjs', './music-lib.mjs']
  .map((f) => strip(readFileSync(new URL(f, import.meta.url), 'utf8'))).join('\n');
// Accelerated pipeline in the SAME editor HTML and its own lexical scope (MU V4: always built in, explicit
// choice only). Never enable it automatically merely because a native bridge exists on a phone.
const qaPipeline = [
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
].map(f => strip(readFileSync(new URL(f, import.meta.url), 'utf8'))).join('\n');
const qaAndroidHost = qaPipeline ? strip(readFileSync(new URL('./accelerated-android-host.mjs', import.meta.url), 'utf8')) : '';
const qaIOSHost = qaPipeline ? strip(readFileSync(new URL('./accelerated-ios-host.mjs', import.meta.url), 'utf8')) : '';
const qaUI = qaPipeline ? ['./accelerated-qa-export-ui.mjs','./accelerated-codec-diagnostic-ui.mjs',
  './accelerated-codec-matrix-ui.mjs']
  .map(f => strip(readFileSync(new URL(f, import.meta.url), 'utf8'))).join('\n') : '';
const qaSidecar = qaPipeline ?
  '\n;(() => {\n' + qaPipeline +
  '\nconst findAndroid = (() => {\n' + qaAndroidHost + '\nreturn detectAcceleratedAndroidHost;\n})();' +
  '\nconst findIOS = (() => {\n' + qaIOSHost + '\nreturn detectAcceleratedIOSHost;\n})();' +
  mbLoader +
  '\nasync function recordOnNative(options) {' +
  '\n if(options?.experimentalAccelerated !== true) throw new Error("La exportación acelerada requiere autorización experimental explícita.");' +
  '\n const host = findAndroid() ?? findIOS();' +
  '\n if(!host) throw new Error("No existe el puente nativo acelerado v2 en este dispositivo.");' +
  '\n return recordExperimentalNativeMultitrack({...options,host,M:await loadMediabunny()});' +
  '\n}' +
  '\nconst nativeHost = () => findAndroid() ?? findIOS();' +
  '\nconst saveToPhotos = ({saved,userConfirmed}) => saveVerifiedAcceleratedVideoToPhotos({host:nativeHost(),saved,userConfirmed});' +
  '\nconst diagnoseCodecs = async options => runAcceleratedCodecDiagnostic({...options,M:await loadMediabunny()});' +
  '\nconst diagnoseCodecMatrix = async options => { const M = await loadMediabunny(); return runAcceleratedCodecMatrix({...options, diagnose: args => runAcceleratedCodecDiagnostic({...args, M})}); };' +
  '\nconst api = {loadMediabunny, recordExperimentalNativeMultitrack, recordOnNative, prepareAcceleratedMultitrack, renderAcceleratedMultitrack, nativeHost, saveToPhotos, diagnoseCodecs, diagnoseCodecMatrix};' +
  '\nglobalThis.WivraAcceleratedQA = Object.freeze(api);\n' + qaUI + '\n})();\n' : '';

mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
// Append Director helpers without replacing the Editor's core module list.
// This keeps additions such as capture and project persistence merge-friendly.
const directorIntake = strip(readFileSync(new URL('../core/director-intake.mjs', import.meta.url), 'utf8'));
const captureNative = ['./capture-locked-session.mjs', './capture-journal-store.mjs', './capture-native-verifier.mjs', './capture-native-session.mjs']
  .map(f => strip(readFileSync(new URL(f, import.meta.url), 'utf8'))).join('\n');
// W86: whisper.cpp (MIT) built to one WebAssembly module in CI; embedded compressed, verified here and again before each use.
const wvEngine = readFileSync(new URL('./vendor/whisper/wivra-whisper.js', import.meta.url));
if (createHash('sha256').update(wvEngine).digest('hex') !== WV_ENGINE_SHA256) throw new Error('Motor de voz: el SHA-256 de vendor/whisper/wivra-whisper.js no coincide.');
const wvEngineTag = '<script type="text/plain" id="wvEngine" data-notr>' + gzipSync(wvEngine, { level: 9 }).toString('base64') + '</script>';
writeFileSync(new URL('./dist/agentcut.html', import.meta.url), readFileSync(new URL('./template.html', import.meta.url), 'utf8').replace('<!--__WV_ENGINE__-->', () => wvEngineTag + mbEngineTag).replace('/*__CORE__*/', () => acceleratedVendor + core + '\n' + directorIntake + '\n' + captureNative + qaSidecar + '\nconst I18N_DATA = ' + JSON.stringify(loadI18n()) + ';'));
console.log('listo: app/dist/agentcut.html');
