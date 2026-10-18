/* Browser EXPORT integration smoke: actual app/export.mjs, synthetic video +
   independent WAV, no app code changed. Plays rendered Blob to verify decode.
   Chromium Linux CI is not Android/iOS hardware, no shipping claim. */
const {chromium} = require('/tmp/wivra-media-lab/node_modules/playwright');
const {readFileSync,writeFileSync} = require('node:fs');
const http=require('node:http'), path=require('node:path');
const root=path.resolve(__dirname,'..');
const report={type:'WIVRA_REAL_EDITOR_BROWSER_EXPORT_SYNTHETIC_LINUX',
  source:'app/export.mjs',runner:'Playwright Chromium Linux; not mobile WebView',
  cases:[],limits:'Synthetic media only, codec support and audio sync on phones not verified; no actual Ray-Ban/HEVC'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 const loc=path.resolve(root,'.'+pathname);
 if(!loc.startsWith(root+path.sep)|| !/\.(mjs|js|html)$/.test(loc)){res.writeHead(404);return res.end();}
 try{
  const data=readFileSync(loc);res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(data);
 }catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port+'/app/export.mjs');
  const result=await page.evaluate(async()=>{
   const {recordProject,exportPlan}=await import('/app/export.mjs');
   const emit=(label,data)=>({label,...data});
   const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
   const ctx=canvas.getContext('2d');
   const inputStream=canvas.captureStream(15);
   const sourceMime=['video/webm;codecs=vp8','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
   if(!sourceMime)throw new Error('Browser cannot create VP8 WebM synthetic input');
   const rec=new MediaRecorder(inputStream,{mimeType:sourceMime,videoBitsPerSecond:450000});
   const chunks=[],start=performance.now();
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
   const stopped=new Promise((resolve,reject)=>{rec.onstop=resolve;rec.onerror=e=>reject(e.error||new Error('input recording failed'))});
   rec.start(100);
   for(let i=0;i<37;i++){
    ctx.fillStyle=i%2?'#0369a1':'#a16207';ctx.fillRect(0,0,320,240);
    ctx.fillStyle='white';ctx.font='30px sans-serif';ctx.fillText('Wivra '+i,20,80);
    await new Promise(r=>setTimeout(r,50));
   }
   rec.stop();await stopped;inputStream.getTracks().forEach(t=>t.stop());
   const input=new Blob(chunks,{type:rec.mimeType});
   if(input.size<2000)throw new Error('Synthetic video input unexpectedly empty: '+input.size);
   const wavSeconds=1.8,rate=16000,N=Math.floor(wavSeconds*rate);
   const buf=new ArrayBuffer(44+N*2),v=new DataView(buf);
   const str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i))};
   str(0,'RIFF');v.setUint32(4,36+N*2,true);str(8,'WAVE');str(12,'fmt ');
   v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);
   v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);
   str(36,'data');v.setUint32(40,N*2,true);
   for(let i=0;i<N;i++)v.setInt16(44+i*2,Math.round(6000*Math.sin(2*Math.PI*440*i/rate)),true);
   const wav=new Blob([buf],{type:'audio/wav'});
   const urls=[URL.createObjectURL(input),URL.createObjectURL(wav)];
   const media={v:{url:urls[0],kind:'video',w:320,h:240},mic:{url:urls[1],kind:'audio'}};
   const project={clips:[{id:'c',asset_id:'v',start:0,in:0,out:1.25,volume:1}],
    overlayClips:[],audioClips:[{id:'a',asset_id:'mic',start:0.12,in:0,out:1.12,role:'voice_primary'}],
    texts:[],format:{aspect:'original'}};
   const outcomes=[emit('source',{sourceMime:input.type,bytes:input.size,
    sourceRenderSeconds:+((performance.now()-start)/1000).toFixed(3),sourceWavBytes:wav.size})];
   try{
    outcomes.push(emit('plan',{plan:exportPlan(project)}));
    let actual;
    try{actual=await recordProject({project,media,onProgress:()=>{}})}
    catch(e){outcomes.push(emit('export_exception',{name:e.name,message:e.message,stack:String(e.stack).slice(0,1600)}));return outcomes}
    if(actual?.audioBlocked){outcomes.push(emit('export_audio_blocked',{...actual}));return outcomes}
    if(!actual?.blob){outcomes.push(emit('export_empty',{...actual}));return outcomes}
    const bytes=actual.blob.size,video=document.createElement('video');
    const url=URL.createObjectURL(actual.blob);
    let loaded=false,seconds=null,w=null,h=null,decodeError=null;
    try{
      video.muted=true;video.preload='auto';video.playsInline=true;video.src=url;
      await Promise.race([
       new Promise((res,rej)=>{video.onloadedmetadata=()=>{loaded=true;res()};video.onerror=()=>rej(new Error(video.error?.message||'invalid media'))}),
       new Promise((_,rej)=>setTimeout(()=>rej(new Error('metadata timeout')),7500))
      ]);
      seconds=video.duration;w=video.videoWidth;h=video.videoHeight;
      await video.play();await new Promise(r=>setTimeout(r,150));video.pause();
    }catch(e){decodeError=String(e.message)}
    finally{URL.revokeObjectURL(url);video.remove()}
    outcomes.push(emit('recordProject_result',{mime:actual.mime,ext:actual.ext,bytes,
      hasAudio:actual.hasAudio,skippedAudio:actual.skippedAudio,skippedOverlay:actual.skippedOverlay,
      decoded:loaded,videoDuration:seconds,w,h,decodeError,
      returnedProcessingSeconds:actual.seconds}));
    const invalidMedia={...media,mic:{kind:'audio',url:'blob:invalid-nonexistent'}};
    const gate=await recordProject({project,media:invalidMedia,isCancelled:()=>false});
    outcomes.push(emit('missing_WAV_must_fail_closed',{blocked:gate?.audioBlocked===true,missingAudio:gate?.missingAudio||[]}));
   }finally{urls.forEach(URL.revokeObjectURL)}
   return outcomes;
  });
  report.cases=result;
  console.log(JSON.stringify(report,null,2));
  writeFileSync('wivra-export-browser-roundtrip.json',JSON.stringify(report,null,2)+'\n');
  const last=result.find(x=>x.label==='recordProject_result');
  if(!last||!last.decoded||last.bytes<1000||!(last.w>0)||last.hasAudio!==true)process.exitCode=1;
  const safety=result.find(x=>x.label==='missing_WAV_must_fail_closed');
  if(!safety||!safety.blocked)process.exitCode=1;
  await page.close();
 }finally{await browser.close()}
})().catch(e=>{report.error=String(e.stack||e);writeFileSync('wivra-export-browser-roundtrip.json',JSON.stringify(report,null,2)+'\n');console.error(e);process.exitCode=1}).finally(()=>server.close());
