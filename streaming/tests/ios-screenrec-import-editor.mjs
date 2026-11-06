// W109 (Claude): the manifests written by «Pasar a Wivra» (WivraScreenRecordImportSmoke.swift, macOS) read by
// the EDITOR's own parser, exactly as an import would: valid v2, all files present, mic + app sound as
// separate audio tracks with their offsets. Usage: node streaming/tests/ios-screenrec-import-editor.mjs <base dir>
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { parseManifest, captureSelectionPlan, importPlan } from '../../app/capture-manifest.mjs';

const base = join(process.argv[2] || '/tmp', 'wivra-screenrec-import');
const manifests = readFileSync(join(base, 'manifests.txt'), 'utf8').split('\n').filter(Boolean);
let failed = 0;
const check = (ok, what) => { console.log((ok ? 'ok - ' : 'not ok - ') + what); if (!ok) failed++; };
check(manifests.length === 2, 'two imported recordings (finished + interrupted)');
for (const path of manifests) {
  const parsed = parseManifest(readFileSync(path, 'utf8'));
  check(parsed.ok, `editor accepts ${path.split('/').pop()} ${parsed.errors ? parsed.errors.join(' ') : ''}`);
  if (!parsed.ok) continue;
  const m = parsed.manifest, folder = dirname(path);
  const files = readdirSync(folder).map((name) => ({ name, size: statSync(join(folder, name)).size }));
  const plan = captureSelectionPlan(m, files);
  check(plan.ok && plan.candidates[0].name === m.videoFile, `all files present for ${m.videoFile}`);
  const ip = importPlan(m);
  console.log(`  ${m.videoFile}: ${ip.audioTracks.map((t) => `${t.role}/${t.source} @${t.offsetSeconds}s`).join(', ') || 'video only'}`);
  if (/FINISHED/.test(m.videoFile)) {
    const mic = ip.audioTracks.find((t) => t.source === 'ios-replaykit-mic'), app = ip.audioTracks.find((t) => t.source === 'ios-replaykit-app');
    check(ip.audioTracks.length === 2 && mic && app, 'microphone and app sound become two editor audio tracks');
    check(mic && mic.offsetKnown && Math.abs(mic.offsetSeconds - 0.4) < 0.05, 'microphone placed 0.4 s after the video start');
    check(app && app.offsetKnown && Math.abs(app.offsetSeconds) < 0.05, 'app sound starts with the video');
  }
}
console.log(failed ? `${failed} check(s) failed` : 'the editor accepts every imported screen recording');
process.exit(failed ? 1 : 0);
