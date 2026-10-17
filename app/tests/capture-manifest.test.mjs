import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseManifest, importPlan, captureSelectionPlan } from '../capture-manifest.mjs';

const fx = JSON.parse(readFileSync(new URL('./fixtures/manifest-v2-fixtures.json', import.meta.url), 'utf8'));
const byName = (n) => structuredClone(fx.cases.find((c) => c.name === n).manifest);
const v1 = { schemaVersion: 1, captureID: 'abc', cameraSource: 'meta-dat-hevc', audioSource: 'ios-bluetooth-hfp', selectedInputName: 'Ray-Ban', originalVideoFile: 'a.hevc', originalAudioFile: 'a.caf', muxedVideoFile: 'a.mov', audioStartOffsetSeconds: 0.12, createdAtISO8601: '2026-10-13T00:00:00Z' };

test('los 3 ejemplos sintéticos del contrato de ChatGPT (PR #50) se aceptan', () => {
  for (const c of fx.cases) { const r = parseManifest(c.manifest); assert.ok(r.ok, c.name + ': ' + (r.errors || []).join('; ')); }
});
test('v2 con dos canales del mismo archivo: pistas distintas, sin aviso de duplicado', () => {
  const r = parseManifest(byName('usb-stereo-two-transmitters-hypothetical')); assert.ok(r.ok);
  assert.deepEqual(r.manifest.tracks.map((t) => [t.id, t.role, t.channelIndex, t.sampleRateHz]), [['host', 'voice_primary', 0, 48000], ['guest', 'voice_guest', 1, 48000]]);
  assert.equal(r.warnings.length, 0); assert.equal(r.manifest.tracks[0].offsetSeconds, -0.01);
});
test('v2 sin audio: cero pistas', () => { const r = parseManifest(byName('silent-video-no-audio')); assert.ok(r.ok); assert.equal(r.manifest.tracks.length, 0); });
test('v1 real del PR #48 se normaliza a una pista voice_primary y el MOV combinado ya la trae', () => {
  const r = parseManifest(v1); assert.ok(r.ok);
  assert.equal(r.manifest.sourceVersion, 1); assert.deepEqual(r.manifest.tracks.map((t) => [t.role, t.file, t.offsetSeconds, t.offsetKnown]), [['voice_primary', 'a.caf', 0.12, true]]);
  assert.deepEqual(r.manifest.muxedFromTrackIDs, ['audio-1']);
  const r2 = parseManifest({ ...v1, originalAudioFile: null, muxedVideoFile: null, audioStartOffsetSeconds: null }); assert.ok(r2.ok); assert.equal(r2.manifest.tracks.length, 0);
});
test('importPlan no duplica audio: con MOV combinado no importa pistas que ya trae; con el original importa todas', () => {
  const m = parseManifest(byName('single-hfp-sidecar')).manifest;
  const a = importPlan(m, { useMuxed: true }); assert.equal(a.videoFile, 'walk.synced.mov'); assert.equal(a.audioTracks.length, 0); assert.deepEqual(a.embeddedTrackIDs, ['audio-1']);
  const b = importPlan(m, { useMuxed: false }); assert.equal(b.videoFile, 'walk.mov'); assert.deepEqual(b.audioTracks.map((t) => t.id), ['audio-1']);
  const sin = parseManifest(byName('usb-stereo-two-transmitters-hypothetical')).manifest; assert.equal(importPlan(sin, { useMuxed: true }).audioTracks.length, 2);   // no hay MOV combinado
  assert.throws(() => importPlan({}));
});
test('rechaza rutas con carpetas, .., vacías o con saltos de línea', () => {
  for (const f of ['../x.mov', 'a/b.mov', '..', 'a\\b.mov', 'a\nb.mov', '']) { const m = byName('single-hfp-sidecar'); m.originalVideoFile = f; assert.equal(parseManifest(m).ok, false, JSON.stringify(f)); }
  const m = byName('single-hfp-sidecar'); m.tracks[0].file = '../../etc/passwd'; assert.equal(parseManifest(m).ok, false);
});
test('rechaza: rol inválido, kind distinto de audio, ids repetidos, canal fuera de rango, offset no numérico', () => {
  const mk = (f) => { const m = byName('usb-stereo-two-transmitters-hypothetical'); f(m); return parseManifest(m); };
  assert.equal(mk((m) => { m.tracks[0].role = 'voice-host'; }).ok, false);
  assert.equal(mk((m) => { m.tracks[0].kind = 'video'; }).ok, false);
  assert.equal(mk((m) => { m.tracks[1].id = 'host'; }).ok, false);
  assert.equal(mk((m) => { m.tracks[1].channelIndex = 2; }).ok, false);
  assert.equal(mk((m) => { m.tracks[0].startOffsetSeconds = '0.1'; }).ok, false);
  assert.equal(mk((m) => { m.tracks[0].sampleRateHz = 0; }).ok, false);
});
test('rechaza muxedFromTrackIDs inconsistente y avisa de audio duplicado o campos nuevos', () => {
  const a = byName('single-hfp-sidecar'); a.muxedFromTrackIDs = ['no-existe']; assert.equal(parseManifest(a).ok, false);
  const b = byName('single-hfp-sidecar'); b.muxedVideoFile = null; assert.equal(parseManifest(b).ok, false);
  const c = byName('usb-stereo-two-transmitters-hypothetical'); c.tracks[1].channelIndex = 0; const rc = parseManifest(c); assert.ok(rc.ok); assert.ok(rc.warnings.some((w) => /duplic/.test(w)));
  const d = byName('silent-video-no-audio'); d.futuro = 1; const rd = parseManifest(d); assert.ok(rd.ok); assert.ok(rd.warnings.some((w) => /futuro/.test(w)));
});
test('versión desconocida, JSON roto y entradas no objeto', () => {
  assert.equal(parseManifest({ ...v1, schemaVersion: 9 }).ok, false); assert.equal(parseManifest('{no json').ok, false); assert.equal(parseManifest(null).ok, false); assert.equal(parseManifest([]).ok, false);
});

