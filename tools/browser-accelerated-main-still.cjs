// Real Chromium/WebCodecs test for a STILL PHOTO on the main video lane.
// Synthesizes video locally and checks the final decoded pixels with ffmpeg.
// This is a software test, NOT evidence of HEVC/Ray-Ban/iPhone compatibility.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const http=require('node:http'),{execFileSync}=require('node:child_process');
let chromium;
try {chromium=require('playwright').chromium;}
catch {chromium=require('/tmp/wivra-media-lab/node_modules/playwright').chromium;}
const root=path.resolve(__dirname,'..');
const mbDir=['/tmp/wivra-media-lab/node_modules/mediabunny/dist/bundles',
 path.join(root,'node_modules/mediabunny/dist/bundles')]
 .find(x=>fs.existsSync(path.join(x,'mediabunny.mjs')));
if(!mbDir)throw Error('Pinned Mediabunny 1.61.6 is required.');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'wivra-still-'));
const imageFile=path.join(dir,'photo.svg');
fs.writeFileSync(imageFile,
 '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180">'+
 '<rect width="240" height="180" fill="#facc15"/></svg>');
const srv=http.createServer((req,res)=>{
 const target=new URL(req.url,'http://127.0.0.1').pathname;
 const file=target==='/photo.svg'?imageFile:target.startsWith('/mb/')?
 path.join(mbDir,path.basename(target)):
 /^\/(app|core)\//.test(target)?path.resolve(root,'.'+target):null;
 if(!file||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 const type=target.endsWith('.svg')?'image/svg+xml':'text/javascript';
 res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});
 fs.createReadStream(file).pipe(res);
});
(async()=>{
 await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+srv.address().port;
 const browser=await chromium.launch({headless:true});
 const file=path.join(dir,'still.mp4');
 let handle=fs.openSync(file,'w+'),high=0,ops=0;
 try {
  const page=await browser.newPage();
  page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
  await page.exposeFunction('__writeAt',({position,data})=>{
   const bytes=Buffer.from(data,'base64');
   fs.writeSync(handle,bytes,0,bytes.length,position);
   high=Math.max(high,position+bytes.length);ops++;
   return bytes.length;
  });
  await page.goto(base+'/app/export.mjs');
  const result=await page.evaluate(async()=>{
   const M=await import('/mb/mediabunny.mjs');
   const {prepareAcceleratedMultitrack,renderAcceleratedMultitrack}
    =await import('/app/accelerated-multitrack-renderer.mjs');
   const project={clips:[{id:'photo',asset_id:'photo',start:0,in:0,out:1}],
    overlayClips:[],audioClips:[],texts:[],format:{aspect:'original'}};
   const media={photo:{kind:'image',url:'/photo.svg',w:240,h:180}};
   const prepared=await prepareAcceleratedMultitrack({
    project,media,M,platform:'qa',expectedAudio:false
   });
   const writeAt=(position,bytes)=>{
    let raw='';
    for(let i=0;i<bytes.length;i+=8192)
     raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
    return window.__writeAt({position,data:btoa(raw)});
   };
   return renderAcceleratedMultitrack({prepared,writeAt,fps:30});
  });
  await page.close();
  fs.closeSync(handle);handle=null;
  const ending=path.join(dir,'still.'+result.container);
  fs.renameSync(file,ending);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error',
   '-show_entries','format=duration:stream=codec_type,codec_name','-of','json',
   ending],{encoding:'utf8',timeout:15000}));
  const rgb=execFileSync('ffmpeg',['-nostdin','-v','error','-ss','0.5',
   '-i',ending,'-frames:v','1','-vf','scale=1:1',
   '-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{timeout:15000});
  const inspection=(await import('file://'+path.join(root,'app/media-container.mjs')))
   .inspectExport(new Uint8Array(fs.readFileSync(ending)));
  const report={scope:'Linux Chromium real exported still-image timeline, no phone',
   result,durationSeconds:Number(probe.format.duration),
   codecs:probe.streams.map(s=>s.codec_type+':'+s.codec_name),
   rgb:[...rgb.subarray(0,3)],bytes:high,writes:ops,
   hasSeekIndex:inspection.seekIndex,declaresDuration:inspection.declaresDuration};
  console.log(JSON.stringify(report,null,2));
  if(!(report.durationSeconds>=.95&&report.durationSeconds<=1.2)||
     result.videoFrames!==30||result.audioCodec!==null||
     !(rgb[0]>180&&rgb[1]>150&&rgb[2]<180)||
     !report.hasSeekIndex||!report.declaresDuration||high<1000)
    throw Error('Accelerated photo output lost the original image.');
 }finally{
  if(handle!==null)fs.closeSync(handle);
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;})
 .finally(()=>{srv.close();fs.rmSync(dir,{recursive:true,force:true});});
