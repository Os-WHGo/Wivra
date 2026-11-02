// Isolated Linux Chromium proof of REAL multi-lane WebCodecs/Mediabunny render.
// Two independently decoded scenes, still overlay, caption and 440 Hz WAV
// voice delayed by 120ms, random-access MP4/WebM and ffprobe PCM inspection.
// NOT Android/iPhone WebView, Ray-Ban or a long-form hardware guarantee.
let chromium;
try {chromium=require('playwright').chromium;}
catch {chromium=require('/tmp/wivra-media-lab/node_modules/playwright').chromium;}
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http');
const {execFileSync}=require('node:child_process');
const gap=process.argv.includes('--gap');
const duck=process.argv.includes('--duck');
const minute=process.argv.includes('--minute');
const twoMinute=process.argv.includes('--two-minute');
const threeMinute=process.argv.includes('--three-minute');
const longSoakMinutes=Number(process.env.WIVRA_LONG_QA_MINUTES||0);
if(![0,10,20,30,60].includes(longSoakMinutes))
 throw Error('Long accelerated QA supports 10/20/30/60 minutes only.');
const longSoak=longSoakMinutes>0;
const long=process.argv.includes('--long');
const extended=longSoak||threeMinute||twoMinute||minute||long||process.argv.includes('--stress');
const seconds=longSoak?longSoakMinutes*60:threeMinute?180:twoMinute?120:minute?60:long?30:extended?10:gap?1.25:1.2;
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(
  path.join(os.tmpdir(),'wivra-multitrack-'));
const mbDir=['/tmp/wivra-media-lab/node_modules/mediabunny/dist/bundles',
  path.join(root,'node_modules/mediabunny/dist/bundles')]
  .find(dir=>fs.existsSync(path.join(dir,'mediabunny.mjs')));
if(!mbDir)throw Error('Pinned Mediabunny browser build missing.');
const files={};
function ffmpeg(args){execFileSync('ffmpeg',['-nostdin','-v','error','-y',...args],
  {timeout:45000});}
for(const [name,color] of [['first.webm','0xa16207'],['second.webm','0x0369a1']]){
 const target=path.join(tmp,name);
 ffmpeg(['-f','lavfi','-i','color=c='+color+':s=320x240:r=30:d='+(longSoak?seconds/120+1:2.2),
  '-an','-c:v','libvpx','-b:v','350k',target]);
 files['/'+name]=target;
}
const wav=path.join(tmp,'mic.wav');
ffmpeg(['-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2',
  '-c:a','pcm_s16le',wav]);
files['/mic.wav']=wav;
// Isolated 220Hz bed plus silent authored narration: the final PCM must
// show actual attenuation, not a changed wave amplitude from the speaker.
const bed=path.join(tmp,'bed.wav'),silent=path.join(tmp,'silent-voice.wav');
ffmpeg(['-f','lavfi','-i','sine=frequency=220:sample_rate=48000:duration=2',
  '-c:a','pcm_s16le',bed]);
ffmpeg(['-f','lavfi','-i','anullsrc=r=48000:cl=mono:d=0.5',
  '-c:a','pcm_s16le',silent]);
files['/bed.wav']=bed;files['/silent-voice.wav']=silent;
const still=path.join(tmp,'overlay.svg');
fs.writeFileSync(still,
  '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#fef08a"/></svg>');
