// Real Chromium/WebCodecs + Mediabunny export of an ANIMATED GIF, decoded by
// the editor's own app/gif.mjs, as the main clip and as an overlay offset by
// 0.5 s (separate canvas slot). ffmpeg checks both regions over time.
// Linux software test, NOT a phone WebView or H.264/AAC proof. — Claude
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http'),{execFileSync}=require('node:child_process');
let chromium;
// Prefer the pinned media lab (CI layout); fall back to a global install.
try {chromium=require(require('./media-lab.cjs').LAB+'/node_modules/playwright').chromium;}
catch {chromium=require('playwright').chromium;}
const root=path.resolve(__dirname,'..');
const mbDir=[require('./media-lab.cjs').LAB+'/node_modules/mediabunny/dist/bundles',
 path.join(root,'node_modules/mediabunny/dist/bundles')]
 .find(x=>fs.existsSync(path.join(x,'mediabunny.mjs')));
if(!mbDir)throw Error('Pinned Mediabunny 1.61.6 is required.');
const ffmpeg=args=>execFileSync('ffmpeg',['-nostdin','-v','error','-y',...args],{timeout:30000});
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wivra-gif-acc-'));
const gifFile=path.join(dir,'anim.gif');
// Two frames of 0.5 s each: red then blue, looping.
ffmpeg(['-f','lavfi','-i','color=c=red:s=160x120:r=2:d=0.5','-f','lavfi','-i','color=c=blue:s=160x120:r=2:d=0.5',
 '-filter_complex','[0][1]concat=n=2:v=1,split[a][b];[a]palettegen[p];[b][p]paletteuse','-loop','0',gifFile]);
const srv=http.createServer((req,res)=>{
 const target=new URL(req.url,'http://127.0.0.1').pathname;
 const file=target==='/anim.gif'?gifFile:target.startsWith('/mb/')?
  path.join(mbDir,path.basename(target)):
  /^\/(app|core)\//.test(target)?path.resolve(root,'.'+target):null;
 if(!file||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':target.endsWith('.gif')?'image/gif':'text/javascript','Cache-Control':'no-store'});
 fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+srv.address().port;
 const browser=await chromium.launch({headless:true});
 const file=path.join(dir,'gif.out');
 let handle=fs.openSync(file,'w+'),high=0;
 try{
  const page=await browser.newPage();
  page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
  await page.exposeFunction('__writeAt',({position,data})=>{
   const bytes=Buffer.from(data,'base64');
   fs.writeSync(handle,bytes,0,bytes.length,position);
   high=Math.max(high,position+bytes.length);return bytes.length;
  });
  await page.goto(base+'/app/export.mjs');
  const result=await page.evaluate(async()=>{
   const M=await import('/mb/mediabunny.mjs');
   const {decodeGif}=await import('/app/gif.mjs');
   const {prepareAcceleratedMultitrack,renderAcceleratedMultitrack}
    =await import('/app/accelerated-multitrack-renderer.mjs');
   const gif=decodeGif(new Uint8Array(await (await fetch('/anim.gif')).arrayBuffer()));
   const project={clips:[{id:'main',asset_id:'g',start:0,in:0,out:2}],
    overlayClips:[{id:'sticker',asset_id:'g',start:0,in:.5,out:2.5,track:1,x:.25,y:.25,scale:.4}],
    audioClips:[],texts:[],format:{aspect:'original'}};
   const media={g:{kind:'image',url:'/anim.gif',w:gif.w,h:gif.h,gif,mime:'image/gif'}};
   const prepared=await prepareAcceleratedMultitrack({project,media,M,platform:'qa',expectedAudio:false});
   const writeAt=(position,bytes)=>{let raw='';
    for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return window.__writeAt({position,data:btoa(raw)});};
   const r=await renderAcceleratedMultitrack({prepared,writeAt,fps:30});
   return {...r,gifFrames:gif.frames.length,delays:gif.frames.map(f=>f.delay)};
  });
  fs.closeSync(handle);handle=null;
  const out=path.join(dir,'gif.'+result.container);fs.renameSync(file,out);
  const rgbAt=(t,x,y)=>[...ffmpeg(['-ss',String(t),'-i',out,'-frames:v','1',
   '-vf','crop=4:4:'+x+':'+y+',scale=1:1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'])];
  const color=rgb=>rgb[0]>rgb[2]+60?'red':rgb[2]>rgb[0]+60?'blue':'other';
  const samples=[[.25,'red','blue'],[.75,'blue','red'],[1.25,'red','blue'],[1.75,'blue','red']].map(([t,main,overlay])=>{
   const m=rgbAt(t,130,100),o=rgbAt(t,38,28);
   return {t,main:color(m),overlay:color(o),wantMain:main,wantOverlay:overlay,m,o};
  });
  const report={scope:'Linux Chromium accelerated GIF main + offset overlay, no phone',
   engine:result.engine,container:result.container,videoCodec:result.videoCodec,
   videoFrames:result.videoFrames,gifFrames:result.gifFrames,delays:result.delays,bytes:high,samples};
  report.pass=result.videoFrames===60&&samples.every(s=>s.main===s.wantMain&&s.overlay===s.wantOverlay);
  fs.writeFileSync('wivra-accelerated-gif.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(!report.pass)throw Error('Accelerated GIF frames do not follow source time.');
 }finally{
  if(handle!==null)fs.closeSync(handle);
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;})
 .finally(()=>{srv.close();fs.rmSync(dir,{recursive:true,force:true});});