import { planImportOps } from '../capture-manifest.mjs';
import { createProject } from '../../core/project.mjs';
import { Session } from '../../core/session.mjs';

test('planImportOps: video + pistas con desfase positivo, negativo y desconocido se vuelven operaciones válidas', () => {
  const m = parseManifest(byName('usb-stereo-two-transmitters-hypothetical')).manifest;   // host: -0.01, guest: desfase propio
  m.tracks[1].offsetSeconds = 0.5; m.tracks[1].offsetKnown = true;
  const plan = importPlan(m, { useMuxed: false });
  const assets = { [plan.videoFile]: { id: 'a1', duration: 20 }, [m.tracks[0].file]: { id: 'a2', duration: 20 } };
  const splitChannelAssets = { host: { id: 'a3', duration: 20 }, guest: { id: 'a4', duration: 20 } };
  const r = planImportOps(plan, { videoStart: 3, assets, splitChannelAssets });
  assert.equal(r.ops[0].op, 'add_clip'); assert.equal(r.ops[0].start, 3);
  const a = r.ops.filter((o) => o.op === 'add_audio_clip'); assert.equal(a.length, 2);
  assert.deepEqual([a[0].start, a[0].in, a[0].role], [2.99, 0, 'voice_primary']);   // -0.01 s: empieza un pelo antes del video
  assert.deepEqual([a[1].start, a[1].in, a[1].role], [3.5, 0, 'voice_guest']);
  const s = new Session(createProject({ assets: [...Object.values(assets), ...Object.values(splitChannelAssets)].map((x, i) => ({ id: x.id, duration: x.duration, name: 'f' + i })) }));
  assert.ok(s.apply(r.ops).ok); assert.equal(s.project.clips.length, 1); assert.equal(s.project.audioClips.length, 2);
});
test('planImportOps: desfase negativo grande recorta el inicio del audio; al inicio del timeline no usa tiempo negativo', () => {
  const m = parseManifest(byName('single-hfp-sidecar')).manifest; m.tracks[0].offsetSeconds = -1.25; m.tracks[0].offsetKnown = true;
  const plan = importPlan(m, { useMuxed: false });
  const r = planImportOps(plan, { videoStart: 0, assets: { [plan.videoFile]: { id: 'a1', duration: 10 }, [m.tracks[0].file]: { id: 'a2', duration: 10 } } });
  const a = r.ops.find((o) => o.op === 'add_audio_clip'); assert.deepEqual([a.start, a.in, a.out], [0, 1.25, 10]);
});
test('planImportOps: avisa desfase desconocido y omite lo que no se abrió, sin inventar operaciones', () => {
  const m = parseManifest(byName('single-hfp-sidecar')).manifest; m.tracks[0].offsetKnown = false;
  const plan = importPlan(m, { useMuxed: false });
  const r = planImportOps(plan, { videoStart: 0, assets: { [plan.videoFile]: { id: 'a1', duration: 10 }, [m.tracks[0].file]: { id: 'a2', duration: 10 } } });
  assert.ok(r.warnings.some((w) => /desfase desconocido/.test(w)));
  const r2 = planImportOps(plan, { videoStart: 0, assets: { [plan.videoFile]: { id: 'a1', duration: 10 } } });
  assert.equal(r2.ops.length, 1); assert.equal(r2.skipped[0].reason, 'archivo de audio no abierto');
  const r3 = planImportOps(plan, { videoStart: 0, assets: { [m.tracks[0].file]: { id: 'a2', duration: 0 } } });
  assert.equal(r3.ops.length, 0); assert.equal(r3.skipped.length, 2);
  assert.throws(() => planImportOps({}, {}));
});
test('planImportOps con el MOV combinado no agrega pistas de audio (ya suenan dentro del video)', () => {
  const m = parseManifest(byName('single-hfp-sidecar')).manifest; const plan = importPlan(m, { useMuxed: true });
  const r = planImportOps(plan, { videoStart: 0, assets: { [plan.videoFile]: { id: 'a1', duration: 10 } } });
  assert.deepEqual(r.ops.map((o) => o.op), ['add_clip']);
});

