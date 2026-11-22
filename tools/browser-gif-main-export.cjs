// Classic MediaRecorder export of an animated GIF on the MAIN line, real
// app/export.mjs in Chromium. A 2-frame GIF (red 0.5 s / blue 0.5 s) must
// alternate in the decoded output. Before 2026-11-22 the main-line photo loop
// never advanced the GIF and the export stayed red. Linux QA only. — Claude
const {chromium}=require(require('./media-lab.cjs').LAB+'/node_modules/playwright');
const fs=require('node:fs'),os=require('node:os'),http=require('node:http'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 const loc=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!loc.startsWith(root+path.sep)||!/\.(mjs|js|html)$/.test(loc)){res.writeHead(404);return res.end();}
 try{const data=fs.readFileSync(loc);res.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'no-store'});res.end(data);}
 catch{res.writeHead(404);res.end();}
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true});
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'wivra-gif-'));
 const report={type:'WIVRA_CLASSIC_MAIN_GIF_EXPORT',runner:'Playwright Chromium Linux; not mobile WebView'};
 try{
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:'+server.address().port+'/app/export.mjs');
  const result=await page.evaluate(async()=>{
   const {recordProject}=await import('/app/export.mjs');
   const {gifCanvasEl}=await import('/app/gif.mjs');
   const w=160,h=120,solid=rgb=>{const a=new Uint8ClampedArray(w*h*4);
    for(let i=0;i<w*h;i++){a[i*4]=rgb[0];a[i*4+1]=rgb[1];a[i*4+2]=rgb[2];a[i*4+3]=255;}return a;};
   const gif={w,h,frames:[{delay:.5,rgba:solid([220,20,20])},{delay:.5,rgba:solid([20,20,220])}]};
   const media={g:{kind:'image',url:'blob:unused',w,h,gif,makeEl:()=>gifCanvasEl(gif)}};
   const project={clips:[{id:'c1',asset_id:'g',start:0,in:0,out:2}],
    overlayClips:[],audioClips:[],texts:[],format:{aspect:'original'}};
   const res=await recordProject({project,media,onProgress:()=>{}});
   if(!res?.blob)return {error:'no blob: '+JSON.stringify(res).slice(0,300)};
   const bytes=new Uint8Array(await res.blob.arrayBuffer());
   let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
   return {mime:res.mime,b64:btoa(s)};
  });
  if(result.error)throw Error(result.error);
  const file=path.join(tmp,'gif-main.webm');
  fs.writeFileSync(file,Buffer.from(result.b64,'base64'));
  const pixel=t=>[...execFileSync('ffmpeg',['-nostdin','-v','error','-ss',String(t),'-i',file,
   '-frames:v','1','-vf','scale=1:1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'])];
  report.mime=result.mime;
  report.samples=[[0.2,'red'],[0.7,'blue'],[1.2,'red'],[1.7,'blue']].map(([t,want])=>{
   const rgb=pixel(t),got=rgb[0]>rgb[2]+60?'red':rgb[2]>rgb[0]+60?'blue':'other';
   return {t,want,got,rgb};
  });
  report.pass=report.samples.every(s=>s.got===s.want);
 }catch(e){report.pass=false;report.error=String(e.stack||e).slice(0,800);}
 finally{await browser.close();server.close();fs.rmSync(tmp,{recursive:true,force:true});}
 fs.writeFileSync('wivra-gif-main-export.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 if(!report.pass)process.exit(1);
})();
