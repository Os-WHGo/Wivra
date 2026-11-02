// Wivra P0-W9: real, *isolated* WebCodecs+Mediabunny multi-lane renderer.
// This is deliberately NOT the default export engine. It consumes the exact
// same drawFrame implementation as the stable exporter, including captions,
// video overlays, image overlays, crop, shapes and fade transforms. Decoding
// each frame by timestamp avoids cumulative seeking/MediaRecorder clock drift.
// First implementation is bounded to <=30 s / <=60 fps for controlled QA.
// Never claim a 30/60-minute or iPhone codec result from these source tests.
import {clipLength,srcTime} from '../core/project.mjs';
import {drawFrame,formatSize,exportBitrate,clipGain} from './export.mjs';
import {analyzeAcceleratedMultitrackParity} from './accelerated-multitrack-parity.mjs';
import {checkedRandomWrite} from './accelerated-cut-renderer.mjs';
import {mixAcceleratedAudioBlocks} from './accelerated-audio-mixer.mjs';

export const ACCELERATED_MULTITRACK_RENDERER_VERSION = 1;
export const ACCELERATED_MULTITRACK_MAX_SECONDS = 30;
export const ACCELERATED_MULTITRACK_MAX_ITEMS = 80;

// Explicit supported keys. Unknown future edits MUST NOT disappear silently.
const MAIN = new Set(['id','asset_id','start','in','out','speed','volume','muted',
  'fxIn','fxOut','fxDur','filter']);
const OVERLAY = new Set([...MAIN,'track','x','y','scale','opacity','zoom','px',
  'py','shape','frame','frameColor']);
const AUDIO = new Set([...MAIN,'role','ducking']);
const PROJECT = new Set(['clips','overlayClips','audioClips','texts','format',
  'revision','nextId','assets','effects','transitions']);
const deny = (message) => {throw new Error('Multitrack accelerated preflight: '+message);};

function validateAuthoring(project, ledger, media) {
  if (Object.keys(project).some(k=>!PROJECT.has(k) && project[k]!=null))
    deny('unsupported project property');
  if ((project.transitions??[]).length || (project.effects??[]).length)
    deny('project transitions/effects require full parity');
  for(const lane of ledger.tracks) {
    const known=lane.lane==='overlay'?OVERLAY:lane.lane==='audio'?AUDIO:MAIN;
    const c=lane.authored;
    if(Object.keys(c).some(k=>!known.has(k) && c[k]!=null))
      deny('unsupported '+lane.lane+' clip edit');
    if (c.filter && typeof globalThis.fxRender !== 'function')
      deny('missing GPU color filter integration');
    if(c.ducking && c.ducking!==0)
      deny('voice ducking is not mixed yet');
    if(lane.lane==='overlay' &&
       (![c.x??.5,c.y??.5,c.scale??.35,c.opacity??1,
          c.zoom??1,c.px??.5,c.py??.5].every(Number.isFinite) ||
        (c.scale??.35)<=0 || (c.opacity??1)<0 || (c.opacity??1)>1))
      deny('invalid overlay transform');
    if (lane.lane==='main' && media[c.asset_id]?.kind!=='video')
      deny('main lane requires video');
  }
  for(const t of project.texts??[]) {
    if(typeof t.text!=='string')deny('caption must contain a text string');
  }
  if(!Array.isArray(project.clips)||!project.clips.length)
    deny('first multi-lane path requires a main video clip');
  if(!['original','9:16','1:1','4:5','16:9'].includes(project.format?.aspect??'original'))
    deny('unsupported aspect');
}

function imageFactoryDefault(url) {
  return new Promise((resolve,reject)=>{
    if(typeof Image!=='function')return reject(new Error('Image decoder unavailable.'));
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('Overlay image cannot be decoded.'));
    img.src=url;
    if(typeof img.decode==='function')img.decode().then(()=>resolve(img),()=>{});
  });
}
function asVisual(source,width,height) {
  if(!source || !(width>0 && height>0))
    throw new Error('Missing video/image frame in accelerated timeline.');
  // CanvasSink supplies HTMLCanvasElement/OffscreenCanvas, which drawImage
  // accepts directly. The existing compositor uses videoWidth/videoHeight.
  // This does NOT wrap in an object (which drawImage would reject).
  if(!Object.prototype.hasOwnProperty.call(source,'videoWidth'))
    Object.defineProperty(source,'videoWidth',{configurable:true,value:width});
  if(!Object.prototype.hasOwnProperty.call(source,'videoHeight'))
    Object.defineProperty(source,'videoHeight',{configurable:true,value:height});
  return source;
}
async function codecPlan(M,{width,height,hasAudio,platform}) {
  if(typeof M?.getFirstEncodableVideoCodec!=='function' ||
     typeof M?.canEncodeAudio!=='function')
    deny('WebCodecs capability checks unavailable');
  const best=await M.getFirstEncodableVideoCodec(['avc','vp9','vp8'],{width,height});
  if(!best) deny('no supported video codec');
  const aac=hasAudio?await M.canEncodeAudio('aac'):true;
  const avc=best==='avc' && aac;
  const codec=avc?'avc':best!=='avc'?best:
    await M.getFirstEncodableVideoCodec(['vp9','vp8'],{width,height});
  if(!codec)deny('video/audio codec pair not supported');
  const container=avc?'mp4':'webm';
  if(hasAudio && container==='webm' && !(await M.canEncodeAudio('opus')))
    deny('audio codec Opus unavailable');
  if(platform==='ios' && container!=='mp4')
    deny('iOS accelerated export requires H264/AAC MP4');
  return {videoCodec:codec,audioCodec:!hasAudio?null:
    container==='mp4'?'aac':'opus',container,hasAudio};
}

