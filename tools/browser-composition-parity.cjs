// W50: actual 1080p output against the existing compositor and known PCM signals.
// Synthetic Linux/Chromium evidence only; no mobile/device/production claim.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {chromium}=require('/tmp/wivra-media-lab/node_modules/playwright');
const spatial=process.argv.includes('--spatial');
const root=path.resolve(__dirname,'..');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wivra-composition-'));
const mbDir='/tmp/wivra-media-lab/node_modules/mediabunny/dist/bundles';
assert.equal(require('/tmp/wivra-media-lab/node_modules/mediabunny/package.json').version,'1.61.6');
const files={};
function ffmpeg(args){return execFileSync('ffmpeg',['-nostdin','-v','error','-y',...args],
 {timeout:60000,maxBuffer:16*1024*1024});}
function colors(name,entries){
 const target=path.join(tmp,name),args=[];
 for(const [color,duration]of entries)args.push('-f','lavfi','-i',
  'color=c='+color+':s=960x540:r=30:d='+duration);
 args.push('-filter_complex',entries.map((_,i)=>'['+i+':v]').join('')+
  'concat=n='+entries.length+':v=1:a=0[v]','-map','[v]',
  '-an','-c:v','libvpx','-b:v','500k',target);
 ffmpeg(args);files['/'+name]=target;
}
colors('first.webm',[['0xa16207',.5],['0x0369a1',.5],['0x16a34a',1],['0x9333ea',2]]);
colors('second.webm',[['0x16a34a',1],['0x9333ea',3]]);
for(const [name,hz]of [['voice',880],['music',220],['muted',3300]]){
 const target=path.join(tmp,name+'.wav');
 ffmpeg(['-f','lavfi','-i','sine=frequency='+hz+':sample_rate=48000:duration=4',
  '-c:a','pcm_s16le',target]);files['/'+name+'.wav']=target;
}
const still=path.join(tmp,'still.svg');
fs.writeFileSync(still,'<svg xmlns="http://www.w3.org/2000/svg" width="96" height="64"><rect width="96" height="64" fill="#fef08a"/></svg>');
files['/still.svg']=still;
const server=http.createServer((req,res)=>{
 let url;
 try{url=decodeURIComponent(new URL(req.url,'http://local').pathname);}
 catch{res.writeHead(400);res.end();return;}
 let file=files[url];
 if(url.startsWith('/mb/'))file=path.join(mbDir,path.basename(url));
 if(!file&&/^\/(app|core)\//.test(url)){
  file=path.resolve(root,'.'+url);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 }
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
 let browser,fd;
 const report={scope:'Synthetic Chromium/Linux, not mobile or physical QA',
  mediabunny:'1.61.6',width:1920,height:1080,fps:30};
 const target=path.join(tmp,'output.bin');
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
  const page=await browser.newPage();
  fd=fs.openSync(target,'w+');
  let high=0,writes=0;
  await page.exposeFunction('__writeAt',(position,b64)=>{
   const bytes=Buffer.from(b64,'base64');
   assert.equal(fs.writeSync(fd,bytes,0,bytes.length,position),bytes.length);
   high=Math.max(high,position+bytes.length);writes++;
   return bytes.length;
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/app/export.mjs');
  report.server=await page.evaluate(async()=>({
   traversal:(await fetch('/app/%2e%2e%2f%2e%2e%2fAGENTS.md')).status,
   malformed:(await fetch('/app/%zz')).status
  }));
  assert.deepEqual(report.server,{traversal:403,malformed:400});
  await page.addScriptTag({url:'http://127.0.0.1:'+server.address().port+'/app/filters-gl.mjs'});
  if(spatial){
   const exercise=require('./composition-spatial-case.cjs');
   report.spatial=exercise.verifyCase(await page.evaluate(exercise.browserCase),{tmp,ffmpeg});
   delete report.width;delete report.height;report.pass=true;
   console.log(JSON.stringify(report,null,2));return;
  }
  const data=await page.evaluate(async()=>{
   const M=await import('/mb/mediabunny.mjs');
   const {prepareAcceleratedMultitrack:prepare,renderAcceleratedMultitrack:render}=
    await import('/app/accelerated-multitrack-renderer.mjs');
   const {drawFrame}=await import('/app/export.mjs');
   const {clipLength,srcTime}=await import('/core/project.mjs');
   const media={
    a:{kind:'video',url:'/first.webm',w:960,h:540,duration:4},
    b:{kind:'video',url:'/second.webm',w:960,h:540,duration:4},
    voice:{kind:'audio',url:'/voice.wav',duration:4},
    music:{kind:'audio',url:'/music.wav',duration:4},
    muted:{kind:'audio',url:'/muted.wav',duration:4},
    still:{kind:'image',url:'/still.svg',w:96,h:64}
   };
   const project={format:{aspect:'16:9',fit:'cover'},
    clips:[{id:'slow',asset_id:'a',start:0,in:0,out:1,speed:.5,
      fxIn:'fade',fxOut:'slide',fxDur:.2},
     {id:'fast',asset_id:'b',start:2.2,in:0,out:2,speed:2,
      fxIn:'zoom',fxOut:'fade',fxDur:.2}],
    overlayClips:[{id:'inset',asset_id:'a',start:.2,in:1.2,out:2.2,
      x:.25,y:.3,scale:.25,opacity:.8,zoom:1.2,px:.5,py:.5,track:1,muted:true},
     {id:'circle',asset_id:'still',start:2.25,in:0,out:.8,
      x:.75,y:.4,scale:.2,opacity:.8,shape:'circle',frame:.02,
      frameColor:'#ffffff',zoom:1.2,px:.5,py:.5,track:2}],
    audioClips:[{id:'music',asset_id:'music',start:0,in:0,out:3.2,volume:.25},
     {id:'voiceSlow',asset_id:'voice',start:.4,in:.2,out:1,speed:.5,volume:.5},
     {id:'voiceFast',asset_id:'voice',start:2.2,in:.2,out:2.2,speed:2,volume:.5},
     {id:'muted',asset_id:'muted',start:0,in:0,out:3.2,muted:true}],
    texts:[{id:'caption',text:'Wivra 1080p',start:.3,end:1.8,
      pos:'bottom',size:'l',color:'#ffffff',box:'#111111'}]};
   const base64=bytes=>{
    let s='';for(let i=0;i<bytes.length;i+=16384)
     s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);
   };
   // Fresh sinks per reference layer avoid depending on the accelerator's
   // source lookup and pool allocation. Only the stable drawFrame is shared.
   const references=[];
   const markers=[.1,.5,.9,1.5,1.9,2.1,2.3,2.5,2.9,3.1];
   for(const t of markers){
    const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;
    const inputs=[];
    const visual=async c=>{
     const asset=media[c.asset_id];let raw;
     if(asset.kind==='image'){
      raw=new Image();raw.src=asset.url;await raw.decode();
      Object.defineProperties(raw,{videoWidth:{value:raw.naturalWidth},videoHeight:{value:raw.naturalHeight}});
     }else{
      const input=new M.Input({source:new M.UrlSource(asset.url),formats:M.ALL_FORMATS});inputs.push(input);
      const track=await input.getPrimaryVideoTrack();
      const sink=new M.CanvasSink(track,{width:960,height:540,poolSize:1,fit:'contain'});
      raw=(await sink.getCanvas(srcTime(c,t))).canvas;
      Object.defineProperties(raw,{videoWidth:{value:raw.width},videoHeight:{value:raw.height}});
     }
     return raw;
    };
    try{
     const active=c=>t>=c.start&&t<c.start+clipLength(c);
     const main=project.clips.find(active),overlays=[];
     const frame=main?await visual(main):null;
     for(const c of project.overlayClips.filter(active))overlays.push({c,el:await visual(c)});
     const g=canvas.getContext('2d');drawFrame(g,1920,1080,frame,project,t,overlays);
     const rgba=g.getImageData(0,0,1920,1080).data,samples=[];
     for(let y=8;y<1080;y+=16)for(let x=8;x<1920;x+=16){
      const p=(y*1920+x)*4;samples.push(rgba[p],rgba[p+1],rgba[p+2]);
     }
     references.push({t,rgb:base64(new Uint8Array(samples))});
    }finally{for(const input of inputs)input.dispose();}
   }
   const started=performance.now();
   const prepared=await prepare({project,media,M,platform:'qa',expectedAudio:true});
   const result=await render({prepared,fps:30,sampleRate:48000,
    writeAt:(position,bytes)=>window.__writeAt(position,base64(bytes))});
   const failures=[];
   for(const mode of ['cancel','write']){
    let created=0,disposed=0,cancelled=0,stop=false;
    const SDK={...M,
     Input:class extends M.Input{constructor(...args){super(...args);created++;}dispose(){disposed++;super.dispose();}},
     Output:class extends M.Output{async cancel(){cancelled++;return super.cancel();}}};
    const p=await prepare({project,media,M:SDK,platform:'qa',expectedAudio:true});
    let error='';
    try{await render({prepared:p,fps:30,isCancelled:()=>stop,
     onProgress:()=>{if(mode==='cancel')stop=true;},
     writeAt:async()=>{throw Error('injected writer failure');}});}
    catch(e){error=String(e);}
    failures.push({mode,error,created,disposed,cancelled});
   }
   const {filterRGB}=await import('/core/filters.mjs');
   const {createBoundedRandomMemoryWriter}=await import('/app/accelerated-memory-export.mjs');
   const source=document.createElement('canvas');source.width=96;source.height=64;
   const sg=source.getContext('2d');sg.fillStyle='rgb(96,64,32)';sg.fillRect(0,0,96,64);
   const filter={brightness:.2,contrast:.1,saturation:-.2,warmth:.3,sepia:.4,fade:.1,vignette:.3};
   const healthy=globalThis.fxRender(source,filter,0);
   if(!healthy)throw Error('Real WebGL unavailable: filter parity must not silently skip');
   const sample=document.createElement('canvas');sample.width=96;sample.height=64;
   const cg=sample.getContext('2d');cg.drawImage(healthy,0,0);
   const gpuPixel=[...cg.getImageData(48,32,1,1).data].slice(0,3);
   const cpuPixel=filterRGB([96/255,64/255,32/255],filter,[.5,.5]).map(v=>Math.round(v*255));
   const formats=[];
   for(const aspect of ['9:16','4:5','1:1']){
    const f={brightness:.2,sepia:.4};
    const p={format:{aspect,fit:'cover',safe:true},
     clips:[{id:'photo',asset_id:'still',start:0,in:0,out:.2,filter:f}],
     overlayClips:[],audioClips:[],texts:[{id:'title',text:'SAFE',start:0,end:.2,pos:'bottom'}]};
    const prepared=await prepare({project:p,media,M,platform:'qa',expectedAudio:false});
    const writer=createBoundedRandomMemoryWriter();
    const stats=await render({prepared,fps:30,writeAt:(pos,bytes)=>writer.writeAt(pos,bytes)});
    formats.push({aspect,stats,bytes:base64(writer.finalize()),
     expected:filterRGB([254/255,240/255,138/255],f,[.5,.5]).map(v=>Math.round(v*255))});
   }
   const originalFx=globalThis.fxRender;let lost=false,cancelled=0,disposed=0,finalized=0;
   const SDK={...M,
    Input:class extends M.Input{dispose(){disposed++;super.dispose();}},
    Output:class extends M.Output{async cancel(){cancelled++;return super.cancel();}async finalize(){finalized++;return super.finalize();}}};
   const p={format:{aspect:'16:9'},clips:[{id:'main',asset_id:'a',start:0,in:0,out:.2,filter:{warmth:.3}}],
    overlayClips:[],audioClips:[],texts:[]};
   const preparedLoss=await prepare({project:p,media,M:SDK,platform:'qa',expectedAudio:false});
   globalThis.fxRender=(...args)=>{
    const canvas=originalFx(...args),gl=canvas.getContext('webgl');
    const ext=gl.getExtension('WEBGL_lose_context');
    if(!ext)throw Error('WEBGL_lose_context unavailable');
    ext.loseContext();lost=gl.isContextLost();
    return originalFx(...args);
   };
   let lossError='';
   try{await render({prepared:preparedLoss,fps:30,writeAt:async(pos,bytes)=>bytes.length});}
   catch(e){lossError=String(e);}finally{globalThis.fxRender=originalFx;}
   return {result,references,failures,exerciseSeconds:(performance.now()-started)/1000,
    gpu:{gpuPixel,cpuPixel,loss:{lost,error:lossError,cancelled,disposed,finalized}},formats};
  });
  fs.closeSync(fd);fd=null;
  report.result=data.result;report.failures=data.failures;
  report.exerciseSeconds=data.exerciseSeconds;report.bytes=high;report.writes=writes;
  for(const f of data.failures){
   assert.match(f.error,f.mode==='cancel'?/cancelled/:/injected writer failure/);
   assert.equal(f.created,f.disposed);assert.equal(f.cancelled,1);
  }
  const actual=path.join(tmp,'output.'+data.result.container);fs.renameSync(target,actual);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_entries',
   'format=duration:stream=codec_type,codec_name,width,height','-of','json',actual],{encoding:'utf8'}));
  report.probe=probe;
  const video=probe.streams.find(s=>s.codec_type==='video');
  assert.equal(video.width,1920);assert.equal(video.height,1080);
  assert.ok(probe.streams.some(s=>s.codec_type==='audio'));
  assert.ok(Math.abs(Number(probe.format.duration)-3.2)<.08);
  assert.equal(data.result.videoFrames,96);
  report.frames=[];report.colors={};
  for(const ref of data.references){
   const frame=ffmpeg(['-ss',String(ref.t),'-i',actual,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
   const pixel=(x,y)=>[...frame.subarray((y*1920+x)*3,(y*1920+x)*3+3)];
   report.colors[String(ref.t)]=pixel(100,100);
   if(ref.t===.5){const inset=pixel(480,324);report.colors.inset=inset;assert.ok(inset[1]>inset[0]+30&&inset[1]>inset[2]+30);}
   const expected=Buffer.from(ref.rgb,'base64');let index=0,sum=0,bad=0;
   for(let y=8;y<1080;y+=16)for(let x=8;x<1920;x+=16){
    const p=(y*1920+x)*3;
    for(let c=0;c<3;c++){const diff=Math.abs(frame[p+c]-expected[index++]);sum+=diff;if(diff>30)bad++;}
   }
   const mae=sum/index,badFraction=bad/index;
   report.frames.push({t:ref.t,mae,badFraction});
   assert.ok(mae<8&&badFraction<.03,'compositor mismatch at '+ref.t+': '+JSON.stringify({mae,badFraction}));
  }
  const rgb=report.colors;
  assert.ok(rgb['0.5'][0]>rgb['0.5'][2]+40); // slow source before its color switch
  assert.ok(rgb['1.5'][2]>rgb['1.5'][0]+40&&rgb['1.5'][2]>rgb['1.5'][1]+30); // 0.5x source reaches blue later
  assert.ok(rgb['2.1'].every(v=>v<15)); // actual video gap, music continues
  assert.ok(rgb['2.5'][1]>rgb['2.5'][0]+40&&rgb['2.5'][1]>rgb['2.5'][2]+30); // second source at 2x, green
  assert.ok(rgb['2.9'][0]>rgb['2.9'][1]+40&&rgb['2.9'][2]>rgb['2.9'][1]+40); // then purple
  const pcm=ffmpeg(['-i',actual,'-map','0:a:0','-ac','1','-ar','48000','-f','f32le','pipe:1']);
  // Independent sine projection measures authored rates and muted-track loss.
  function band(a,b,hz){
   let re=0,im=0;const start=Math.round(a*48000),end=Math.round(b*48000);
   for(let i=start;i<end;i++){const v=pcm.readFloatLE(i*4),phase=2*Math.PI*hz*i/48000;re+=v*Math.cos(phase);im+=v*Math.sin(phase);}
   return Math.sqrt(re*re+im*im)*2/(end-start);
  }
  report.audio={slowBefore:band(.1,.3,440),slowVoice:band(.6,.9,440),
   fastVoice:band(2.5,2.8,1760),voiceGap:band(2.02,2.18,440),
   musicStart:band(.1,.3,220),musicTail:band(2.9,3.1,220),muted:band(.6,.9,3300)};
  assert.ok(report.audio.slowBefore<.005&&report.audio.slowVoice>.04);
  assert.ok(report.audio.fastVoice>.04&&report.audio.voiceGap<.005);
  assert.ok(report.audio.musicStart>.02&&report.audio.musicTail>.02&&report.audio.muted<.005);
  const gainRatio=report.audio.slowVoice/report.audio.musicStart;
  assert.ok(Math.abs(gainRatio-2)<.15,'authored mic/music volume ratio changed');
  assert.ok(Math.abs(report.audio.fastVoice/report.audio.slowVoice-1)<.1);
  report.gpu=data.gpu;
  for(let i=0;i<3;i++)assert.ok(Math.abs(data.gpu.gpuPixel[i]-data.gpu.cpuPixel[i])<=3);
  assert.equal(data.gpu.loss.lost,true);
  assert.match(data.gpu.loss.error,/GPU filter failed/);
  assert.equal(data.gpu.loss.cancelled,1);assert.equal(data.gpu.loss.disposed,1);
  assert.equal(data.gpu.loss.finalized,0);
  report.formats=[];
  for(const f of data.formats){
   const file=path.join(tmp,f.aspect.replace(':','-')+'.'+f.stats.container);
   fs.writeFileSync(file,Buffer.from(f.bytes,'base64'));
   const frame=ffmpeg(['-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
   const at=(10*f.stats.width+10)*3,actual=[...frame.subarray(at,at+3)];
   const size={'9:16':[1080,1920],'4:5':[1080,1350],'1:1':[1080,1080]}[f.aspect];
   assert.deepEqual([f.stats.width,f.stats.height],size);
   assert.equal(frame.length,size[0]*size[1]*3);
   assert.equal(f.stats.videoFrames,6);
   for(let i=0;i<3;i++)assert.ok(Math.abs(actual[i]-f.expected[i])<10,'GPU export color mismatch');
   report.formats.push({aspect:f.aspect,width:f.stats.width,height:f.stats.height,actual,expected:f.expected});
  }
  report.pass=true;
 }finally{
  if(fd!==undefined&&fd!==null)fs.closeSync(fd);
  await browser?.close();
  await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(root,spatial?'wivra-composition-spatial.json':'wivra-composition-parity.json'),JSON.stringify(report,null,2)+'\n');
 }
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
