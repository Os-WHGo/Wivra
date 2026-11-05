// iOS LIVE scenes: contract against core/live-scenes.mjs and ChatGPT's iPhone
// LIVE screen. Static checks; compiling and the Swift smoke run in CI. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCENE_PRESETS, containRect } from '../../core/live-scenes.mjs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const src = '../ios/B0/Sources/';
const policy = read(src + 'WivraLiveScenePolicy.swift');
const scenes = read(src + 'WivraLiveScenes.swift');
const live = read(src + 'WivraIPhoneLiveScreen.swift');
const smoke = read('./WivraLiveScenePolicySmoke.swift');
const workflow = read('../../.github/workflows/meta-b0-native-build.yml');

test('iOS offers every shared preset in the same order', () => {
  const ids = [...policy.matchAll(/\.init\(id: "([a-z-]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids, SCENE_PRESETS.map(p => p.id));
  const r = containRect({ x: 0, y: 0, w: 1, h: 1 }, 1920, 1080, 720, 1280);
  assert.match(smoke, new RegExp(`y: ${r.y}, w: 1, h: ${r.h}`));
  assert.match(workflow, /WivraLiveScenePolicySmoke\.swift/);
});

test('opt-in: without scenes the LIVE pipeline is unchanged', () => {
  assert.match(live, /scenes\?\.liveHasMicrophone = microphone\s*if let scenes, scenes\.enabled \{ await scenes\.attach\(to: capture\) \}/);
  assert.match(scenes, /guard enabled, !attached else \{ return \}/);
  assert.match(scenes, /setVideoMixerSettings\(VideoMixerSettings\(mode: \.offscreen\)\)/);
  assert.match(live, /await scenes\?\.detach\(\)/);
  assert.match(live, /canToggle: controller\.phase == \.idle/);
});

test('HaishinKit layers on ScreenActor; camera inset only for PiP scenes', () => {
  assert.match(scenes, /@ScreenActor\s+final class WivraLiveSceneLayers/);
  for (const t of ['AssetScreenObject()', 'ImageScreenObject()', 'VideoTrackScreenObject()']) assert.ok(scenes.includes(t), t);
  assert.match(scenes, /cameraInset\.track = 0/);
  assert.match(scenes, /show\[\.camera\] == \.pip/);
  assert.doesNotMatch(scenes, /CGImage\?\) \{/, 'no CGImage crosses actors');
});

test('no empty scene; finished or broken video returns to camera; pause mutes mic', () => {
  assert.match(scenes, /guard available\.contains\(id\), attached else/);
  assert.match(scenes, /if !reading \{\s*await self\?\.fallback\("El video terminó/);
  assert.match(scenes, /El video no se pudo reproducir: de vuelta a la cámara/);
  assert.match(scenes, /mic\.isMuted = result\.micMuted\s*audio\.tracks\[0\] = mic/);
  assert.match(policy, /preset\(current\)\?\.show\[lost\] == nil \? nil : "camera"/);
});

test('sources picked before LIVE from Photos, private copy, no upload', () => {
  assert.match(scenes, /if !isLive \{\s*PhotosPicker\("Elegir video"/);
  assert.match(scenes, /temporaryDirectory\.appendingPathComponent\("WivraLiveScenes"/);
  assert.doesNotMatch(scenes, /URLSession|http:|https:|PHPhotoLibrary\.shared\(\)\.performChanges/);
});

test('video sound: track 1 of a multi-track mixer, paced, no extra capture', () => {
  assert.match(live, /MediaMixer\(multiTrackAudioMixingEnabled: scenes\?\.enabled == true\)/);
  assert.match(scenes, /await mixer\.wivraAppendAudio\(WivraSampleBox\(buffer: buffer\), track: 1\)/);
  assert.match(scenes, /if ahead > 0\.3 \{/);
  assert.match(scenes, /AVLinearPCMBitDepthKey: 16/);
  assert.match(scenes, /audioFeeder\?\.cancel\(\)/);
  assert.doesNotMatch(scenes, /RPScreenRecorder|ReplayKit|RPBroadcast/);
});

test('the owner decides whether the video sound goes on air; no mic = picture only, stated', () => {
  assert.match(scenes, /Toggle\("Sonido del video en el LIVE", isOn: \$scenes\.videoSoundToLive\)/);
  assert.match(scenes, /if let mixer, videoSoundToLive, liveHasMicrophone \{/);
  assert.match(scenes, /Sin micrófono en el LIVE: el video se ve, pero su sonido no se transmite/);
  assert.match(scenes, /func stopVideoSound\(\) async/);
});
