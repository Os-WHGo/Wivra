// Wivra P0-W9: real, *isolated* WebCodecs+Mediabunny multi-lane renderer.
// This is deliberately NOT the default export engine. It consumes the exact
// same drawFrame implementation as the stable exporter, including captions,
// video overlays, image overlays, crop, shapes and fade transforms. Decoding
// each frame by timestamp avoids cumulative seeking/MediaRecorder clock drift.
// This still runs only in explicit QA, bounded to 180 s / 160 items / <=60 fps.
// A 3-minute synthetic test is not a 30/60-minute or iPhone hardware proof.
import {clipLength,srcTime} from '../core/project.mjs';
import {drawFrame,formatSize,exportBitrate,clipGain,SHAPE_NAMES} from './export.mjs';
import {analyzeAcceleratedMultitrackParity} from './accelerated-multitrack-parity.mjs';
import {checkedRandomWrite} from './accelerated-cut-renderer.mjs';
import {mixAcceleratedAudioBlocks} from './accelerated-audio-mixer.mjs';

export const ACCELERATED_MULTITRACK_RENDERER_VERSION = 1;
export const ACCELERATED_MULTITRACK_MAX_SECONDS = 180;
export const ACCELERATED_MULTITRACK_LONG_QA_MAX_SECONDS = 3600;
export const ACCELERATED_MULTITRACK_MAX_ITEMS = 160;

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
    // Unknown enum values otherwise fall through the preview compositor
    // as no effect/rectangular crop. Export must preserve edits or reject.
    for(const key of ['fxIn','fxOut'])
      if(c[key]!=null && !['none','fade','slide','zoom'].includes(c[key]))
        deny('unsupported clip transition');
    if(c.fxDur!=null && (!Number.isFinite(c.fxDur) || c.fxDur<=0))
      deny('invalid clip transition duration');
    if(lane.lane==='audio' && (c.filter ||
       [c.fxIn,c.fxOut].some(v=>v!=null && v!=='none')))
      deny('visual effects on independent audio require parity');
    if(lane.lane==='overlay' && c.shape!=null &&
       !Object.hasOwn(SHAPE_NAMES,c.shape))
      deny('unsupported overlay shape');
    if (c.filter && typeof globalThis.fxRender !== 'function')
      deny('missing GPU color filter integration');
    if(c.ducking !== undefined &&
       (lane.lane!=='audio' || !['voice_primary','voice_guest'].includes(c.role) ||
        typeof c.ducking!=='number' || !Number.isFinite(c.ducking) ||
        c.ducking<0 || c.ducking>1))
      deny('invalid or unsupported voice ducking');
    if(lane.lane==='overlay' &&
       (![c.x??.5,c.y??.5,c.scale??.35,c.opacity??1,
          c.zoom??1,c.px??.5,c.py??.5].every(Number.isFinite) ||
        (c.scale??.35)<=0 || (c.opacity??1)<0 || (c.opacity??1)>1))
      deny('invalid overlay transform');
    if (lane.lane==='main' && !['video','image'].includes(media[c.asset_id]?.kind))
      deny('main lane requires video or still image');
    if (media[c.asset_id]?.kind==='image' &&
        (Boolean(media[c.asset_id].gif) || media[c.asset_id].animated===true ||
         /^image\/gif(?:;|$)/i.test(media[c.asset_id].mime||'')))
      deny('animated GIF source requires frame-accurate decoder');
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
  // Native iPhone has no general WebM Photos destination. Reject its
  // container before probing Opus so the actionable platform restriction is
  // never obscured by an unrelated codec capability error.
  if(platform==='ios' && container!=='mp4')
    deny('iOS accelerated export requires H264/AAC MP4');
  if(hasAudio && container==='webm' && !(await M.canEncodeAudio('opus')))
    deny('audio codec Opus unavailable');
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
  expectedAudio=null,longSoakQA=false
}={}) {
  if(!M || typeof M.Input!=='function'||typeof M.UrlSource!=='function' ||
     typeof M.CanvasSink!=='function'||typeof M.AudioBufferSink!=='function')
    deny('Mediabunny offline multipista decoder unavailable');
  if(!['android','ios','qa'].includes(platform))deny('unsupported native platform');
  if(typeof longSoakQA!=='boolean'||(longSoakQA&&platform!=='qa'))
    deny('long-form QA is forbidden on native devices');
  const horizon=longSoakQA?ACCELERATED_MULTITRACK_LONG_QA_MAX_SECONDS:
    ACCELERATED_MULTITRACK_MAX_SECONDS;
  if(!(Number.isSafeInteger(maxSeconds)&&maxSeconds>0&&maxSeconds<=horizon))
    deny('excessive render horizon');
  const ledger=analyzeAcceleratedMultitrackParity(project,media,{
    maxItems:ACCELERATED_MULTITRACK_MAX_ITEMS,maxTimelineSeconds:maxSeconds
  });
  if(!ledger.valid)deny(ledger.reason);
  validateAuthoring(project,ledger,media);
  // A voice marked principal/guest is essential narration. The stable
  // exporter rejects silently clipped final words; accelerator must too.
  if(ledger.tracks.some(lane=>lane.lane==='audio' &&
      ['voice_primary','voice_guest'].includes(lane.authored.role) &&
      lane.end > ledger.totalSeconds + .05))
    deny('essential voice extends beyond final video');
  if(ledger.needsParity.textsBeyondEnd)
    deny('authored captions continue beyond final picture');
  // Match the stable exporter's aspect-source rule: use the first main
  // VIDEO, only falling back to a still photo when there is no video.
  const firstVideo=project.clips.find(c=>media[c.asset_id]?.kind==='video');
  const first=media[(firstVideo??project.clips[0]).asset_id];
  if(!(first?.w>0 && first?.h>0))deny('main video/image dimensions unavailable');
  const {w:width,h:height}=formatSize(project.format,first.w,first.h);
  if(width>3840||height>3840||width*height>3840*2160)
    deny('output video exceeds memory-safe dimensions');
  if(isCancelled())deny('cancelled');

  const used=new Map();
  try {
    for(const asset of ledger.assets) {
      if(isCancelled())deny('cancelled while preparing media');
      const entry={kind:asset.kind,url:asset.url};
      // Register ownership BEFORE any awaited decoder/track probe; a thrown
      // getPrimary* call must still dispose the Input it already created.
      used.set(asset.assetId,entry);
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
        // A canvas can return its last decoded picture when asked for a time
        // after EOF. Do not mistake frozen frames (or missing final syllables)
        // for a valid complete export. Prefer the actual decoder track duration
        // over untrusted metadata saved in the project.
        const relevant=ledger.tracks.filter(l=>l.assetId===asset.assetId);
        const latestSourceOut=Math.max(...relevant.map(l=>l.sourceOut));
        const earliestSourceIn=Math.min(...relevant.map(l=>l.sourceIn));
        const checkedTrack=asset.kind==='audio'?audio:video;
        let actualDuration=Number(asset.duration);
        if(typeof checkedTrack?.computeDuration==='function'){
          actualDuration=await checkedTrack.computeDuration();
        }
        if(!Number.isFinite(actualDuration)||actualDuration<=0 ||
           latestSourceOut>actualDuration+.08)
          deny('decoded source media shorter than selected timeline trim');
        if(typeof checkedTrack?.getFirstTimestamp==='function'){
          const firstTimestamp=await checkedTrack.getFirstTimestamp();
          if(!Number.isFinite(firstTimestamp)||
             earliestSourceIn<firstTimestamp-.08)
            deny('source trim begins before first decodable sample');
        }
        if(video){
          entry.canvasOptions={poolSize:1,
            width:Math.min(1920,Math.max(2,asset.width||width)),fit:'contain'};
          entry.canvas=new M.CanvasSink(video,entry.canvasOptions);
          entry.visualSinks=[entry.canvas];
        }
        if(audio)entry.audioSink=new M.AudioBufferSink(audio);
      }
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
      totalSeconds:ledger.totalSeconds,platform,longSoakQA};
  } catch(error) {
    for(const item of used.values()) {
      try{await item.input?.dispose?.();}catch{}
    }
    throw error;
  }
}

