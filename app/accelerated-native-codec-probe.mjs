// Wivra P0-W31: exact on-device WebCodecs encoder preflight.
// This module only guards explicit experimental native v2 exports.
// The codec chosen by Mediabunny is NOT proof that the actual mobile
// WebView/WKWebView supports the requested resolution/fps/audio format.
// A positive result is a precondition, never proof that a completed MP4
// can be published to Photos or safely played on a real device.

const rejectMobileCodec=message=>{throw new Error('Preflight WebCodecs móvil: '+message);};
export function mobileCodecConfig({codec,width,height,fps,sampleRate,
 audioBitrate=128000,videoBitrate=3000000}={}) {
 if(!codec || typeof codec.hasAudio!=='boolean' ||
    !['avc','vp8','vp9'].includes(codec.videoCodec) ||
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
 // H.264 Annex A constrains BOTH macroblocks/frame and macroblocks/second.
 // Resolution-only levels reject valid 4K30 phones while 720p60 may exceed
 // baseline 3.1 even though its frame dimensions fit.
 const mbFrame=Math.ceil(width/16)*Math.ceil(height/16);
 const mbSecond=mbFrame*fps;
 const highProfile=width*height>1280*720;
 const avcLevels=highProfile?[
   [8192,245760,'28'],    // High 4.0: 1080p30
   [8704,522240,'2A'],    // High 4.2: 1080p60
   [36864,983040,'33'],   // High 5.1: 4K30
   [36864,2073600,'34']  // High 5.2: 4K60
  ]:[
   [3600,108000,'1F'],    // Constrained baseline 3.1: 720p30
   [5120,216000,'20'],    // Constrained baseline 3.2: 720p60
   [8192,245760,'28'],[8704,522240,'2A'],
   [36864,983040,'33'],[36864,2073600,'34']
  ];
 const matchingLevel=avcLevels.find(([maxFrame,maxSecond])=>
  mbFrame<=maxFrame && mbSecond<=maxSecond);
 if(codec.videoCodec==='avc'&&!matchingLevel)
  rejectMobileCodec('nivel AVC insuficiente para dimensiones/FPS');
 const codecName=codec.videoCodec==='avc'
  ? 'avc1.'+(highProfile?'6400':'42E0')+matchingLevel[2]
  :codec.videoCodec==='vp9'?'vp09.00.51.08':'vp8';
 return {video:{
   codec:codecName,width,height,framerate:fps,bitrate:videoBitrate,
   ...(codec.videoCodec==='avc'?{avc:{format:'avc'}}:{})
  },audio:codec.hasAudio?{
   codec:codec.audioCodec==='aac'?'mp4a.40.2':'opus',
   sampleRate,numberOfChannels:2,bitrate:audioBitrate
  }:null};
}
// WebCodecs specifies isConfigSupported() returns the *recognized* config.
// If a browser discards a critical field, "supported" alone is not evidence
// that it honored the requested frames, bitrate or stereo audio. Fail closed.
function supportsExactFields(result,requested,keys){
 return result?.supported===true &&
  !!result.config && typeof result.config==='object' &&
  keys.every(key=>result.config[key]===requested[key]);
}
export async function verifyAcceleratedMobileCodecSupport({
 codec,width,height,fps,sampleRate,videoBitrate,audioBitrate=128000,
 videoEncoder=globalThis.VideoEncoder,audioEncoder=globalThis.AudioEncoder,platform
}={}) {
 if(!['android','ios'].includes(platform))rejectMobileCodec('plataforma desconocida');
 if(platform==='ios' && (codec?.container!=='mp4'||
    codec?.videoCodec!=='avc'||(codec?.hasAudio&&codec.audioCodec!=='aac')))
  rejectMobileCodec('iOS exige MP4 H264/AAC real');
 const requested=mobileCodecConfig({codec,width,height,fps,sampleRate,
  audioBitrate,...(videoBitrate===undefined?{}:{videoBitrate})});
 if(typeof videoEncoder?.isConfigSupported!=='function')
  rejectMobileCodec('VideoEncoder no disponible en este teléfono');
 let video;
 try{video=await videoEncoder.isConfigSupported(requested.video);}
 catch{rejectMobileCodec('VideoEncoder no acepta la configuración seleccionada');}
 if(!supportsExactFields(video,requested.video,
     ['codec','width','height','framerate','bitrate']) ||
    (requested.video.avc &&
     video.config.avc?.format!==requested.video.avc.format))
  rejectMobileCodec('H264/VP8/VP9 no confirmó resolución, FPS, perfil y bitrate exactos');
 if(requested.audio){
  if(typeof audioEncoder?.isConfigSupported!=='function')
   rejectMobileCodec('AudioEncoder no disponible en este teléfono');
  let audio;
  try{audio=await audioEncoder.isConfigSupported(requested.audio);}
  catch{rejectMobileCodec('AudioEncoder no acepta la configuración seleccionada');}
  if(!supportsExactFields(audio,requested.audio,
      ['codec','sampleRate','numberOfChannels','bitrate']))
   rejectMobileCodec('AAC/Opus no confirmó audio estéreo y frecuencia exactos');
 }
 return {supported:true,platform,videoCodec:codec.videoCodec,
  audioCodec:codec.audioCodec,container:codec.container,
  width,height,fps,sampleRate,audioChecked:!!requested.audio};
}
