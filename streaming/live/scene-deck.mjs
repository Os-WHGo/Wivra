// Wivra LIVE Studio B2: deterministic, offline scene/control-deck planner.
// No compositor, microphone capture, streaming, encoding or camera permissions
// are implemented here. An external runtime must verify inputs and encoder.
// This module never stores video bytes, API keys, URLs or the user's files.
export const LIVE_SCHEMA = 'wivra-live-scene-deck-v1';
const ratios = new Set(['9:16', '16:9', '1:1', '4:5']);
const sources = new Set(['included', 'user', 'pack', 'provider']);
const assetKinds = new Set(['image', 'video', 'audio']);
const layerKinds = new Set(['camera', 'image', 'video', 'cg']);
const sceneLayouts = new Set(['single', 'pip', 'split', 'grid']);
const deckActions = new Set(['take_scene', 'show_image', 'play_video', 'clear_media']);
const idOk = x => typeof x === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(x);
const finite = x => typeof x === 'number' && Number.isFinite(x);
const fail = msg => { throw new Error(msg); };
const plain = obj => obj !== null && typeof obj === 'object' && !Array.isArray(obj);
const unique = list => new Set(list).size === list.length;

function checkAsset(a) {
  if (!plain(a) || !idOk(a.id) || !assetKinds.has(a.kind) || !sources.has(a.source) ||
      typeof a.cached !== 'boolean') fail('Invalid asset: ID, kind, source and cached are required.');
  return {id: a.id, kind: a.kind, source: a.source, cached: a.cached};
}
function checkRect(r) {
  if (!plain(r) || !['x','y','width','height'].every(k => finite(r[k])) ||
      r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0 ||
      r.x + r.width > 1.000001 || r.y + r.height > 1.000001)
    fail('Layer rectangle must be a normalized visible region.');
  return {x:r.x, y:r.y, width:r.width, height:r.height};
}
function checkScene(scene, assets) {
  if (!plain(scene) || !idOk(scene.id) || !sceneLayouts.has(scene.layout) ||
      !Array.isArray(scene.layers) || scene.layers.length < 1 || scene.layers.length > 4)
    fail('Scene must contain 1-4 layers and a supported layout.');
  const layers = scene.layers.map(layer => {
    if (!plain(layer) || !idOk(layer.id) || !layerKinds.has(layer.kind))
      fail('Invalid scene layer.');
    const opacity = layer.opacity === undefined ? 1 : layer.opacity;
    if (!finite(opacity) || opacity < 0 || opacity > 1) fail('Invalid layer opacity.');
    if (layer.kind === 'camera') {
      if (!idOk(layer.inputId) || layer.assetId !== undefined)
        fail('Camera layer requires inputId, not assetId.');
      return {id:layer.id,kind:layer.kind,inputId:layer.inputId,
        rect:checkRect(layer.rect),opacity};
    }
    if (layer.kind === 'cg') {
      if (typeof layer.text !== 'string' || !layer.text.trim() ||
          layer.text.length > 180 || layer.assetId !== undefined)
        fail('CG layer requires visible text up to 180 characters.');
      return {id:layer.id,kind:layer.kind,text:layer.text,
        rect:checkRect(layer.rect),opacity};
    }
    if (!idOk(layer.assetId) || !assets.some(a => a.id === layer.assetId &&
       a.kind === layer.kind)) fail('Layer references missing or incompatible asset.');
    return {id:layer.id,kind:layer.kind,assetId:layer.assetId,
      rect:checkRect(layer.rect),opacity};
  });
  if (!unique(layers.map(l => l.id))) fail('Duplicate layer ID.');
  return {id:scene.id,layout:scene.layout,layers};
}
function checkDeckButton(button, scenes, assets) {
  if (!plain(button) || !Number.isInteger(button.slot) || button.slot < 1 ||
      button.slot > 12 || !deckActions.has(button.action)) fail('Invalid deck button.');
  const target = button.targetId ?? null;
  if (button.action === 'take_scene') {
    if (!scenes.some(s => s.id === target)) fail('Deck references unknown scene.');
  } else if (button.action === 'show_image' || button.action === 'play_video') {
    const kind = button.action === 'show_image' ? 'image' : 'video';
    if (!assets.some(a => a.id === target && a.kind === kind))
      fail('Deck references unknown or wrong asset type.');
  } else if (target !== null) fail('Clear-media button takes no target ID.');
  return {slot:button.slot, action:button.action,targetId:target};
}