/**
 * Preflight occurs BEFORE opening a native random-file session. All used
 * sources, still overlays, the required WAV microphone and codec pair must
 * decode. Caller may reuse prepared objects for render, but only ONE render
 * may run per preparation. No remote libraries or network endpoints.
 */
export async function prepareAcceleratedMultitrack({
  project,media,M,platform='android',maxSeconds=ACCELERATED_MULTITRACK_MAX_SECONDS,
  imageFactory=imageFactoryDefault,isCancelled=()=>false,
  expectedAudio=null
}={}) {
  if(!M || typeof M.Input!=='function'||typeof M.UrlSource!=='function' ||
     typeof M.CanvasSink!=='function'||typeof M.AudioBufferSink!=='function')
    deny('Mediabunny offline multipista decoder unavailable');
  if(!['android','ios','qa'].includes(platform))deny('unsupported native platform');
  if(!(Number.isFinite(maxSeconds)&&maxSeconds>0&&
       maxSeconds<=ACCELERATED_MULTITRACK_MAX_SECONDS))
    deny('excessive render horizon');
  const ledger=analyzeAcceleratedMultitrackParity(project,media,{
    maxItems:ACCELERATED_MULTITRACK_MAX_ITEMS,maxTimelineSeconds:maxSeconds
  });
  if(!ledger.valid)deny(ledger.reason);
  validateAuthoring(project,ledger,media);
  const first=media[project.clips[0].asset_id];
  if(!(first?.w>0 && first?.h>0))deny('first video dimensions unavailable');
  const {w:width,h:height}=formatSize(project.format,first.w,first.h);
  if(width>3840||height>3840||width*height>3840*2160)
    deny('output video exceeds memory-safe dimensions');
  if(isCancelled())deny('cancelled');

  const used=new Map();
  try {
    for(const asset of ledger.assets) {
      if(isCancelled())deny('cancelled while preparing media');
      const entry={kind:asset.kind,url:asset.url};
      if(asset.kind==='image') {
        const image=await imageFactory(asset.url);
        const w=image?.naturalWidth??image?.width;
        const h=image?.naturalHeight??image?.height;
        entry.image=asVisual(image,w,h);
      } else {
        entry.input=new M.Input({source:new M.UrlSource(asset.url),formats:M.ALL_FORMATS});
        const [video,audio]=await Promise.all([
          entry.input.getPrimaryVideoTrack(),entry.input.getPrimaryAudioTrack()
        ]);
        entry.video=video;entry.audio=audio;
        if(asset.kind==='video' && !video)deny('source video track disappeared');
        if(asset.kind==='audio' && !audio)deny('independent microphone WAV not decodable');
        if(video){
          entry.canvas=new M.CanvasSink(video,{
            poolSize:1,width:Math.min(1920,Math.max(2,asset.width||width)),
            fit:'contain'
          });
        }
        if(audio)entry.audioSink=new M.AudioBufferSink(audio);
      }
      used.set(asset.assetId,entry);
    }
    const audible=[];
    for(const lane of ledger.tracks) {
      const c=lane.authored,source=used.get(lane.assetId);
      if(clipGain(c)<=0 || source.kind==='image')continue;
      if(lane.lane==='audio' && !source.audioSink)
        deny('independent microphone track missing');
      if(!source.audioSink)continue;
      audible.push({clip:c,buffers:(a,b)=>source.audioSink.buffers(a,b)});
    }
    if(expectedAudio!==null && Boolean(expectedAudio)!==Boolean(audible.length))
      deny('required timeline audio presence differs');
    if(audible.length>32)deny('too many simultaneous audio clips');
    const codec=await codecPlan(M,{
      width,height,hasAudio:audible.length>0,platform
    });
    return {ledger,project,media,M,used,audible,width,height,codec,
      totalSeconds:ledger.totalSeconds,platform};
  } catch(error) {
    for(const item of used.values()) {
      try{await item.input?.dispose?.();}catch{}
    }
    throw error;
  }
}

