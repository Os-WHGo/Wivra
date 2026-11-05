// LIVE scene model: presets, availability, geometry, fallbacks. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCENE_PRESETS, availableScenes, containRect, layoutScene,
  createSceneState, liveSceneReduce
} from '../live-scenes.mjs';

test('a scene is offered only when its sources are loaded', () => {
  assert.deepEqual(availableScenes(), ['camera']);
  assert.deepEqual(availableScenes({ videoLoaded: true }), ['camera', 'camera-video', 'split', 'video']);
  assert.deepEqual(availableScenes({ videoLoaded: true, cameraLayer: true }), ['camera', 'camera-video', 'video-camera', 'split', 'video']);
  assert.deepEqual(availableScenes({ imageLoaded: true }), ['camera', 'camera-image', 'image']);
  assert.equal(new Set(SCENE_PRESETS.map(p => p.id)).size, SCENE_PRESETS.length);
});

test('video and image keep their shape; numbers mirrored in Kotlin', () => {
  // 16:9 video in a 9:16 portrait 720x1280 frame, full width.
  assert.deepEqual(containRect({ x: 0, y: 0, w: 1, h: 1 }, 1920, 1080, 720, 1280),
    { x: 0, y: 0.341797, w: 1, h: 0.316406 });
  // Portrait video into a portrait frame of the same shape fills it.
  assert.deepEqual(containRect({ x: 0, y: 0, w: 1, h: 1 }, 1080, 1920, 720, 1280), { x: 0, y: 0, w: 1, h: 1 });
  const l = layoutScene('camera-video', { frameWidth: 720, frameHeight: 1280, media: { video: { width: 1920, height: 1080 } } });
  assert.equal(l.layers.camera.visible, true);
  assert.deepEqual(l.layers.camera.rect, { x: 0, y: 0, w: 1, h: 1 });
  assert.equal(l.layers.image.visible, false);
  assert.equal(l.layers.backdrop.visible, false);
  // PiP box 0.35 at bottom-right, video contained inside it.
  assert.deepEqual(l.layers.video.rect, { x: 0.61, y: 0.747129, w: 0.35, h: 0.110742 });
  const v = l.layers.video.rect;
  assert.ok(v.x >= 0 && v.y >= 0 && v.x + v.w <= 1 && v.y + v.h <= 1);
});

test('split and full scenes put a black backdrop under the media', () => {
  const split = layoutScene('split', { media: { video: { width: 1920, height: 1080 } } });
  assert.deepEqual(split.layers.camera.rect, { x: 0, y: 0, w: 1, h: 0.5 });
  assert.deepEqual(split.layers.backdrop.rect, { x: 0, y: 0.5, w: 1, h: 0.5 });
  assert.ok(split.layers.video.rect.y >= 0.5);
  const pause = layoutScene('image', { media: { image: { width: 1000, height: 1000 } } });
  assert.equal(pause.micMuted, true);
  assert.equal(pause.layers.camera.visible, false);
  assert.equal(pause.layers.backdrop.visible, true);
  assert.equal(layoutScene('camera').micMuted, false);
  assert.throws(() => layoutScene('nope'));
});

test('switching plays/pauses the video; ended or failed media returns to camera', () => {
  let s = createSceneState();
  s = liveSceneReduce(s, { type: 'select', scene: 'video' });
  assert.equal(s.current, 'camera');
  assert.equal(s.notices[0].kind, 'scene-unavailable');
  s = liveSceneReduce(s, { type: 'source-loaded', source: 'video' });
  s = liveSceneReduce(s, { type: 'select', scene: 'camera-video' });
  assert.deepEqual(s.actions, [{ do: 'apply-scene', scene: 'camera-video' }, { do: 'play-video' }]);
  s = liveSceneReduce(s, { type: 'select', scene: 'video' });
  assert.deepEqual(s.actions, [{ do: 'apply-scene', scene: 'video' }]); // keeps playing
  s = liveSceneReduce(s, { type: 'media-ended', source: 'video' });
  assert.equal(s.current, 'camera');
  assert.deepEqual(s.actions, [{ do: 'apply-scene', scene: 'camera' }, { do: 'pause-video' }]);
  assert.equal(s.notices[0].kind, 'fallback-video-ended');
  s = liveSceneReduce(s, { type: 'select', scene: 'split' });
  s = liveSceneReduce(s, { type: 'source-failed', source: 'video' });
  assert.equal(s.current, 'camera');
  assert.equal(s.loaded.video, false);
  assert.equal(liveSceneReduce(s, { type: 'select', scene: 'split' }).current, 'camera');
  // An image failing does not touch a camera-only scene.
  let i = liveSceneReduce(createSceneState(), { type: 'source-loaded', source: 'image' });
  i = liveSceneReduce(i, { type: 'source-failed', source: 'image' });
  assert.deepEqual(i.actions, []);
  assert.equal(liveSceneReduce(i, { type: 'select', scene: 'camera' }).actions.length, 0);
  assert.equal(liveSceneReduce(i, { type: 'bogus' }).current, 'camera');
});