/** Actual output to arbitrary-offset native writer; never overrides v1. */
export async function renderAcceleratedMultitrack(options={}) {
  try {
    return await renderPreparedMultitrack(options);
  } finally {
    // Preparation transfers ownership to this single render, including when
    // FPS validation, canvas allocation or encoder setup fails before start().
    for(const item of options.prepared?.used?.values?.()??[]){
      try{await item.input?.dispose?.();}catch{}
    }
  }
}
async function renderPreparedMultitrack({
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
  const maxFrames=(prepared.longSoakQA&&prepared.platform==='qa'
    ?ACCELERATED_MULTITRACK_LONG_QA_MAX_SECONDS
    :ACCELERATED_MULTITRACK_MAX_SECONDS)*60+1;
  if(framesTotal>maxFrames)deny('frame limit');
  const writer=checkedRandomWrite(writeAt,{maxChunkBytes:1024*1024});
  let output,finalized=false;
  try {
    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    const g=canvas.getContext('2d');
    if(!g)deny('2D compositor unavailable');
    // The stable drawFrame intentionally swallows drawImage failures during
    // interactive preview. An export MUST NOT silently omit a principal video
    // frame or a requested overlay. Count successful draws and caught failures.
    let draws=0,failedDraws=0;
    const guardedG=new Proxy(g,{
      get(target,property) {
        if(property==='drawImage') return (...args)=>{
          try {
            target.drawImage(...args);
            draws++;
          } catch(error) {
            failedDraws++;
            throw error;
          }
        };
        const value=Reflect.get(target,property,target);
        return typeof value==='function'?value.bind(target):value;
      },
      set(target,property,value) {
        return Reflect.set(target,property,value,target);
      }
    });
    const format=codec.container==='mp4'?
      new M.Mp4OutputFormat({fastStart:false}):new M.WebMOutputFormat();
    const writable=new WritableStream({write:chunk=>writer.write(chunk.position,chunk.data)});
    output=new M.Output({format,
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
    // Sort the same authored lanes ONCE, not once per encoded frame.
    // The original compositor still receives the unchanged project and applies
    // its existing filters, captions and fades. Only source lookup is indexed.
    const mainTimeline=[...project.clips].sort((a,b)=>a.start-b.start);
    const overlayTimeline=[...(project.overlayClips??[])].sort(
      (a,b)=>(a.track??0)-(b.track??0)||a.start-b.start);
    let mainIndex=0;
    let videoFrames=0,audioBlocks=0,overlaysRendered=0;
    await output.start();
    for(let k=0;k<framesTotal;k++) {
      if(isCancelled())throw new Error('Accelerated multi-lane render cancelled.');
      const t=k/fps,dt=Math.min((k+1)/fps,totalSeconds)-t;
      if(dt<=0)continue;
      while(mainIndex<mainTimeline.length &&
            t>=mainTimeline[mainIndex].start+clipLength(mainTimeline[mainIndex]))
        mainIndex++;
      const candidate=mainTimeline[mainIndex];
      const main=candidate && t>=candidate.start &&
        t<candidate.start+clipLength(candidate) ? candidate : null;
      // A poolSize:1 CanvasSink reuses its canvas. Each simultaneous layer
      // needs a distinct sink, even when several clips reference one asset
      // at different source times. Reuse slots across frames/sequential cuts
      // rather than retaining one decoder canvas for every authored clip.
      const visualSlots=new Map();
      const videoFrame=async(asset,time)=>{
        const slot=visualSlots.get(asset)??0;
        visualSlots.set(asset,slot+1);
        if(!asset.visualSinks[slot])
          asset.visualSinks[slot]=new M.CanvasSink(asset.video,asset.canvasOptions);
        return asset.visualSinks[slot].getCanvas(time);
      };
      let frame=null;
      if(main){
        const asset=used.get(main.asset_id);
        if(asset.kind==='image'){
          frame=asset.image;
          if(!frame)throw new Error('Missing decoded main still image at timeline '+t);
        }else{
          const wrapped=await videoFrame(asset,srcTime(main,t));
          const surface=wrapped?.canvas;
          if(!surface)throw new Error('Missing decoded main video at timeline '+t);
          frame=asVisual(surface,surface.width,surface.height);
        }
      }
      const overlays=[];
      for(const c of overlayTimeline) {
        if(!(t>=c.start&&t<c.start+clipLength(c)))continue;
        const source=used.get(c.asset_id);
        let visual=source.image;
        if(!visual){
          const wrapped=await videoFrame(source,srcTime(c,t));
          const raw=wrapped?.canvas;
          if(!raw)throw new Error('Missing decoded overlay at timeline '+t);
          visual=asVisual(raw,raw.width,raw.height);
        }
        overlays.push({el:visual,c});
        overlaysRendered++;
      }
      // Reuse EXACT stable compositor for formatting, positions, shapes,
      // titles, fades and opacity, not a second visual semantics implementation.
      const priorDraws=draws,priorFailures=failedDraws;
      // The stable preview intentionally returns the ORIGINAL frame if its
      // WebGL filter fails. In accelerated export this is data loss: a film
      // must not silently lose the user's color edits on GPU context loss.
      const requiredFilters=(main?.filter?1:0)+
        overlays.reduce((n,o)=>n+(o.c.filter?1:0),0);
      const originalFilter=globalThis.fxRender;
      let renderedFilters=0;
      if(requiredFilters){
        if(typeof originalFilter!=='function')
          throw new Error('GPU color filters unavailable for accelerated export.');
        globalThis.fxRender=(...args)=>{
          const filtered=originalFilter(...args);
          if(!filtered)throw new Error('GPU filter failed: use the stable exporter.');
          renderedFilters++;
          return filtered;
        };
      }
      try{
        drawFrame(guardedG,width,height,frame,project,t,overlays);
      }finally{
        if(requiredFilters)globalThis.fxRender=originalFilter;
      }
      if(renderedFilters!==requiredFilters || failedDraws!==priorFailures ||
         draws-priorDraws < (frame?1:0)+overlays.length)
        throw new Error('A source frame, filter or overlay could not be painted safely.');
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
    finalized=true;
    return {engine:'webcodecs-mediabunny-multitrack-experimental',
      rendererVersion:ACCELERATED_MULTITRACK_RENDERER_VERSION,
      videoCodec:codec.videoCodec,audioCodec:codec.audioCodec,
      container:codec.container,width,height,
      durationSeconds:totalSeconds,videoFrames,audioBlocks,overlaysRendered,
      writes:writer.writes,outputBytes:writer.highWaterBytes,
      verifiedOnDevice:false,rendererReadyForProduction:false};
  } finally {
    // Aborting the native partial is not enough: free active encoders and
    // release StreamTarget's writer even when a renderer/decoder fails.
    if(!finalized && typeof output?.cancel==='function'){
      try{await output.cancel();}catch{}
    }
  }
}
