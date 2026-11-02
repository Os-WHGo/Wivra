import {prepareAcceleratedMultitrack,renderAcceleratedMultitrack} from './accelerated-multitrack-renderer.mjs';
import {createAcceleratedNativeSink} from './accelerated-native-sink.mjs';
import {planAcceleratedStorageReservation} from './accelerated-storage-budget.mjs';
import {verifyAcceleratedMobileCodecSupport} from './accelerated-native-codec-probe.mjs';
import {exportBitrate} from './export.mjs';

/**
 * W22: iOS private v2 files remain the authoritative recovery copy.
 * Only an explicit user's Photos action may add a copy to the Photos library.
 * Never turn a simulated/missing native verification into "saved to Photos".
 * The existing iOS native handler checks ownership and invokes the system
 * permission flow independently. Neither this helper nor the QA renderer
 * can read other photos, delete media, or use the v1 bridge.
 */
export async function saveVerifiedAcceleratedVideoToPhotos({
  host,saved,userConfirmed=false
}={}) {
  if(userConfirmed!==true)
    throw new Error('Guardar en Fotos requiere confirmación explícita.');
  if(host?.platform!=='ios'||typeof host.request!=='function')
    throw new Error('Fotos acelerado solo está disponible en iPhone.');
  if(saved?.verified!==true || !Number.isSafeInteger(saved.token) ||
     saved.token<=0 || !Number.isSafeInteger(saved.bytes) || saved.bytes<=0 ||
     !/^[0-9a-f]{64}$/i.test(saved.sha256||'') ||
     saved.media?.video!==true ||
     !Number.isSafeInteger(saved.media.durationMs) || saved.media.durationMs<=0)
    throw new Error('Fotos exige un archivo nativo acelerado verificado.');
  const receipt=await host.request({op:'savePhotos',token:saved.token});
  if(receipt?.savedToPhotos!==true)
    throw new Error('Fotos no confirmó el guardado; archivo privado conservado.');
  return {saved:true,privateCopyPreserved:true};
}

// The experimental v2 transport is NEVER selected by the production export
// engine. The caller must explicitly request this QA path, and the stable
// MediaRecorder path is untouched. Native file is not opened until ALL assets,
// tracks, image overlays and codec capabilities are proven available.
export async function recordExperimentalNativeMultitrack({
  project,media,M,host,expectAudio,experimentalAccelerated=false,
  isCancelled=()=>false,onProgress=()=>{},imageFactory,
  fps=30,sampleRate=48000,estimatedBytes,saveToPhotos=false
}={}) {
  if(experimentalAccelerated!==true)
    throw new Error('La exportación multipista nativa requiere modo experimental explícito.');
  if(typeof expectAudio!=='boolean')
    throw new Error('La presencia de audio multipista debe declararse explícitamente.');
  if(typeof saveToPhotos!=='boolean' || (saveToPhotos && host?.platform!=='ios'))
    throw new Error('Fotos acelerado requiere iPhone y autorización explícita.');
  if(!host || !['android','ios'].includes(host.platform) ||
     typeof host.request!=='function' ||typeof host.sendWriteAt!=='function')
    throw new Error('El puente nativo multipista v2 no está disponible.');
  if(typeof isCancelled!=='function'||typeof onProgress!=='function')
    throw new Error('Los controles de exportación multipista no son válidos.');
  if(!Number.isSafeInteger(fps)||fps<12||fps>60 ||
     !Number.isSafeInteger(sampleRate)||sampleRate<8000||sampleRate>96000)
    throw new Error('Frecuencia de video/audio acelerado inválida.');
  if(isCancelled())throw new Error('Exportación multipista cancelada antes de comenzar.');
  // Progress is advisory UI output, never part of encoder correctness.
  // Throwing in an observer must not discard valid media or claim that an
  // already sealed private file failed after native finishRandom committed.
  const safeProgress=progress=>{
    try { onProgress(progress); } catch { /* optional UI observer */ }
  };

  const prepared=await prepareAcceleratedMultitrack({
    project,media,M,platform:host.platform,
    // The checkbox is a minimum-content requirement, not a mute switch:
    // when unchecked, keep any authored audio and only make its presence optional.
    expectedAudio:expectAudio ? true : null,
    isCancelled,...(imageFactory?{imageFactory}:{})
  });
  let sink;
  try {
    // Keep estimation inside the same cleanup scope as codec/bridge setup.
    // Invalid space estimates must release every decoder before returning.
    const reservation=planAcceleratedStorageReservation({
      seconds:prepared.totalSeconds,width:prepared.width,
      height:prepared.height,fps,estimatedBytes
    });
    const expectedBytes=reservation.estimatedBytes;
    // Only mono and stereo are mixed today. A multi-channel source could
    // otherwise lose its center/dialogue channel unnoticed.
    for(const item of prepared.used.values()){
      if(!item.audio)continue;
      const channels=await item.audio.getNumberOfChannels?.();
      if(channels!==1&&channels!==2)
        throw new Error('Canales de audio no admitidos por el motor acelerado.');
    }
    if(isCancelled())throw new Error('Exportación multipista cancelada antes de abrir archivo.');
    // Mediabunny can select a codec family without the actual WKWebView or
    // Android WebView supporting these exact output dimensions, fps and
    // stereo sample rate. Fail safely BEFORE obtaining a native file token.
    const codecCapabilities=await verifyAcceleratedMobileCodecSupport({
      platform:host.platform,codec:prepared.codec,
      width:prepared.width,height:prepared.height,fps,sampleRate,
      videoBitrate:exportBitrate(prepared.totalSeconds,{
        progressive:true,width:prepared.width,height:prepared.height,fps
      })
    });
    if(isCancelled())throw new Error('Exportación multipista cancelada tras validar códecs.');
    sink=createAcceleratedNativeSink(host,{
      mime:prepared.codec.container==='mp4'?'video/mp4':'video/webm',
      expectedDurationMs:Math.round(prepared.totalSeconds*1000),
      expectAudio,estimatedBytes:expectedBytes
    });
    await sink.begin();
    const stats=await renderAcceleratedMultitrack({prepared,
      fps,sampleRate,isCancelled,onProgress:safeProgress,
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
    // A Photos denial, interruption or missing permission cannot discard the
    // already verified private video. Report actual state; never fake success.
    let photos={requested:saveToPhotos,saved:false,privateCopyPreserved:true};
    if(saveToPhotos) {
      try {
        const receipt=await saveVerifiedAcceleratedVideoToPhotos({
          host,saved,userConfirmed:true
        });
        photos={requested:true,...receipt};
      } catch(error) {
        photos={requested:true,saved:false,privateCopyPreserved:true,
          error: error instanceof Error ? error.message : 'Fotos no disponible.'};
      }
    }
    safeProgress({t:prepared.totalSeconds,total:prepared.totalSeconds,pct:1});
    return {experimental:true,verifiedNative:true,verifiedOnDevice:false,
      rendererReadyForProduction:false,
      mime:prepared.codec.container==='mp4'?'video/mp4':'video/webm',
      saved,render:stats,photos,codecCapabilities};
  }catch(error){
    if(sink) {
      try{await sink.abort();}catch{}
    }
    throw error;
  } finally {
    // Guarantee decoder disposal even if output setup fails before the
    // renderer reaches its own try/finally (e.g. unavailable canvas or
    // encoder constructor). The renderer also closes inputs on its path;
    // dispose may be called twice and must not suppress the original error.
    for(const item of prepared.used.values()){
      try{await item.input?.dispose?.();}catch{}
    }
  }
}
