/**
 * Local VISUAL observation: sample a few downscaled video frames.
 * Not OCR, geolocation, semantic video understanding or a neural network.
 * Frames never leave the browser. May be slow/unsupported on some Safari builds.
 * — ChatGPT
 */
export function changeScore(previous, next){
 if(!previous||!next||previous.length!==next.length||next.length===0)throw new Error("Comparable frames required");
 let s=0;for(let i=0;i<next.length;i++)s+=Math.abs(next[i]-previous[i]);
 return Math.round((s/next.length)/255*10000)/10000;
}
function lumaAndTexture(data,w,h){
 const luma=new Uint8Array(w*h);let sum=0,diff=0,count=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const idx=y*w+x,i=idx*4;
   const v=Math.round(.2126*data[i]+.7152*data[i+1]+.0722*data[i+2]);
   luma[idx]=v;sum+=v;
   if(x){diff+=Math.abs(v-luma[idx-1]);count++}
 }
 return {pixels:luma,brightness:Math.round(sum/(w*h))/255,texture:count?diff/count/255:0};
}
function seek(video,time,timeoutMs){
 return new Promise((resolve,reject)=>{
   let settled=false;
   const finish=error=>{
     if(settled)return;settled=true;
     video.removeEventListener('seeked',onSeek);video.removeEventListener('error',onError);
     clearTimeout(timer);error?reject(error):resolve();
   };
   const onSeek=()=>finish();
   const onError=()=>finish(new Error('Video seek failed'));
   const timer=setTimeout(()=>finish(new Error('Video seek timeout')),timeoutMs);
   video.addEventListener('seeked',onSeek,{once:true});
   video.addEventListener('error',onError,{once:true});
   try {video.currentTime=time;if(Math.abs(video.currentTime-time)<.025&&!video.seeking&&video.readyState>=2)finish();}
   catch(error){finish(error)}
 });
}
export async function inspectVideoFrames(video,{
 sampleCount=8, onProgress=()=>{}, signal=null, timeoutMs=6500
}={}){
 if(!video||!Number.isFinite(video.duration)||video.duration<=0||!video.videoWidth)throw new Error('Video not ready');
 if(!Number.isInteger(sampleCount)||sampleCount<2||sampleCount>20)throw new RangeError('Use 2–20 frames');
 const wasPaused=video.paused,originalTime=video.currentTime;
 const w=96,h=Math.max(2,Math.round(96*video.videoHeight/video.videoWidth));
 const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
 const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw new Error('Canvas 2D unavailable');
 const result=[];let previous=null;
 video.pause();
 try{
   for(let i=0;i<sampleCount;i++){
     if(signal?.aborted)throw new Error('Analysis cancelled');
     // Keep away from end to improve Safari seeking reliability.
     const t=Math.min(Math.max(0,video.duration-.12),(.1+(i+.5)/sampleCount*(video.duration-.2)));
     await seek(video,t,timeoutMs);
     if(signal?.aborted)throw new Error('Analysis cancelled');
     ctx.drawImage(video,0,0,w,h);
     const frame=lumaAndTexture(ctx.getImageData(0,0,w,h).data,w,h);
     const delta=previous?changeScore(previous,frame.pixels):0;
     result.push({time:Math.round(t*100)/100,brightness:Math.round(frame.brightness*1000)/1000,
       texture:Math.round(frame.texture*1000)/1000,delta});
     previous=frame.pixels;
     onProgress(i+1,sampleCount);
   }
 }finally{
   try{await seek(video,Math.min(originalTime,Math.max(0,video.duration-.12)),timeoutMs)}catch{}
   if(!wasPaused){try{await video.play()}catch{}}
 }
 return {
   method:'sparse_local_frame_differences_v1',sampledFrames:result.length,
   frameSize:{width:w,height:h},duration:video.duration,
   changes:result.slice(1).sort((a,b)=>b.delta-a.delta),
   samples:result,
   warnings:[
     'Scenes and streets are NOT semantically recognized. Differences may come from motion, lighting or camera movement.',
     'No GPS, audio, OCR or facial identification. Source frames stay on-device.',
     'Sparse sampling can skip important events; do not represent these as verified highlights.'
   ]
 };
}