files['/overlay.svg']=still;
const server=http.createServer((req,res)=>{
 const url=decodeURIComponent(new URL(req.url,'http://local').pathname);
 let file=files[url];
 if(url.startsWith('/mb/'))file=path.join(mbDir,path.basename(url));
 if(!file&&/^\/(app|core)\//.test(url))
  file=path.resolve(root,'.'+url);
 if(!file||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 const mime=file.endsWith('.webm')?'video/webm':
  file.endsWith('.wav')?'audio/wav':file.endsWith('.svg')?'image/svg+xml':
  'text/javascript';
 const stat=fs.statSync(file),range=req.headers.range;
 if(range){
  const match=/^bytes=(\d+)-(\d*)$/.exec(range);
  if(!match){res.writeHead(416);res.end();return;}
  const lo=Number(match[1]),hi=match[2]?Number(match[2]):stat.size-1;
  if(lo>hi||hi>=stat.size){res.writeHead(416);res.end();return;}
  res.writeHead(206,{'Content-Type':mime,'Content-Length':hi-lo+1,
   'Content-Range':'bytes '+lo+'-'+hi+'/'+stat.size,
   'Accept-Ranges':'bytes'});
  fs.createReadStream(file,{start:lo,end:hi}).pipe(res);
 }else{
  res.writeHead(200,{'Content-Type':mime,'Content-Length':stat.size,
   'Accept-Ranges':'bytes','Cache-Control':'no-store'});
  fs.createReadStream(file).pipe(res);
 }
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,
  args:['--autoplay-policy=no-user-gesture-required']});
 const report={type:'Wivra synthetic multitrack accelerated QA',
  scope:'Chromium Linux software media, not physical Android/iOS/Meta',
  mediabunny:'pinned 1.61.6',projectSeconds:seconds,
  profile:longSoak?(longSoakMinutes+'min 120-cut 30-voice long accelerated soak'):duck?'1.2s sample-accurate authored voice ducking':gap?'1.25s gap-preserving accelerated timeline':threeMinute?'180s 120-cut 30-voice accelerated soak':twoMinute?'120s 120-cut 30-voice accelerated soak':minute?'60s 120-cut 30-voice accelerated soak':long?'30s 60-cut 15-mic audio soak':
    extended?'10s repeated-cut multitrack soak':'1.2s scene-mix parity'};
 const target=path.join(tmp,'multitrack.mp4');
 let fd,writeCount=0,highWater=0;
 try {
  fd=fs.openSync(target,'w+');
  const page=await browser.newPage();
  page.on('console',m=>{if(m.type()==='error')
    process.stderr.write('BROWSER: '+m.text()+'\n');});
  await page.exposeFunction('__writeAt',(position,b64)=>{
   const bytes=Buffer.from(b64,'base64');
   fs.writeSync(fd,bytes,0,bytes.length,position);
   highWater=Math.max(highWater,position+bytes.length);
   writeCount++;
   return bytes.length;
  });
  await page.goto(base+'/app/export.mjs');
  report.browser=await page.evaluate(async({extended,long,minute,twoMinute,threeMinute,gap,duck,longSoak,seconds})=>{
   const M=await import('/mb/mediabunny.mjs');
   const {prepareAcceleratedMultitrack,renderAcceleratedMultitrack}=
    await import('/app/accelerated-multitrack-renderer.mjs');
   const assets={
    first:{kind:'video',url:'/first.webm',w:320,h:240,duration:longSoak?seconds/120+1:2.2},
    second:{kind:'video',url:'/second.webm',w:320,h:240,duration:longSoak?seconds/120+1:2.2},
    mic:{kind:'audio',url:'/mic.wav',duration:2},
    bed:{kind:'audio',url:'/bed.wav',duration:2},
    silentVoice:{kind:'audio',url:'/silent-voice.wav',duration:.5},
    logo:{kind:'image',url:'/overlay.svg',w:48,h:48}
   };
   const project={
    clips:extended?Array.from({length:longSoak||threeMinute||twoMinute?120:minute?120:long?60:20},(_,i)=>({
      id:'part'+i,asset_id:i%2?'second':'first',
      start:i*(longSoak?seconds/120:threeMinute?1.5:twoMinute?1:.5),in:0,out:longSoak?seconds/120:threeMinute?1.5:twoMinute?1:.5
    })):[
     {id:'a',asset_id:'first',start:0,in:0,out:.6},
     {id:'b',asset_id:'second',start:gap?.75:.6,in:.5,out:gap?1:1.1}
    ],
    overlayClips:[{id:'logo',asset_id:'logo',start:.18,in:0,out:1,
      x:.5,y:.5,scale:.18,track:1,opacity:.9}],
    audioClips:duck?[
      {id:'bed',asset_id:'bed',start:0,in:0,out:1.2,
        role:'music',volume:1},
      {id:'voice',asset_id:'silentVoice',start:.35,in:0,out:.45,
        role:'voice_primary',ducking:.8,volume:1}
    ]:extended?Array.from({length:longSoak||threeMinute||twoMinute||minute?30:long?15:5},(_,i)=>({
      id:'voice'+i,asset_id:'mic',start:.12+(longSoak?seconds/30:threeMinute?6:twoMinute?4:2)*i,
      in:0,out:i===(longSoak||threeMinute||twoMinute||minute?29:long?14:4)?1.88:2,role:'voice_primary',volume:.75
    })):[{id:'voice',asset_id:'mic',start:.12,in:0,out:1.08,
      role:'voice_primary',volume:.75}],
    texts:[{id:'caption',text:'Wivra MULTITRACK',start:.35,end:.75,
      position:'middle'}],
    format:{aspect:'original',fit:'contain'}
   };
   const prepared=await prepareAcceleratedMultitrack({
    project,media:assets,M,platform:'qa',expectedAudio:true,
     ...(longSoak?{maxSeconds:seconds,longSoakQA:true}:{})
   });
   const started=performance.now();
   // Verify the editor's real text compositor drew at least one title.
   // No OCR or image screenshots; count actual Canvas2D operations.
   let drawnTitles=0;
   const originalFillText=CanvasRenderingContext2D.prototype.fillText;
   CanvasRenderingContext2D.prototype.fillText=function(...args){
    if(/Wivra|MULTITRACK/.test(String(args[0])))drawnTitles++;
    return originalFillText.apply(this,args);
   };
   const toBase64=(bytes)=>{
    let s='';
    for(let i=0;i<bytes.length;i+=16384)
     s+=String.fromCharCode(...bytes.subarray(i,i+16384));
    return btoa(s);
   };
   let result;
   try{
    result=await renderAcceleratedMultitrack({
     prepared,fps:30,sampleRate:48000,
     writeAt:(position,bytes)=>window.__writeAt(position,toBase64(bytes))
    });
   }finally{
    CanvasRenderingContext2D.prototype.fillText=originalFillText;
   }
   return {result,drawnTitles,renderSeconds:(performance.now()-started)/1000};
  },{extended,long,minute,twoMinute,threeMinute,gap,duck,longSoak,seconds});
  await page.close();
  fs.closeSync(fd);fd=null;
  report.nativeSimulated={writes:writeCount,bytes:highWater};
  const kind=report.browser.result.container;
  const ext=kind==='webm'?'webm':'mp4';
  const actual=path.join(tmp,'multitrack.'+ext);
  if(actual!==target)fs.renameSync(target,actual);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error',
   '-show_entries','format=duration,size,format_name:stream=codec_type,codec_name',
   '-of','json',actual],{encoding:'utf8',timeout:15000}));
  report.ffprobe={duration:Number(probe.format.duration),
   video:(probe.streams||[]).some(s=>s.codec_type==='video'),
   audio:(probe.streams||[]).some(s=>s.codec_type==='audio'),
   codecs:probe.streams?.map(s=>s.codec_type+':'+s.codec_name)};
  // A playable video is not sufficient for gallery/native recovery.
  // Inspect the SAME disk bytes with Wivra's local container parser, which
  // the native stores mirror with duration/seek-index gates.
  const {inspectExport}=await import('file://'+path.join(root,'app/media-container.mjs'));
  report.containerInspection=inspectExport(new Uint8Array(fs.readFileSync(actual)));
  const pixel=(time)=>{
   const data=execFileSync('ffmpeg',['-nostdin','-v','error','-ss',String(time),
    '-i',actual,'-frames:v','1','-vf','crop=20:20:10:10,scale=1:1',
    '-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{timeout:15000});
   if(data.length<3)throw Error('A frame could not be decoded at '+time);
   return [data[0],data[1],data[2]];
  };
  const first=pixel(.2),second=pixel(longSoak?seconds/120+.2:threeMinute?1.7:twoMinute?1.2:.95),gapRgb=gap?pixel(.68):null;
  report.scenes={firstRGB:first,secondRGB:second,gapRGB:gapRgb,
   preservedBlackGap:!gap||gapRgb.every(x=>x<30),
   firstOrange:first[0]>first[2]+25,
   secondBlue:second[2]>second[0]+25};
  const pcm=longSoak?null:execFileSync('ffmpeg',['-nostdin','-v','error','-i',actual,
   '-map','0:a:0','-ac','1','-ar','16000','-f','s16le','pipe:1'],
   {timeout:20000,maxBuffer:Math.ceil(seconds*16000*2+262144)});
  const rms=(a,b)=>{
   if(longSoak){
    const short=execFileSync('ffmpeg',['-nostdin','-v','error',
     '-ss',String(a),'-i',actual,'-t',String(b-a),
     '-map','0:a:0','-ac','1','-ar','16000','-f','s16le','pipe:1'],
     {timeout:20000,maxBuffer:65536});
    let sum=0;
    for(let i=0;i<short.length;i+=2){const v=short.readInt16LE(i)/32768;sum+=v*v;}
    return Math.sqrt(sum/Math.max(1,short.length/2));
   }
   const start=Math.round(a*16000),end=Math.min(pcm.length/2,Math.round(b*16000));
   let energy=0;
   for(let i=start;i<end;i++){const x=pcm.readInt16LE(i*2)/32768;energy+=x*x;}
   return Math.sqrt(energy/Math.max(1,end-start));
  };
  report.audio={beforeVoice:rms(0,.06),afterVoice:rms(.25,.4),
   tailVoice:extended?rms(longSoak?seconds*29/30+.25:threeMinute?175.25:twoMinute?116.25:minute?58.25:long?28.25:8.25,
     longSoak?seconds*29/30+.4:threeMinute?175.4:twoMinute?116.4:minute?58.4:long?28.4:8.4):null,
   recordedSeconds:pcm.length/2/16000};
  if(duck){
    report.audio.musicBefore=rms(.15,.25);
    report.audio.musicDucked=rms(.52,.65);
    report.audio.musicAfter=rms(1.0,1.12);
    if(!(report.audio.musicBefore>.04 &&
         report.audio.musicDucked<report.audio.musicBefore*.4 &&
         report.audio.musicAfter>report.audio.musicBefore*.7))
      throw Error('Encoded audio did not preserve authored voice ducking: '+
        JSON.stringify(report.audio));
  }
  if(report.containerInspection?.video!==true ||
     report.containerInspection?.audio!==true ||
     report.containerInspection?.declaresDuration!==true ||
     report.containerInspection?.seekIndex!==true)
    throw Error('Native gallery would reject media without duration/seek: '+
      JSON.stringify(report.containerInspection));
  // A continuous music bed is SUPPOSED to be audible at t=0. The older
  // no-music smoke must start silent; keep these gates distinct so a valid
  // encoded ducked file does not trip a pre-voice silence assertion.
  const audioEnvelopeOk=duck
    ? report.audio.beforeVoice>.04 && report.audio.afterVoice>.04
    : report.audio.beforeVoice<.02 && report.audio.afterVoice>.015;
  if(!report.ffprobe.video||!report.ffprobe.audio||
     !(report.ffprobe.duration>report.projectSeconds-.2&&
       report.ffprobe.duration<report.projectSeconds+.3) ||
     !report.scenes.firstOrange||!report.scenes.secondBlue||
     !report.scenes.preservedBlackGap||
     !audioEnvelopeOk ||
     (extended && !(report.audio.tailVoice>.015)) ||
     !(report.browser.drawnTitles>0) ||
     report.browser.result.audioBlocks<1||
     report.browser.result.videoFrames<30||
     report.browser.result.overlaysRendered<1||
     report.browser.result.verifiedOnDevice!==false ||
     highWater<1000 || writeCount<1)
    throw Error('Multitrack encoded video/audio/parity QA failed: '+JSON.stringify(report));
  console.log(JSON.stringify(report,null,2));
 }finally{
  if(fd!==null&&fd!==undefined)fs.closeSync(fd);
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(root,longSoak?('wivra-accelerated-soak-'+longSoakMinutes+'min.json'):duck?'wivra-multitrack-duck.json':gap?'wivra-multitrack-gap.json':threeMinute?'wivra-multitrack-three-minute.json':twoMinute?'wivra-multitrack-two-minute.json':minute?'wivra-multitrack-minute.json':long?'wivra-multitrack-long.json':extended?'wivra-multitrack-stress.json':'wivra-multitrack-accelerated.json'),
   JSON.stringify(report,null,2)+'\n');
  fs.rmSync(tmp,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