/** Actual output to arbitrary-offset native writer; never overrides v1. */
export async function renderAcceleratedMultitrack({
  prepared,writeAt,isCancelled=()=>false,fps=30,
  videoBitrate=null,audioBitrate=128000,
  sampleRate=48000,onProgress=()=>{}
}={}) {
  if(!prepared || !prepared.ledger?.valid || prepared.ledger.rendererReady!==false)
    deny('valid experimental preflight required');
  if(typeof writeAt!=='function')deny('native random file writer required');
  if(!Number.isSafeInteger(fps)||fps<12||fps>60)
    deny('frame rate outside bounded QA range');
  const {M,codec,project,media,used,audible,width,height,totalSeconds}=prepared;
  const framesTotal=Math.ceil(totalSeconds*fps);
  if(framesTotal>ACCELERATED_MULTITRACK_MAX_SECONDS*60+1)
    deny('frame limit');
  const writer=checkedRandomWrite(writeAt,{maxChunkBytes:1024*1024});
  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const g=canvas.getContext('2d');
  if(!g)deny('2D compositor unavailable');
  const format=codec.container==='mp4'?
    new M.Mp4OutputFormat({fastStart:false}):new M.WebMOutputFormat();
  const writable=new WritableStream({write:chunk=>writer.write(chunk.position,chunk.data)});
  const output=new M.Output({format,
    target:new M.StreamTarget(writable,{chunked:true,chunkSize:1<<20})});
  const videoSource=new M.CanvasSource(canvas,{codec:codec.videoCodec,
    bitrate:videoBitrate||exportBitrate(totalSeconds,{progressive:true,width,height,fps}),
    keyFrameInterval:1});
  output.addVideoTrack(videoSource,{frameRate:fps});
  const audioSource=codec.hasAudio?new M.AudioBufferSource({
    codec:codec.audioCodec,bitrate:audioBitrate}):null;
  if(audioSource)output.addAudioTrack(audioSource);
  const mixer=audioSource?mixAcceleratedAudioBlocks({
    tracks:audible,totalSeconds,sampleRate,
    blockFrames:sampleRate,channels:2,isCancelled
  })[Symbol.asyncIterator]():null;
  let videoFrames=0,audioBlocks=0,overlaysRendered=0;
  try {
    await output.start();
    for(let k=0;k<framesTotal;k++) {
      if(isCancelled())throw new Error('Accelerated multi-lane render cancelled.');
      const t=k/fps,dt=Math.min((k+1)/fps,totalSeconds)-t;
      if(dt<=0)continue;
      const main=project.clips.find(c=>t>=c.start&&t<c.start+clipLength(c));
      let frame=null;
      if(main){
        const asset=used.get(main.asset_id);
        const wrapped=await asset.canvas.getCanvas(srcTime(main,t));
        const surface=wrapped?.canvas;
        if(!surface)throw new Error('Missing decoded main video at timeline '+t);
        frame=asVisual(surface,surface.width,surface.height);
      }
      const overlays=[];
      for(const c of [...(project.overlayClips??[])].sort(
        (a,b)=>(a.track??0)-(b.track??0)||a.start-b.start)) {
        if(!(t>=c.start&&t<c.start+clipLength(c)))continue;
        const source=used.get(c.asset_id);
        let visual=source.image;
        if(!visual){
          const wrapped=await source.canvas.getCanvas(srcTime(c,t));
          const raw=wrapped?.canvas;
          if(!raw)throw new Error('Missing decoded overlay at timeline '+t);
          visual=asVisual(raw,raw.width,raw.height);
        }
        overlays.push({el:visual,c});
        overlaysRendered++;
      }
      // Reuse EXACT stable compositor for formatting, positions, shapes,
      // titles, fades and opacity, not a second visual semantics implementation.
      drawFrame(g,width,height,frame,project,t,overlays);
      await videoSource.add(t,dt);
      videoFrames++;
      if(mixer&&((k+1)%fps===0||k===framesTotal-1)) {
        const next=await mixer.next();
        if(next.done)throw new Error('Native audio mix ended before video.');
        await audioSource.add(next.value.buffer);
        audioBlocks++;
      }
      if(k%fps===0)onProgress({t,total:totalSeconds,pct:t/totalSeconds});
    }
    if(mixer && !(await mixer.next()).done)
      throw new Error('Audio mix duration exceeds rendered video.');
    if(isCancelled())throw new Error('Accelerated multi-lane render cancelled.');
    await output.finalize();
    return {engine:'webcodecs-mediabunny-multitrack-experimental',
      rendererVersion:ACCELERATED_MULTITRACK_RENDERER_VERSION,
      videoCodec:codec.videoCodec,audioCodec:codec.audioCodec,
      container:codec.container,width,height,
      durationSeconds:totalSeconds,videoFrames,audioBlocks,overlaysRendered,
      writes:writer.writes,outputBytes:writer.highWaterBytes,
      verifiedOnDevice:false,rendererReadyForProduction:false};
  } finally {
    for(const item of used.values()){
      try{await item.input?.dispose?.();}catch{}
    }
  }
}
