import {prepareAcceleratedMultitrack,renderAcceleratedMultitrack}
  from './accelerated-multitrack-renderer.mjs';
import {createAcceleratedNativeSink} from './accelerated-native-sink.mjs';
import {exportEstimatedBytes} from './export.mjs';

// The experimental v2 transport is NEVER selected by the production export
// engine. The caller must explicitly request this QA path, and the stable
// MediaRecorder path is untouched. Native file is not opened until ALL assets,
// tracks, image overlays and codec capabilities are proven available.
export async function recordExperimentalNativeMultitrack({
  project,media,M,host,expectAudio,experimentalAccelerated=false,
  isCancelled=()=>false,onProgress=()=>{},imageFactory,
  fps=30,sampleRate=48000,estimatedBytes
}={}) {
  if(experimentalAccelerated!==true)
    throw new Error('La exportación multipista nativa requiere modo experimental explícito.');
  if(typeof expectAudio!=='boolean')
    throw new Error('La presencia de audio multipista debe declararse explícitamente.');
  if(!host || !['android','ios'].includes(host.platform) ||
     typeof host.request!=='function' ||typeof host.sendWriteAt!=='function')
    throw new Error('El puente nativo multipista v2 no está disponible.');
  if(typeof isCancelled!=='function'||typeof onProgress!=='function')
    throw new Error('Los controles de exportación multipista no son válidos.');
  if(!Number.isSafeInteger(fps)||fps<12||fps>60 ||
     !Number.isSafeInteger(sampleRate)||sampleRate<8000||sampleRate>96000)
    throw new Error('Frecuencia de video/audio acelerado inválida.');
  if(isCancelled())throw new Error('Exportación multipista cancelada antes de comenzar.');

  const prepared=await prepareAcceleratedMultitrack({
    project,media,M,platform:host.platform,expectedAudio:expectAudio,
    isCancelled,...(imageFactory?{imageFactory}:{})
  });
  const expectedBytes=estimatedBytes??exportEstimatedBytes(
    prepared.totalSeconds,{progressive:true,width:prepared.width,
      height:prepared.height,fps});
  let sink,startedRender=false;
  try {
    if(!Number.isSafeInteger(expectedBytes)||expectedBytes<0)
      throw new Error('Tamaño estimado de salida fuera de límites.');
    if(isCancelled())throw new Error('Exportación multipista cancelada antes de abrir archivo.');
    sink=createAcceleratedNativeSink(host,{
      mime:prepared.codec.container==='mp4'?'video/mp4':'video/webm',
      expectedDurationMs:Math.round(prepared.totalSeconds*1000),
      expectAudio,estimatedBytes:expectedBytes
    });
    await sink.begin();
    startedRender=true;
    const stats=await renderAcceleratedMultitrack({prepared,
      fps,sampleRate,isCancelled,onProgress,
      writeAt:(position,bytes)=>sink.writeAt(position,bytes)});
    if(stats.container!==prepared.codec.container ||
       stats.audioCodec!==prepared.codec.audioCodec ||
       stats.videoCodec!==prepared.codec.videoCodec ||
       stats.outputBytes!==sink.maxEnd||stats.writes<=0)
      throw new Error('La mezcla multipista no coincide con el contenedor validado.');
    if(isCancelled())throw new Error('Exportación multipista cancelada antes de verificar.');
    const saved=await sink.finish();
    if(saved.verified!==true||saved.bytes!==stats.outputBytes)
      throw new Error('El archivo multipista nativo no se pudo verificar.');
    onProgress({t:prepared.totalSeconds,total:prepared.totalSeconds,pct:1});
    return {experimental:true,verifiedNative:true,verifiedOnDevice:false,
      rendererReadyForProduction:false,
      mime:prepared.codec.container==='mp4'?'video/mp4':'video/webm',
      saved,render:stats};
  }catch(error){
    if(sink) {
      try{await sink.abort();}catch{}
    }
    throw error;
  } finally {
    // renderAcceleratedMultitrack releases input decoder resources, including
    // when cancelled. Preflight itself must be released if no render started.
    if(!startedRender) for(const item of prepared.used.values()){
      try{await item.input?.dispose?.();}catch{}
    }
  }
}
