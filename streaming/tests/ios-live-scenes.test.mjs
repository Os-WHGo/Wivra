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
  assert.match(scenes, /if !reading \{\s*await self\?\.fallback\(NSLocalizedString\("ios\.live\.video_ended"/);
  assert.match(scenes, /NSLocalizedString\("ios\.live\.video_failed"/);
  assert.match(scenes, /mic\.isMuted = result\.micMuted\s*audio\.tracks\[0\] = mic/);
  assert.match(policy, /preset\(current\)\?\.show\[lost\] == nil \? nil : "camera"/);
});

test('sources picked before LIVE from Photos, private copy, no upload', () => {
  assert.match(scenes, /if !isLive \{\s*PhotosPicker\(NSLocalizedString\("ios\.live\.pick_video"/);
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
  assert.match(scenes, /Toggle\(NSLocalizedString\("ios\.live\.video_sound", comment: ""\), isOn: \$scenes\.videoSoundToLive\)/);
  assert.match(scenes, /if let mixer, videoSoundToLive, liveHasMicrophone \{/);
  assert.match(scenes, /NSLocalizedString\("ios\.live\.no_mic"/);
  assert.match(scenes, /func stopVideoSound\(\) async/);
});

test('W77: scenes and two-camera screens are localized and speak to VoiceOver', () => {
  const mc = read(src + 'WivraMultiCamScreen.swift');
  assert.match(scenes, /\.accessibilityAddTraits\(scenes\.current == p\.id \? \.isSelected : \[\]\)/);
  assert.match(scenes, /\.accessibilityValue\(scenes\.current == p\.id/);
  assert.match(scenes, /UIAccessibility\.post\(notification: \.announcement, argument: note\)/);
  assert.match(mc, /UIAccessibility\.post\(notification: \.announcement, argument: text\)/);
  assert.doesNotMatch(scenes + mc, /(Text|Button|Toggle|PhotosPicker|Section)\("[A-ZÁÉÍÓÚ]/, 'no hard-coded Spanish UI text');
  for (const lang of ['es', 'en', 'fr', 'de', 'it', 'pt', 'ja', 'zh']) {
    const dict = readFileSync(new URL(`../ios/B0/Resources/${lang}.lproj/Localizable.strings`, import.meta.url), 'utf8');
    for (const k of ['ios.live.scene_split', 'ios.live.state_on_air', 'ios.multicam.explainer']) assert.ok(dict.includes(`"${k}"`), lang + ' ' + k);
  }
});
