/* Browser EXPORT integration smoke: actual app/export.mjs, synthetic video +
   independent WAV, no app code changed. Plays rendered Blob to verify decode.
   Chromium Linux CI is not Android/iOS hardware, no shipping claim. */
const {chromium} = require('/tmp/wivra-media-lab/node_modules/playwright');
const {readFileSync,writeFileSync} = require('node:fs');
const http=require('node:http'), path=require('node:path');
const {execFileSync}=require('node:child_process');
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
    // Deliberately different source scenes, making non-contiguous montage
    // verifiable from the final encoded pixels without OCR or screenshots.
    ctx.fillStyle=i<18?'#a16207':'#0369a1';ctx.fillRect(0,0,320,240);
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
   // Two non-contiguous moments from one long original, with a single
   // microphone track and a real title cue across only the first moment.
   const project={clips:[
      {id:'c1',asset_id:'v',start:0,in:0.12,out:0.77,volume:1},
      {id:'c2',asset_id:'v',start:0.65,in:1.00,out:1.60,volume:1}
    ],overlayClips:[],
    audioClips:[{id:'a',asset_id:'mic',start:0.12,in:0,out:1.12,role:'voice_primary'}],
    texts:[{id:'caption1',text:'Wivra export smoke',start:0.18,end:0.48,position:'middle'}],
    format:{aspect:'original'}};
   const outcomes=[emit('source',{sourceMime:input.type,bytes:input.size,
    sourceRenderSeconds:+((performance.now()-start)/1000).toFixed(3),sourceWavBytes:wav.size})];
   let actual,drawnTitles=0;
   const originalFillText=CanvasRenderingContext2D.prototype.fillText;
   CanvasRenderingContext2D.prototype.fillText=function(...args){
     if(String(args[0])==='Wivra export smoke')drawnTitles++;
     return originalFillText.apply(this,args);
   };
   try{
    outcomes.push(emit('plan',{plan:exportPlan(project),mainClips:project.clips.length,captions:project.texts.length}));
    try{actual=await recordProject({project,media,onProgress:()=>{}})}
    catch(e){outcomes.push(emit('export_exception',{name:e.name,message:e.message,stack:String(e.stack).slice(0,1600)}));return {cases:outcomes}}
    if(actual?.audioBlocked){outcomes.push(emit('export_audio_blocked',{...actual}));return {cases:outcomes}}
    if(!actual?.blob){outcomes.push(emit('export_empty',{...actual}));return {cases:outcomes}}
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
    outcomes.push(emit('title_draw_attempts',{count:drawnTitles}));
    outcomes.push(emit('recordProject_result',{mime:actual.mime,ext:actual.ext,bytes,
      hasAudio:actual.hasAudio,skippedAudio:actual.skippedAudio,skippedOverlay:actual.skippedOverlay,
      decoded:loaded,videoDuration:seconds,w,h,decodeError,
      returnedProcessingSeconds:actual.seconds}));
    // A video may load and decode, yet its timeline trim extends well past
    // the real last frame. It must abort rather than export a shorter movie.
    const beyond={clips:[{id:'source-overrun',asset_id:'v',start:0,in:0.10,out:9}],
      overlayClips:[],audioClips:[],texts:[],format:{aspect:'original'}};
    let overrunError=null;
    try{await recordProject({project:beyond,media})}
    catch(e){overrunError=String(e.message)}
    outcomes.push(emit('source_video_overrun_must_reject',{
      rejected:!!overrunError,reason:overrunError
    }));
    const invalidMedia={...media,mic:{kind:'audio',url:'blob:invalid-nonexistent'}};
    const gate=await recordProject({project,media:invalidMedia,isCancelled:()=>false});
    outcomes.push(emit('missing_WAV_must_fail_closed',{blocked:gate?.audioBlocked===true,missingAudio:gate?.missingAudio||[]}));
    // Unlike a missing WAV, a truncated WAV decodes just fine. It must still
    // be rejected BEFORE recording because the requested original out=1.12.
    const shortCount=Math.round(0.35*rate);
    const shortBytes=buf.slice(0,44+shortCount*2);
    const shortHeader=new DataView(shortBytes);
    shortHeader.setUint32(4,36+shortCount*2,true);
    shortHeader.setUint32(40,shortCount*2,true);
    const shortUrl=URL.createObjectURL(new Blob([shortBytes],{type:'audio/wav'}));
    try {
      const shortGate=await recordProject({project,media:{...media,mic:{kind:'audio',url:shortUrl}}});
      outcomes.push(emit('short_WAV_must_fail_closed',{
        blocked:shortGate?.audioBlocked===true,missingAudio:shortGate?.missingAudio||[],
        shortAudio:shortGate?.shortAudio||[]
      }));
    }finally{URL.revokeObjectURL(shortUrl)}
   }finally{CanvasRenderingContext2D.prototype.fillText=originalFillText;urls.forEach(URL.revokeObjectURL)}
   const target=outcomes.find(x=>x.label==='recordProject_result');
   const payload=actual?.blob && target?.bytes>0 ? await new Promise((res,rej)=>{
     const reader=new FileReader();
     reader.onload=()=>{
       // MIME parameters can contain commas (codecs=vp8,opus). Splitting a
       // data URL on the FIRST comma corrupted the prior synthetic fixture.
       const data=String(reader.result), token=';base64,', at=data.lastIndexOf(token);
       if(at<0)rej(new Error('FileReader did not return base64 data'));
       else res(data.slice(at+token.length));
     };
     reader.onerror=()=>rej(reader.error||new Error('FileReader failed'));
     reader.readAsDataURL(actual.blob);
   }) : null;
   return {cases:outcomes,syntheticBinaryBase64:payload};
  });
  report.cases=result.cases;
  if(result.syntheticBinaryBase64){
    const assembly=report.cases.find(x=>x.label==='plan');
  if(assembly?.mainClips!==2 || assembly?.captions!==1 || assembly.plan?.segments?.length!==2)process.exitCode=1;
  const last=report.cases.find(x=>x.label==='recordProject_result');
    const tmp='/tmp/wivra-export-roundtrip.'+last.ext;
    const payload=Buffer.from(result.syntheticBinaryBase64,'base64');
    report.binaryHeaderHex=payload.subarray(0,32).toString('hex');
    writeFileSync(tmp,payload);
    try{
      const ff=JSON.parse(execFileSync('ffprobe',['-v','error','-show_packets','-show_entries',
        'stream=codec_type,codec_name,width,height,duration:packet=pts_time,duration_time,stream_index:format=duration,size,format_name',
        '-of','json',tmp],{encoding:'utf8',timeout:20000}));
      // MediaRecorder WebM can omit the optional container duration even when
      // the video+audio packets are valid. Measure actual packet timestamps.
      const pts=(ff.packets||[]).filter(p=>Number.isFinite(Number(p.pts_time)))
        .map(p=>({start:Number(p.pts_time),end:Number(p.pts_time)+Math.max(0,Number(p.duration_time)||0)}));
      const packetSeconds=pts.length?Math.max(...pts.map(p=>p.end))-Math.min(...pts.map(p=>p.start)):null;
      const metadataSeconds=Number(ff.format?.duration);
      const useMetadata=Number.isFinite(metadataSeconds)&&metadataSeconds>0;
      report.ffprobe={format:ff.format?.format_name,
        duration:useMetadata?metadataSeconds:packetSeconds,
        durationSource:useMetadata?'container':'packet_timestamps',
        packets:pts.length,
        tracks:(ff.streams||[]).map(z=>({kind:z.codec_type,codec:z.codec_name,w:z.width,h:z.height,duration:z.duration})),
        hasAudio:(ff.streams||[]).some(z=>z.codec_type==='audio'),
        hasVideo:(ff.streams||[]).some(z=>z.codec_type==='video')};
    }catch(e){report.ffprobe={error:String(e.message).slice(0,600)}}
    if(report.ffprobe?.hasAudio){
      // Decode the exported Opus to signed PCM, not just an empty audio
      // track declaration. The input video is mute: this signal comes from
      // the separately imported and mixed synthetic WAV tone.
      try{
        const raw=execFileSync('ffmpeg',['-nostdin','-v','error','-i',tmp,'-map','0:a:0',
          '-ac','1','-ar','16000','-f','s16le','pipe:1'],{timeout:20000,maxBuffer:4000000});
        const n=Math.floor(raw.length/2);
        let energy=0,peak=0;
        for(let i=0;i<n;i++){
          const sample=raw.readInt16LE(i*2)/32768;
          energy+=sample*sample;peak=Math.max(peak,Math.abs(sample));
        }
        const rms=n?Math.sqrt(energy/n):0;
        const rmsRange=(begin,end)=>{
          const lo=Math.floor(begin*16000),hi=Math.min(n,Math.floor(end*16000));
          let energy=0;for(let j=lo;j<hi;j++){
            const v=raw.readInt16LE(j*2)/32768;energy+=v*v;
          }
          return hi>lo?+Math.sqrt(energy/(hi-lo)).toFixed(5):null;
        };
        const windows=[0,0.05,0.10,0.15,0.25,0.5,0.8,1.0,1.15]
          .map(start=>({start,rms:rmsRange(start,start+0.05)}));
        const firstLoud=windows.find(w=>w.rms!==null && w.rms>0.045)?.start??null;
        report.decodedAudio={samples:n,seconds:n/16000,rms:+rms.toFixed(5),
          peak:+peak.toFixed(5),nonSilent:rms>0.01,expectedAudioStart:0.12,
          rmsWindows50ms:windows,firstLoudWindowStart:firstLoud};
      }catch(e){report.decodedAudio={error:String(e.message).slice(0,550)}}
    }
  }
  // Distinct source scenes must survive both seek operations. Compare
  // source-independent pixels away from the title overlay (not OCR).
  if(result.syntheticBinaryBase64){
    const last=report.cases.find(z=>z.label==='recordProject_result');
    const tmp='/tmp/wivra-export-roundtrip.'+last.ext;
    const sample=(second)=>{
      const pixel=execFileSync('ffmpeg',['-nostdin','-v','error','-i',tmp,'-ss',String(second),
        '-frames:v','1','-vf','crop=20:20:10:200,scale=1:1',
        '-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{timeout:20000,maxBuffer:200000});
      if(pixel.length<3)throw new Error('No frame decoded at '+second);
      return [pixel[0],pixel[1],pixel[2]];
    };
    try{
      const first=sample(0.20),second=sample(0.94);
      report.sceneColors={firstAt0_20_RGB:first,secondAt0_94_RGB:second,
        firstIsOrange:first[0]>first[2]+35,
        secondIsBlue:second[2]>second[0]+35};
    }catch(e){report.sceneColors={error:String(e.message).slice(0,550)}}
  }
  // Read the SAME synthetic output using Mediabunny as a comparison.
  // Mediabunny is temporary CI-only and is never bundled in Wivra.
  if(result.syntheticBinaryBase64){
    try{
      const mb=require('/tmp/wivra-media-lab/node_modules/mediabunny');
      const binary=Buffer.from(result.syntheticBinaryBase64,'base64');
      const input=new mb.Input({source:new mb.BlobSource(new Blob([binary],{type:'video/webm'})),formats:mb.ALL_FORMATS});
      const [duration,video,audio]=await Promise.all([
        input.computeDuration(),input.getPrimaryVideoTrack(),input.getPrimaryAudioTrack()
      ]);
      report.mediabunny={
        version:'1.61.6',licensed:'MPL-2.0',
        duration,hasVideo:!!video,hasAudio:!!audio,
        w:video?await video.getDisplayWidth():null,
        h:video?await video.getDisplayHeight():null,
        audioHz:audio?await audio.getSampleRate():null,
        audioChannels:audio?await audio.getNumberOfChannels():null
      };
    }catch(e){report.mediabunny={version:'1.61.6',error:String(e.stack||e).slice(0,800)}}
  }
  console.log(JSON.stringify(report,null,2));
  writeFileSync('wivra-export-browser-roundtrip.json',JSON.stringify(report,null,2)+'\n');
  const last=report.cases.find(x=>x.label==='recordProject_result');
  if(!last||!last.decoded||last.bytes<1000||!(last.w>0)||last.hasAudio!==true)process.exitCode=1;
  if(!report.ffprobe?.hasAudio || !report.ffprobe?.hasVideo)process.exitCode=1;
  if(!report.mediabunny?.hasAudio || !report.mediabunny?.hasVideo)process.exitCode=1;
  if(!report.decodedAudio?.nonSilent)process.exitCode=1;
  // Wivra's mic starts 120 ms after video. Prove the export does not move
  // independent voice to time zero, without assuming sample-accurate WebView
  // scheduling from Linux CI.
  const w=report.decodedAudio?.rmsWindows50ms||[];
  const bin=(t)=>w.find(x=>Math.abs(x.start-t)<0.00001)?.rms;
  if(!(bin(0)<0.015 && bin(0.05)<0.015 && bin(0.25)>0.06
    && report.decodedAudio.firstLoudWindowStart>=0.05
    && report.decodedAudio.firstLoudWindowStart<=0.2))process.exitCode=1;
  if(report.decodedAudio?.seconds<1.10)process.exitCode=1;
  if(!report.sceneColors?.firstIsOrange||!report.sceneColors?.secondIsBlue)process.exitCode=1;
  if(!(report.cases.find(x=>x.label==='title_draw_attempts')?.count>0))process.exitCode=1;
  if(Math.abs(report.mediabunny.duration-report.ffprobe.duration)>0.3)process.exitCode=1;
  if(last?.ext==='webm' && !String(report.ffprobe?.format).includes('webm'))process.exitCode=1;
  if(last?.ext==='mp4' && !String(report.ffprobe?.format).includes('mp4'))process.exitCode=1;
  if(!(report.ffprobe?.duration>0.7 && report.ffprobe?.duration<2.4))process.exitCode=1;
  const overrun=report.cases.find(x=>x.label==='source_video_overrun_must_reject');
  // Local generated WebM has unknown (Infinity) duration, so its correct
  // guard is HTMLMediaElement.ended, not metadata. Both guard paths are valid.
  if(!overrun?.rejected ||
     !/El video original termin(a|ó) antes/.test(overrun.reason || '') ||
     !/s sin imagen/.test(overrun.reason || ''))process.exitCode=1;
  const safety=report.cases.find(x=>x.label==='missing_WAV_must_fail_closed');
  if(!safety||!safety.blocked)process.exitCode=1;
  const shortSafety=report.cases.find(x=>x.label==='short_WAV_must_fail_closed');
  if(!shortSafety?.blocked||shortSafety.shortAudio?.length!==1
     ||shortSafety.missingAudio?.length!==0
     ||shortSafety.shortAudio[0].secondsLost<0.7)process.exitCode=1;
  await page.close();
 }finally{await browser.close()}
})().catch(e=>{report.error=String(e.stack||e);writeFileSync('wivra-export-browser-roundtrip.json',JSON.stringify(report,null,2)+'\n');console.error(e);process.exitCode=1}).finally(()=>server.close());
