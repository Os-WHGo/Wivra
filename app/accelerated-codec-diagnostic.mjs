import { mobileCodecConfig } from './accelerated-native-codec-probe.mjs';
import { acceleratedRuntimeIdentity } from './accelerated-runtime-identity.mjs';
import { createBoundedRandomMemoryWriter } from './accelerated-memory-export.mjs';
import { inspectExport } from './media-container.mjs';

// Synthetic, explicit QA only. This does not read a project, call native storage,
// grant a production capability or cache approval across contexts/configurations.
const codecDiagnosticByteLimit = 8 * 1024 * 1024;
let codecDiagnosticRunning = false;
const codecDiagnosticError = code => Object.assign(new Error(code), {diagnosticCode:code});
const codecDiagnosticCodes=new Set(['invalid-container','diagnostic-busy','cancelled','timeout',
  'invalid-configuration','api-unavailable','codec-unsupported','codec-config-mismatch',
  'resource-limit','encode-error','mux-error','decode-error','playback-error']);
export function validateDiagnosticMp4(bytes, seconds = 1) {
  if(!(bytes instanceof Uint8Array)||bytes.length<1000||bytes.length>codecDiagnosticByteLimit||
      !Number.isFinite(seconds)||seconds<=0)throw codecDiagnosticError('invalid-container');
  let info;
  try { info = inspectExport(bytes); } catch { throw codecDiagnosticError('invalid-container'); }
  if (bytes.length < 1000 || bytes.length > codecDiagnosticByteLimit ||
      info.container !== 'mp4' || !info.video || !info.audio ||
      !info.declaresDuration || !info.seekIndex ||
      !Number.isFinite(info.durationMs) || Math.abs(info.durationMs / 1000 - seconds) > 0.12)
    throw codecDiagnosticError('invalid-container');
  return {bytes:bytes.length, durationMs:Math.round(info.durationMs),
    container:'mp4', video:true, audio:true, seekIndex:true};
}

