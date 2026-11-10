import {acceleratedCutEligibility,renderAcceleratedCuts}
  from './accelerated-cut-renderer.mjs';
import {createAcceleratedNativeSink} from './accelerated-native-sink.mjs';

// Explicit, experimental native-file path for the already supported cut-only
// subset. This is NOT connected to recordProject or Wivra's default export UI.
// Never start a native random session before the codec/container/audio preflight.
// A failed stream is aborted; no silent rerun or partial-file publication.
export async function recordExperimentalNativeAcceleratedCuts({
  project,media,M,host,expectAudio,experimentalAccelerated=false,
  isCancelled=()=>false,estimatedBytes=0,onProgress=()=>{}
}={}) {
  if (experimentalAccelerated !== true)
    throw new Error('Exportación acelerada nativa requiere autorización experimental explícita.');
  if (typeof expectAudio !== 'boolean')
    throw new Error('Debe declararse explícitamente si se espera audio en el video.');
  if (typeof isCancelled !== 'function' || typeof onProgress !== 'function')
    throw new Error('Controles experimentales inválidos.');
  const selected=acceleratedCutEligibility(project,media);
  if (!selected.eligible)
    throw new Error('Montaje no compatible con exportación acelerada: '+selected.reason);
  if (!M || typeof M.Input !== 'function' || typeof M.UrlSource !== 'function' ||
      typeof M.getFirstEncodableVideoCodec !== 'function')
    throw new Error('Mediabunny offline no está disponible.');
  if (!host || typeof host.request !== 'function' ||
      typeof host.sendWriteAt !== 'function' ||
      !['android','ios'].includes(host.platform))
    throw new Error('Se requiere un puente nativo de protocolo 2.');
  if (isCancelled()) throw new Error('Exportación acelerada cancelada antes de empezar.');
  const input=new M.Input({source:new M.UrlSource(selected.sourceUrl),formats:M.ALL_FORMATS});
  let video,audio;
  try {
    // This is a codec probe, not a media owner. Release the probe decoder
    // before the renderer opens its own source, even on an async track error.
    video=await input.getPrimaryVideoTrack();
    audio=await input.getPrimaryAudioTrack();
  } finally {
    try { await input.dispose?.(); } catch { /* cleanup is best-effort */ }
  }
  if (!video) throw new Error('No existe una pista de video decodificable.');
  if (!!audio !== expectAudio)
    throw new Error('La pista de audio original no coincide con el montaje.');
  // Mirror renderAcceleratedCuts' codec selection BEFORE creating a native
  // partial file. No later transcoder may silently swap containers.
  const first=await M.getFirstEncodableVideoCodec(['avc','vp9','vp8'],{
    width:selected.width,height:selected.height
  });
  if (!first) throw new Error('No existe codificador WebCodecs compatible.');
  const aac=expectAudio&&await M.canEncodeAudio('aac');
  const avc=first==='avc'&&(!expectAudio||aac);
  const codec=avc?'avc':first!=='avc'?first:
    await M.getFirstEncodableVideoCodec(['vp9','vp8'],{
      width:selected.width,height:selected.height
    });
  if (!codec) throw new Error('El códec original no tiene alternativa compatible.');
  if (expectAudio&&!avc&&!(await M.canEncodeAudio('opus')))
    throw new Error('No existe códec de audio WebM compatible.');
  const container=avc?'mp4':'webm';
  if (host.platform==='ios'&&container!=='mp4')
    throw new Error('iPhone requiere MP4/H.264 y AAC para guardado acelerado.');
  if (isCancelled()) throw new Error('Exportación acelerada cancelada durante codec preflight.');
  const mime=container==='mp4'?'video/mp4':'video/webm';
  const sink=createAcceleratedNativeSink(host,{
    mime,expectedDurationMs:Math.round(selected.totalSeconds*1000),
    expectAudio,estimatedBytes
  });
  try {
    await sink.begin();
    const stats=await renderAcceleratedCuts({
      M,sourceUrl:selected.sourceUrl,cuts:selected.cuts,
      width:selected.width,height:selected.height,
      writeAt:(position,bytes)=>sink.writeAt(position,bytes),
      expectedAudio:expectAudio,isCancelled
    });
    if (stats.container!==container || stats.audioCodec!==
        (expectAudio?(container==='mp4'?'aac':'opus'):null) ||
        stats.outputBytes!==sink.maxEnd || stats.writes<=0)
      throw new Error('El contenedor, audio o tamaño difiere del codec preflight.');
    if (isCancelled()) throw new Error('Exportación acelerada cancelada antes de finalizar.');
    const saved=await sink.finish();
    if (saved.verified!==true || saved.bytes!==stats.outputBytes)
      throw new Error('El archivo nativo no está verificado.');
    // A UI callback cannot turn an already committed video into a failed
    // export: native finishRandom is complete and the private copy is saved.
    try { onProgress({pct:1,t:selected.totalSeconds,total:selected.totalSeconds}); }
    catch { /* advisory observer */ }
    return {experimental:true,verifiedNative:true,verifiedOnDevice:false,
      mime,container,saved,render:stats};
  } catch (error) {
    await sink.abort();
    throw error;
  }
}