test('B1L: un archivo estéreo no reproduce canales L/R duplicados sin una extracción real', () => {
  const m = parseManifest(byName('usb-stereo-two-transmitters-hypothetical')).manifest;
  const plan = importPlan(m);
  const ctx = { videoStart: 0, assets: { [plan.videoFile]: { id: 'v', duration: 20 }, [m.tracks[0].file]: { id: 'whole-stereo', duration: 20 } } };
  const unsplit = planImportOps(plan, ctx);
  assert.equal(unsplit.ops.filter(o => o.op === 'add_audio_clip').length, 0);
  assert.equal(unsplit.skipped.length, 2);
  assert.ok(unsplit.warnings.some(w => /no separado/.test(w)));
  const fake = planImportOps(plan, { ...ctx, splitChannelAssets: { host: { id: 'whole-stereo', duration: 20 }, guest: { id: 'whole-stereo', duration: 20 } } });
  assert.equal(fake.ops.filter(o => o.op === 'add_audio_clip').length, 0);
  const reused = planImportOps(plan, { ...ctx, splitChannelAssets: { host: { id: 'only-left', duration: 20 }, guest: { id: 'only-left', duration: 20 } } });
  assert.equal(reused.ops.filter(o => o.op === 'add_audio_clip').length, 1);
});
test('B1L: manifest iPhone con sonido incorporado no inventa pistas independientes', () => {
  const result = parseManifest({ schemaVersion: 2, captureID: 'iphone-1', cameraSource: 'iphone-avfoundation', audioSource: 'none', selectedInputName: null, originalVideoFile: 'iphone.mov', originalAudioFile: null, muxedVideoFile: null, audioStartOffsetSeconds: null, createdAtISO8601: '2026-10-15T22:00:00Z', tracks: [], muxedFromTrackIDs: [] });
  assert.equal(result.ok, true);
  const plan = importPlan(result.manifest, { useMuxed: true });
  assert.deepEqual(plan.audioTracks, []);
  assert.deepEqual(planImportOps(plan, { assets: { 'iphone.mov': { id: 'v', duration: 5 } } }).ops.map(o => o.op), ['add_clip']);
});

test('captura incompleta nunca se importa como video sin su WAV imprescindible',()=>{
 const m=parseManifest(byName('single-hfp-sidecar')).manifest;
 const p=captureSelectionPlan(m,[m.videoFile,'recording.wivra.json']);
 assert.equal(p.ok,false);
 assert.deepEqual(p.candidates,[]);
 assert.deepEqual(p.missing,[m.tracks[0].file]);
});
test('solo el MOV combinado puede sustituir un WAV ausente que figure como muxed',()=>{
 const m=parseManifest(byName('single-hfp-sidecar')).manifest;
 const mov=captureSelectionPlan(m,[m.videoFile,m.muxedVideoFile,'capture.wivra.json']);
 assert.equal(mov.ok,true);
 assert.deepEqual(mov.candidates,[{name:m.muxedVideoFile,muxed:true}]);
 const full=captureSelectionPlan(m,[m.videoFile,m.muxedVideoFile,m.tracks[0].file,'capture.wivra.json']);
 assert.deepEqual(full.candidates,[{name:m.videoFile,muxed:false},{name:m.muxedVideoFile,muxed:true}]);
});
test('un MOV combinado no compensa audio independiente que nunca se mezcló',()=>{
 const m=parseManifest(byName('single-hfp-sidecar')).manifest;
 const extra={...m.tracks[0],id:'guest',file:'guest.caf',role:'voice_guest'};
 m.tracks.push(extra);
 const result=captureSelectionPlan(m,[m.muxedVideoFile]);
 assert.equal(result.ok,false);
 assert.deepEqual(result.missing,['guest.caf']);
});
test('video silencioso sigue siendo válido; nombres duplicados o archivos vacíos no',()=>{
 const m=parseManifest(byName('silent-video-no-audio')).manifest;
 assert.equal(captureSelectionPlan(m,[m.videoFile]).ok,true);
 assert.equal(captureSelectionPlan(m,[m.videoFile,m.videoFile]).ok,false);
 assert.equal(captureSelectionPlan(m,[{name:m.videoFile,size:0}]).ok,false);
 assert.equal(captureSelectionPlan(m,[{name:m.videoFile,size:1024}]).ok,true);
});