export function createStudioState({projectId,canvas='9:16',assets=[],scenes=[],deck=[]}={}) {
  if (!idOk(projectId)) fail('Project ID is required.');
  if (!ratios.has(canvas)) fail('Unsupported output ratio.');
  if (!Array.isArray(assets) || assets.length > 5000) fail('Invalid asset index.');
  const safeAssets = assets.map(checkAsset);
  if (!unique(safeAssets.map(a => a.id))) fail('Duplicate asset ID.');
  if (!Array.isArray(scenes) || scenes.length > 64) fail('Invalid scene index.');
  const safeScenes = scenes.map(s => checkScene(s,safeAssets));
  if (!unique(safeScenes.map(s => s.id))) fail('Duplicate scene ID.');
  if (!Array.isArray(deck) || deck.length > 12) fail('Invalid deck layout.');
  const safeDeck = deck.map(d => checkDeckButton(d,safeScenes,safeAssets));
  if (!unique(safeDeck.map(d => d.slot))) fail('Duplicate deck slot.');
  return {
    schema:LIVE_SCHEMA, projectId, canvas, assets:safeAssets,scenes:safeScenes,
    deck:safeDeck,previewSceneId:null,programSceneId:null,
    activeMedia:null,transport:{status:'offline',evidence:'no-encoder'},
    events:[],revision:0
  };
}
function assertState(state) {
  if (!plain(state) || state.schema !== LIVE_SCHEMA) fail('Invalid Wivra live session.');
}
function at(state, atMs) {
  if (!Number.isSafeInteger(atMs) || atMs < 0 ||
      (state.events.length && atMs < state.events[state.events.length - 1].atMs))
    fail('Event time must be a nondecreasing integer number of milliseconds.');
}
function event(state, type, data, atMs) {
  at(state,atMs);
  return {...state,revision:state.revision + 1,
    events:[...state.events,{sequence:state.events.length + 1,atMs,type,...data}]};
}
export function preflightScene(state, sceneId, {readyCameraInputs=[]}={}) {
  assertState(state);
  const scene = state.scenes.find(s => s.id === sceneId);
  if (!scene) return {ok:false,problems:['La escena no existe.']};
  const inputs = new Set(Array.isArray(readyCameraInputs)?readyCameraInputs:[]);
  const problems = [];
  for (const layer of scene.layers) {
    if (layer.kind === 'camera' && !inputs.has(layer.inputId))
      problems.push('Cámara no verificada: ' + layer.inputId);
    if (layer.kind === 'video' || layer.kind === 'image') {
      const asset = state.assets.find(a => a.id === layer.assetId);
      if (!asset?.cached) problems.push('Recurso no descargado localmente: ' + layer.assetId);
    }
  }
  return {ok:problems.length === 0,problems};
}
export function cueScene(state, sceneId, atMs, options={}) {
  const check = preflightScene(state,sceneId,options);
  if (!check.ok) fail('No se puede preparar: ' + check.problems.join('; '));
  return event({...state,previewSceneId:sceneId},'scene-preview',{sceneId},atMs);
}
export function takePreview(state, atMs, options={}) {
  assertState(state);
  if (!state.previewSceneId) fail('No scene staged in preview.');
  const check = preflightScene(state,state.previewSceneId,options);
  if (!check.ok) fail('No se puede pasar a programa: ' + check.problems.join('; '));
  return event({...state,programSceneId:state.previewSceneId},'scene-take',
    {sceneId:state.previewSceneId,transportAtTake:state.transport.status},atMs);
}
export function updateAssetCache(state, assetId, cached, atMs) {
  assertState(state);
  if (typeof cached !== 'boolean' || !state.assets.some(a => a.id === assetId))
    fail('Unknown asset or invalid cache status.');
  const assets = state.assets.map(a => a.id === assetId ? {...a,cached} : a);
  return event({...state,assets},'asset-cache-state',{assetId,cached},atMs);
}
export function observeEncoder(state, status, evidence, atMs) {
  assertState(state);
  if (!['offline','ready','live','stopped','failed'].includes(status))
    fail('Unknown transport status.');
  if (!['encoder-ack','encoder-stopped','encoder-error'].includes(evidence))
    fail('Transport state requires real encoder acknowledgement.');
  if (status === 'live' && evidence !== 'encoder-ack')
    fail('Cannot claim LIVE without encoder acknowledgement.');
  if ((status === 'offline' || status === 'stopped') && evidence !== 'encoder-stopped')
    fail('Encoder stop requires stop confirmation.');
  if (status === 'failed' && evidence !== 'encoder-error')
    fail('Encoder failure requires error event.');
  return event({...state,transport:{status,evidence}},'encoder-observed',{status},atMs);
}
export function pressDeck(state, slot, atMs, options={}) {
  assertState(state);
  const button = state.deck.find(d=>d.slot===slot);
  if (!button) fail('Deck button is unassigned.');
  if (button.action === 'take_scene') {
    const staged=cueScene(state,button.targetId,atMs,options);
    return takePreview(staged,atMs,options);
  }
  if (button.action === 'clear_media')
    return event({...state,activeMedia:null},'media-clear',{},atMs);
  const a=state.assets.find(asset=>asset.id===button.targetId);
  if (!a?.cached) fail('This media must be downloaded before live playback.');
  const kind=button.action === 'show_image'?'image':'video';
  return event({...state,activeMedia:{assetId:a.id,kind}},kind==='image'?'image-show':'video-trigger',
     {assetId:a.id,transportAtTrigger:state.transport.status},atMs);
}
export function makeEditingLog(state) {
  assertState(state);
  return {schema:'wivra-live-edit-log-v1',projectId:state.projectId,
    canvas:state.canvas,events:state.events.map(e=>({...e})),
    // This is a cue sheet, not a recorded stream and not footage.
    mediaRecorded:false,encoderValidated:false};
}