export async function runAcceleratedCodecDiagnostic({M, width=320, height=240, fps=30,
  isCancelled=()=>false, timeoutMs=20000, onStage=()=>{}}={}) {
  const nav = globalThis.navigator;
  const report = {schemaVersion:1, synthetic:true,secureContext:globalThis.isSecureContext===true,
    runtime:acceleratedRuntimeIdentity({userAgent:nav?.userAgent,platform:nav?.platform,
      maxTouchPoints:nav?.maxTouchPoints,
      androidBridge:typeof globalThis.WivraAcceleratedExportNative?.postMessage==='function',
      iosBridge:typeof globalThis.webkit?.messageHandlers?.wivraAcceleratedExport?.postMessage==='function'}),
    productionEligible:false, physicalDeviceVerified:false, outcome:'failed', stages:[],
    limits:{seconds:1,outputBytes:codecDiagnosticByteLimit,queuedVideoFrames:4,
      totalProcessMemoryMeasured:false}};
  if (codecDiagnosticRunning) return {...report,code:'diagnostic-busy',failedStage:'environment'};
  codecDiagnosticRunning = true;
  let stage='environment', stopped=false, asynchronousError=null;
  let videoEncoder, audioEncoder, output, input, canvas, video, objectUrl;
  let finalized=false, encodedBytes=0;
  const removePlaybackListeners=[];
  const packets={video:[],audio:[]};
  const start=Date.now();
  const deadline=start+(Number.isInteger(timeoutMs)&&timeoutMs>=100&&timeoutMs<=60000?timeoutMs:20000);
  const check=()=>{
    if (stopped || isCancelled()) throw codecDiagnosticError('cancelled');
    if (Date.now()>=deadline) throw codecDiagnosticError('timeout');
    if (asynchronousError) throw asynchronousError;
  };
  // Poll cancellation even while a platform codec / playback promise hangs.
  const wait=async promise=>{
    check(); let timer;
    const interrupted=new Promise((_,reject)=>{
      timer=setInterval(()=>{try{check();}catch(error){reject(error);}},20);
    });
    try {const value=await Promise.race([promise,interrupted]);check();return value;}
    finally {clearInterval(timer);}
  };
  const passed=details=>{
    check(); report.stages.push({stage,status:'passed',...details});
    try {onStage(stage);} catch { /* advisory UI cannot certify or break codecs */ }
  };
  try {
    check();
    if (!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<160||height<160||
        width%2||height%2||Math.max(width,height)>1920||width*height>1920*1080||
        ![24,25,30,50,60].includes(fps)) throw codecDiagnosticError('invalid-configuration');
    report.configuration=mobileCodecConfig({codec:{container:'mp4',videoCodec:'avc',
      audioCodec:'aac',hasAudio:true},width,height,fps,sampleRate:48000});
    const config=report.configuration;
    report.limits.canvasSurfaceBytes=width*height*4;
    if (!M?.EncodedPacket || !M?.Output || typeof document==='undefined' ||
        typeof VideoEncoder!=='function'||typeof AudioEncoder!=='function'||
        typeof VideoFrame!=='function'||typeof AudioData!=='function')
      throw codecDiagnosticError('api-unavailable');
    passed(); stage='exact-support';
    report.codecSupport={video:'unchecked',audio:'unchecked'};
    const exact=async (kind,Encoder,requested,keys)=>{
      let support;
      try { support=await wait(Encoder.isConfigSupported(requested)); }
      catch(error) {if(error.diagnosticCode)throw error;report.codecSupport[kind]='unsupported';throw codecDiagnosticError('codec-unsupported');}
      if (support?.supported!==true) {report.codecSupport[kind]='unsupported';throw codecDiagnosticError('codec-unsupported');}
      if (!keys.every(k=>support.config?.[k]===requested[k]) ||
          requested.avc && support.config?.avc?.format!=='avc')
        {report.codecSupport[kind]='configuration-mismatch';throw codecDiagnosticError('codec-config-mismatch');}
      report.codecSupport[kind]='exact-configuration-supported';
    };
    const supports=await Promise.allSettled([
      exact('video',VideoEncoder,config.video,['codec','width','height','framerate','bitrate']),
      exact('audio',AudioEncoder,config.audio,['codec','sampleRate','numberOfChannels','bitrate'])]);
    const rejected=supports.filter(r=>r.status==='rejected');
    if(rejected.length)throw (rejected.find(r=>['cancelled','timeout'].includes(r.reason?.diagnosticCode))||rejected[0]).reason;
    passed(); stage='encode';
    const collect=kind=>(chunk,metadata)=>{
      if(stopped)return;
      try {
        check(); encodedBytes+=chunk.byteLength;
        if(encodedBytes>codecDiagnosticByteLimit || packets[kind].length>=128)
          throw codecDiagnosticError('resource-limit');
        packets[kind].push({packet:M.EncodedPacket.fromEncodedChunk(chunk),metadata});
      } catch(error) {asynchronousError=error.diagnosticCode?error:codecDiagnosticError('encode-error');}
    };
    const codecError=()=>{asynchronousError=codecDiagnosticError('encode-error');};
    videoEncoder=new VideoEncoder({output:collect('video'),error:codecError});
    audioEncoder=new AudioEncoder({output:collect('audio'),error:codecError});
    videoEncoder.configure(config.video); audioEncoder.configure(config.audio);
    canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');
    if(!ctx)throw codecDiagnosticError('resource-limit');
    // Respect queue backpressure without repeated flushes: some AAC encoders
    // insert priming/padding when drained. Flush each stream only once at EOF.
    const queueRoom=async encoder=>{
      while(encoder.encodeQueueSize>=4)await wait(new Promise(resolve=>setTimeout(resolve,5)));
    };
    for(let i=0;i<fps;i++){
      await queueRoom(videoEncoder);
      check();ctx.fillStyle=i<fps/2?'#e02020':'#2020e0';ctx.fillRect(0,0,width,height);
      const timestamp=Math.round(i*1e6/fps),duration=Math.round((i+1)*1e6/fps)-timestamp;
      const frame=new VideoFrame(canvas,{timestamp,duration});
      try{videoEncoder.encode(frame,{keyFrame:i===0});}finally{frame.close();}
    }
    await wait(videoEncoder.flush());
    for(let offset=0;offset<48000;offset+=1024){
      await queueRoom(audioEncoder);
      check();const frames=Math.min(1024,48000-offset),data=new Float32Array(frames*2);
      for(let channel=0;channel<2;channel++)for(let j=0;j<frames;j++)
        data[channel*frames+j]=0.15*Math.sin(2*Math.PI*(channel?880:440)*(offset+j)/48000);
      const audio=new AudioData({format:'f32-planar',sampleRate:48000,numberOfFrames:frames,
        numberOfChannels:2,timestamp:Math.round(offset*1e6/48000),data});
      try{audioEncoder.encode(audio);}finally{audio.close();}
    }
    await wait(audioEncoder.flush());
    if(packets.video.length!==fps||!packets.audio.length||
        !packets.video.some(p=>p.metadata?.decoderConfig)||!packets.audio.some(p=>p.metadata?.decoderConfig))
      throw codecDiagnosticError('encode-error');
    videoEncoder.close();audioEncoder.close();
    passed({videoPackets:packets.video.length,audioPackets:packets.audio.length,encodedBytes});stage='mux';
    const writer=createBoundedRandomMemoryWriter({maximumBytes:codecDiagnosticByteLimit});
    output=new M.Output({format:new M.Mp4OutputFormat({fastStart:false}),
      target:new M.StreamTarget(new WritableStream({write:chunk=>{
        check();return writer.writeAt(chunk.position,chunk.data);
      }}),{chunked:true,chunkSize:65536})});
    const vs=new M.EncodedVideoPacketSource('avc'),as=new M.EncodedAudioPacketSource('aac');
    output.addVideoTrack(vs,{frameRate:fps});output.addAudioTrack(as);
    await wait(output.start());
    // Interleave stream heads without sorting a track by presentation time:
    // hardware AVC may emit B-frames, whose decode order must be preserved.
    let vi=0,ai=0;
    while(vi<packets.video.length||ai<packets.audio.length){
      const takeVideo=ai>=packets.audio.length || vi<packets.video.length &&
        packets.video[vi].packet.timestamp<=packets.audio[ai].packet.timestamp;
      const p=takeVideo?packets.video[vi++]:packets.audio[ai++];
      await wait((takeVideo?vs:as).add(p.packet,p.metadata));
    }
    vs.close();as.close();await wait(output.finalize());finalized=true;
    const bytes=writer.finalize();passed({bytes:bytes.length});stage='container';
    passed(validateDiagnosticMp4(bytes));stage='decode';
    input=new M.Input({source:new M.BufferSource(bytes),formats:M.ALL_FORMATS});
    const tracks=await wait(input.getTracks());
    const vt=tracks.find(t=>t.type==='video'),at=tracks.find(t=>t.type==='audio');
    if(tracks.length!==2||vt?.codec!=='avc'||at?.codec!=='aac'||
        await wait(vt.getDisplayWidth())!==width||await wait(vt.getDisplayHeight())!==height||
        await wait(at.getSampleRate())!==48000||await wait(at.getNumberOfChannels())!==2)
      throw codecDiagnosticError('decode-error');
    const videoDuration=await wait(vt.computeDuration()),audioDuration=await wait(at.computeDuration());
    if(!Number.isFinite(videoDuration)||!Number.isFinite(audioDuration)||
        Math.abs(videoDuration-1)>0.05||Math.abs(audioDuration-1)>0.08||
        Math.abs(videoDuration-audioDuration)>0.08)throw codecDiagnosticError('decode-error');
    const videoConfig=await wait(vt.getDecoderConfig()),audioConfig=await wait(at.getDecoderConfig());
    // Report only standardized codec strings, never arbitrary implementation messages.
    if(typeof videoConfig?.codec!=='string'||
        videoConfig.codec.toLowerCase()!==config.video.codec.toLowerCase()||audioConfig?.codec!=='mp4a.40.2')
      throw codecDiagnosticError('codec-config-mismatch');
    const sink=new M.CanvasSink(vt,{poolSize:1});
    for(const [time,red] of [[0.2,true],[0.8,false]]){
      const sample=await wait(sink.getCanvas(time));
      if(!sample)throw codecDiagnosticError('decode-error');
      const pixel=sample.canvas.getContext('2d').getImageData(Math.floor(width/2),Math.floor(height/2),1,1).data;
      if(red?pixel[0]<100||pixel[0]<pixel[2]*2:pixel[2]<100||pixel[2]<pixel[0]*2)
        throw codecDiagnosticError('decode-error');
    }
    const energy=[0,0],count=[0,0],tone=[[0,0],[0,0]];
    const audioBuffers=new M.AudioBufferSink(at).buffers(0,1)[Symbol.asyncIterator]();
    for(;;){
      const next=await wait(audioBuffers.next());if(next.done)break;
      const item=next.value;
      check();const b=item.buffer;
      for(let c=0;c<2;c++){
        const pcm=b.getChannelData(c),f=c?880:440;
        for(let j=0;j<pcm.length;j++){
          const t=item.timestamp+j/b.sampleRate;
          if(t<0.1||t>0.9)continue;
          energy[c]+=pcm[j]*pcm[j];count[c]++;
          tone[c][0]+=pcm[j]*Math.sin(2*Math.PI*f*t);tone[c][1]+=pcm[j]*Math.cos(2*Math.PI*f*t);
        }
      }
    }
    const rms=energy.map((e,c)=>Math.sqrt(e/count[c]));
    const amplitude=tone.map((v,c)=>2*Math.hypot(...v)/count[c]);
    if(count.some(n=>n<30000)||rms.some(n=>!Number.isFinite(n)||n<0.03)||
        amplitude.some(n=>!Number.isFinite(n)||n<0.05))throw codecDiagnosticError('decode-error');
    passed({videoCodec:videoConfig.codec,audioCodec:audioConfig.codec,
      videoMarkers:2,audioRms:rms.map(n=>+n.toFixed(4)),audioTones:amplitude.map(n=>+n.toFixed(4))});
    stage='playback';
    video=document.createElement('video');video.muted=true;video.playsInline=true;video.preload='auto';
    objectUrl=URL.createObjectURL(new Blob([bytes],{type:'video/mp4'}));
    const event=name=>new Promise((resolve,reject)=>{
      const ok=()=>{cleanup();resolve();},bad=()=>{cleanup();reject(codecDiagnosticError('playback-error'));};
      const cleanup=()=>{video.removeEventListener(name,ok);video.removeEventListener('error',bad);};
      removePlaybackListeners.push(cleanup);
      video.addEventListener(name,ok,{once:true});video.addEventListener('error',bad,{once:true});
    });
    const metadata=event('loadeddata');video.src=objectUrl;video.load();await wait(metadata);
    if(!Number.isFinite(video.duration)||Math.abs(video.duration-1)>0.12||
        video.videoWidth!==width||video.videoHeight!==height)throw codecDiagnosticError('playback-error');
    const seeked=event('seeked');video.currentTime=0.65;await wait(seeked);
    await wait(video.play());
    await wait(new Promise(resolve=>setTimeout(resolve,100)));
    if(video.paused||video.currentTime<0.68)throw codecDiagnosticError('playback-error');
    passed({seek:true,mutedPlayback:true,audibleOutputVerified:false});
    report.outcome='passed';
  }catch(error){
    report.code=codecDiagnosticCodes.has(error?.diagnosticCode)?error.diagnosticCode:({environment:'api-unavailable','exact-support':'codec-unsupported',
      encode:'encode-error',mux:'mux-error',container:'invalid-container',decode:'decode-error',playback:'playback-error'}[stage]);
    report.outcome=report.code==='cancelled'?'cancelled':'failed';report.failedStage=stage;
    report.stages.push({stage,status:report.outcome,code:report.code});
  }finally{
    stopped=true;
    for(const encoder of [videoEncoder,audioEncoder])try{if(encoder?.state!=='closed')encoder?.close();}catch{}
    if(!finalized && output){let cleanupTimer;
      try{await Promise.race([Promise.resolve(output.cancel()).catch(()=>{}),
        new Promise(resolve=>{cleanupTimer=setTimeout(resolve,250);})]);}catch{}
      finally{clearTimeout(cleanupTimer);}
    }
    try{input?.dispose();}catch{}
    for(const remove of removePlaybackListeners)try{remove();}catch{}
    try{if(video){video.pause();video.removeAttribute('src');video.load();video.remove();}}catch{}
    try{if(objectUrl)URL.revokeObjectURL(objectUrl);}catch{}
    try{if(canvas){canvas.width=0;canvas.height=0;}}catch{}
    packets.video.length=0;packets.audio.length=0;codecDiagnosticRunning=false;
  }
  report.elapsedMs=Date.now()-start;
  return report;
}
