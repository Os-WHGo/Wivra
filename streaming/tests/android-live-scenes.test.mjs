// Android LIVE scenes: contract against core/live-scenes.mjs and the existing
// phone LIVE screen. Static checks; no stream or phone is exercised. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCENE_PRESETS, containRect } from '../../core/live-scenes.mjs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const dir = '../android/app/src/full/java/com/oswhgo/wivra/';
const model = read(dir + 'WivraLiveScenes.kt');
const ctl = read(dir + 'WivraLiveSceneController.kt');
const live = read(dir + 'WivraPhoneLiveActivity.kt');
const ktTest = read('../android/app/src/testFull/java/com/oswhgo/wivra/WivraLiveScenesTest.kt');

test('Android offers the shared presets except camera-as-layer', () => {
  const ids = [...model.matchAll(/Preset\("([a-z-]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids, SCENE_PRESETS.filter(p => !p.needsCameraLayer).map(p => p.id));
  const r = containRect({ x: 0, y: 0, w: 1, h: 1 }, 1920, 1080, 720, 1280);
  assert.match(ktTest, new RegExp(`Rect\\(0\\.0, ${r.y}, 1\\.0, ${r.h}\\)`));
});

test('layers are RootEncoder filters recreated for idle preview and preserved during LIVE', () => {
  assert.match(ctl, /SurfaceFilterRender \{/);
  assert.match(ctl, /ImageObjectFilterRender\(\)/);
  assert.match(ctl, /gl\.clearFilters\(\)/);
  assert.equal([...live.matchAll(/startPreview\(preview\)/g)].length,
    [...live.matchAll(/scenes\.reattach\(\)/g)].length, 'every preview start handles filter attachment');
  assert.match(live, /if \(!initiatedByUser\) scenes\.reattach\(\)/, 'reattaching the LIVE display must preserve GL filters');
  // Sprite units are percent of the frame, origin top-left.
  assert.match(ctl, /setScale\(\(spec\.rect\.w \* 100\)\.toFloat\(\), \(spec\.rect\.h \* 100\)\.toFloat\(\)\)/);
});

test('no empty scene on air; ended or failed video returns to the camera', () => {
  assert.match(ctl, /if \(id !in available\(\)\)/);
  assert.match(ctl, /setOnCompletionListener \{[\s\S]*?fallback\(WivraLiveScenes\.Slot\.VIDEO/);
  assert.match(ctl, /setOnErrorListener \{[\s\S]*?fallback\(WivraLiveScenes\.Slot\.VIDEO/);
  assert.match(model, /fun fallbackFor\(current: String, lostSlot: Slot\): String\? =\s*if \(preset\(current\)\?\.show\?\.containsKey\(lostSlot\) == true\) "camera" else null/);
});

test('external sources only before LIVE, internal standby still available; nothing persisted or uploaded', () => {
  assert.match(ctl, /val actions = WivraLiveScenes.sourceActions\(isLive\(\)\)/);
  assert.match(model, /!live \|\| it in setOf\(SourceAction.STANDBY, SourceAction.MOVE_INSET, SourceAction.VIDEO_SOUND\)/);
  assert.match(ctl, /if \(action !in WivraLiveScenes.sourceActions\(isLive\(\)\)\) return@setItems/);
  assert.match(live, /WivraLiveSceneController\(this\) \{ initiatedByUser \}/);
  assert.doesNotMatch(ctl, /takePersistableUriPermission|SharedPreferences|http:|https:|putExtra/);
  assert.doesNotMatch(ctl, /\.recycle\(\)/, 'no bitmap recycle while GL may upload it');
  // Pause scene mutes only the LIVE microphone, re-applied once LIVE starts.
  assert.match(ctl, /stream\?\.audioSource as\? MicrophoneSource/);
  assert.match(live, /publisher\.startStream\(address\)\s*scenes\.reapply\(\)/);
});

test('the existing LIVE safety rules are untouched', () => {
  assert.match(live, /endpointInput\.text\?\.clear\(\)/);
  assert.match(live, /setTitle\(R\.string\.plive_confirm_title\)/);
  assert.match(live, /stopAndReview\(\)/);
});

test('video sound goes into the LIVE mix without extra permission or capture', () => {
  const feed = read(dir + 'WivraVideoAudioFeed.kt');
  const mix = read(dir + 'WivraPcmMix.kt');
  assert.match(feed, /class WivraSceneAudioEffect : CustomAudioEffect\(\)/);
  assert.match(feed, /MediaCodec\.createDecoderByType/);
  assert.match(feed, /ring\.free\(\) < outRate \* outChannels \/ 5/, 'bounded read-ahead');
  assert.match(ctl, /m\.setAudioEffect\(effect\)/);
  assert.match(ctl, /runCatching \{ mp\.setVolume\(0f, 0f\) \}/, 'silent on the phone, no echo into the mic');
  assert.match(ctl, /R\.string\.scene_video_needs_mic/);
  assert.match(mix, /coerceIn\(Short\.MIN_VALUE\.toInt\(\), Short\.MAX_VALUE\.toInt\(\)\)/, 'clamp, never wrap');
  assert.doesNotMatch(feed + ctl, /MediaProjection|AudioPlaybackCapture|createScreenCaptureIntent/);
});

test('W77: scene panel is localized and readable by TalkBack', () => {
  assert.doesNotMatch(ctl, /note\.text = "/, 'no hard-coded Spanish notes');
  assert.match(ctl, /accessibilityLiveRegion = android\.view\.View\.ACCESSIBILITY_LIVE_REGION_POLITE/);
  assert.match(ctl, /b\.contentDescription = activity\.getString\(R\.string\.scene_content_description, sceneLabel\(id\), state\)/);
  assert.match(ctl, /minHeight = \(48 \* resources\.displayMetrics\.density\)\.toInt\(\)/);
  assert.match(ctl, /isAccessibilityHeading = true/);
  for (const id of ['camera', 'camera-video', 'split', 'video', 'camera-image', 'image']) assert.ok(ctl.includes(id === 'camera' ? 'R.string.scene_camera' : `"${id}" -> R.string.scene_`), id);
});
