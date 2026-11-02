// Wivra P0-W31: exact on-device WebCodecs encoder preflight.
// This module only guards explicit experimental native v2 exports.
// The codec chosen by Mediabunny is NOT proof that the actual mobile
// WebView/WKWebView supports the requested resolution/fps/audio format.
// A positive result is a precondition, never proof that a completed MP4
// can be published to Photos or safely played on a real device.

const rejectMobileCodec=message=>{throw new Error('Preflight WebCodecs móvil: '+message);};
export function mobileCodecConfig({codec,width,height,fps,sampleRate,
 audioBitrate=128000,videoBitrate=3000000}={}) {
 if(!codec || !['avc','vp8','vp9'].includes(codec.videoCodec) ||
    !['mp4','webm'].includes(codec.container) ||
    !Number.isSafeInteger(width)||width<=0||width>3840 ||
    !Number.isSafeInteger(height)||height<=0||height>3840 ||
    !Number.isSafeInteger(fps)||fps<12||fps>60 ||
    !Number.isSafeInteger(sampleRate)||sampleRate<8000||sampleRate>96000 ||
    !Number.isSafeInteger(videoBitrate)||videoBitrate<=0 ||
    !Number.isSafeInteger(audioBitrate)||audioBitrate<=0)
  rejectMobileCodec('configuración inválida');
 if((codec.container==='mp4' && codec.videoCodec!=='avc') ||
    (codec.container==='webm' && codec.videoCodec==='avc') ||
    (codec.hasAudio && codec.audioCodec!==(codec.container==='mp4'?'aac':'opus')) ||
    (!codec.hasAudio && codec.audioCodec!=null))
  rejectMobileCodec('par de códecs y contenedor inconsistente');
 // H264 level must scale to the output area. A baseline 3.1 probe would
 // wrongly label a 4K output as supported (or reject a supported high profile).
 const pixels=width*height;
 const codecName=codec.videoCodec==='avc'
  ? (pixels>1920*1080?'avc1.640034':pixels>1280*720?'avc1.64002A':'avc1.42E01F')
  :codec.videoCodec==='vp9'?'vp09.00.51.08':'vp8';
 return {video:{
   codec:codecName,width,height,framerate:fps,bitrate:videoBitrate,
   ...(codec.videoCodec==='avc'?{avc:{format:'avc'}}:{})
  },audio:codec.hasAudio?{
   codec:codec.audioCodec==='aac'?'mp4a.40.2':'opus',
   sampleRate,numberOfChannels:2,bitrate:audioBitrate
  }:null};
}
export async function verifyAcceleratedMobileCodecSupport({
 codec,width,height,fps,sampleRate,videoBitrate,videoEncoder=globalThis.VideoEncoder,
 audioEncoder=globalThis.AudioEncoder,platform
}={}) {
 if(!['android','ios'].includes(platform))rejectMobileCodec('plataforma desconocida');
 if(platform==='ios' && (codec?.container!=='mp4'||
    codec?.videoCodec!=='avc'||(codec?.hasAudio&&codec.audioCodec!=='aac')))
  rejectMobileCodec('iOS exige MP4 H264/AAC real');
 const requested=mobileCodecConfig({codec,width,height,fps,sampleRate,
  ...(videoBitrate===undefined?{}:{videoBitrate})});
 if(typeof videoEncoder?.isConfigSupported!=='function')
  rejectMobileCodec('VideoEncoder no disponible en este teléfono');
 let video;
 try{video=await videoEncoder.isConfigSupported(requested.video);}
 catch{rejectMobileCodec('VideoEncoder no acepta la configuración seleccionada');}
 if(video?.supported!==true)rejectMobileCodec('H264/VP8/VP9 no disponible a esta resolución y FPS');
 if(requested.audio){
  if(typeof audioEncoder?.isConfigSupported!=='function')
   rejectMobileCodec('AudioEncoder no disponible en este teléfono');
  let audio;
  try{audio=await audioEncoder.isConfigSupported(requested.audio);}
  catch{rejectMobileCodec('AudioEncoder no acepta la configuración seleccionada');}
  if(audio?.supported!==true)rejectMobileCodec('AAC/Opus no disponible con audio estéreo');
 }
 return {supported:true,platform,videoCodec:codec.videoCodec,
  audioCodec:codec.audioCodec,container:codec.container,
  width,height,fps,sampleRate,audioChecked:!!requested.audio};
}
