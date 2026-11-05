// Wivra LIVE scenes: what each scene shows (camera, a video, an image), where,
// which scenes can be chosen with the sources loaded now, and what happens
// when a video ends or a source fails. Pure functions; Android (RootEncoder
// filters) and iOS (HaishinKit screen objects) apply the result.
// A scene is never "available" without its sources: no black or empty layer
// is ever sent to the audience. Nothing here proves a working stream. — Claude
import { pipLayout } from './multicam-plan.mjs';

export const SCENE_SLOTS = Object.freeze(['backdrop', 'camera', 'video', 'image']);

// placement per slot: 'full' | 'pip' | 'top-half' | 'bottom-half' (absent = hidden)
export const SCENE_PRESETS = Object.freeze([
  { id: 'camera', label: 'Cámara', show: { camera: 'full' } },
  { id: 'camera-video', label: 'Cámara + video', show: { camera: 'full', video: 'pip' } },
  { id: 'video-camera', label: 'Video + cámara', show: { backdrop: 'full', video: 'full', camera: 'pip' }, needsCameraLayer: true },
  { id: 'split', label: 'Cámara arriba, video abajo', show: { camera: 'top-half', backdrop: 'bottom-half', video: 'bottom-half' } },
  { id: 'video', label: 'Solo video', show: { backdrop: 'full', video: 'full' } },
  { id: 'camera-image', label: 'Cámara + imagen', show: { camera: 'full', image: 'pip' } },
  { id: 'image', label: 'Imagen (pausa)', show: { backdrop: 'full', image: 'full' }, micMuted: true }
].map(Object.freeze));

const REGIONS = {
  full: { x: 0, y: 0, w: 1, h: 1 },
  'top-half': { x: 0, y: 0, w: 1, h: 0.5 },
  'bottom-half': { x: 0, y: 0.5, w: 1, h: 0.5 }
};
const round6 = n => Math.round(n * 1e6) / 1e6;
const r6 = r => ({ x: round6(r.x), y: round6(r.y), w: round6(r.w), h: round6(r.h) });

export function presetById(id) {
  return SCENE_PRESETS.find(p => p.id === id) || null;
}

/** Fit media of aspect width/height inside a region (normalized), centred. */
export function containRect(region, mediaWidth, mediaHeight, frameWidth, frameHeight) {
  if (!(mediaWidth > 0 && mediaHeight > 0 && frameWidth > 0 && frameHeight > 0)) return r6(region);
  const rw = region.w * frameWidth;
  const rh = region.h * frameHeight;
  const a = mediaWidth / mediaHeight;
  const [pw, ph] = rw / rh > a ? [rh * a, rh] : [rw, rw / a];
  return r6({
    x: region.x + (rw - pw) / 2 / frameWidth,
    y: region.y + (rh - ph) / 2 / frameHeight,
    w: pw / frameWidth,
    h: ph / frameHeight
  });
}

/** Scenes that can be chosen now. Camera scenes need nothing extra. */
export function availableScenes({ videoLoaded = false, imageLoaded = false, cameraLayer = false } = {}) {
  return SCENE_PRESETS.filter(p => {
    if (p.needsCameraLayer && !cameraLayer) return false;
    if (p.show.video && !videoLoaded) return false;
    if (p.show.image && !imageLoaded) return false;
    return true;
  }).map(p => p.id);
}

/**
 * Layer rectangles for one scene. `media` carries the real pixel size of the
 * loaded video and image. Returns every slot (hidden ones with visible:false)
 * so the platform can update all layers in one pass.
 */
export function layoutScene(sceneId, {
  frameWidth = 720, frameHeight = 1280, media = {}, corner = 'bottom-right', pipScale = 0.35
} = {}) {
  const preset = presetById(sceneId);
  if (!preset) throw new TypeError('Unknown scene');
  const pipBox = pipLayout({ corner, scale: pipScale, frameWidth, frameHeight });
  const layers = {};
  for (const slot of SCENE_SLOTS) {
    const place = preset.show[slot];
    if (!place) { layers[slot] = { visible: false, rect: { x: 0, y: 0, w: 0, h: 0 } }; continue; }
    const region = place === 'pip' ? { x: pipBox.x, y: pipBox.y, w: pipBox.w, h: pipBox.h } : REGIONS[place];
    const size = media[slot];
    // Camera and backdrop fill their region; video and image keep their shape.
    const rect = (slot === 'video' || slot === 'image') && size
      ? containRect(region, size.width, size.height, frameWidth, frameHeight)
      : r6(region);
    layers[slot] = { visible: true, rect };
  }
  return { scene: preset.id, layers, micMuted: preset.micMuted === true, usesVideo: !!preset.show.video };
}

/**
 * Scene state machine. `loaded` = sources ready now. The fallback is always
 * the plain camera scene, which needs no extra source.
 */
export function createSceneState({ cameraLayer = false } = {}) {
  return { current: 'camera', loaded: { video: false, image: false }, cameraLayer, actions: [], notices: [] };
}

function choose(s, id, reason) {
  const before = presetById(s.current);
  const after = presetById(id);
  s.current = id;
  s.actions.push({ do: 'apply-scene', scene: id });
  if (after.show.video && !before?.show.video) s.actions.push({ do: 'play-video' });
  if (!after.show.video && before?.show.video) s.actions.push({ do: 'pause-video' });
  if (reason) s.notices.push({ kind: reason, scene: id });
}

export function liveSceneReduce(state, event) {
  const s = { ...state, loaded: { ...state.loaded }, actions: [], notices: [] };
  const avail = () => availableScenes({ videoLoaded: s.loaded.video, imageLoaded: s.loaded.image, cameraLayer: s.cameraLayer });
  switch (event?.type) {
    case 'select':
      if (event.scene === s.current) return s;
      if (!avail().includes(event.scene)) {
        s.notices.push({ kind: 'scene-unavailable', scene: event.scene });
        return s;
      }
      choose(s, event.scene);
      return s;
    case 'source-loaded':
      if (event.source === 'video' || event.source === 'image') s.loaded[event.source] = true;
      return s;
    case 'source-failed':
    case 'source-removed': {
      if (event.source !== 'video' && event.source !== 'image') return s;
      s.loaded[event.source] = false;
      if (presetById(s.current).show[event.source]) {
        choose(s, 'camera', event.type === 'source-failed' ? 'fallback-source-failed' : 'fallback-source-removed');
      }
      return s;
    }
    case 'media-ended':
      // A finished commercial returns to the camera instead of a frozen frame.
      if (event.source === 'video' && presetById(s.current).show.video) {
        choose(s, 'camera', 'fallback-video-ended');
      }
      return s;
    default:
      return s;
  }
}
