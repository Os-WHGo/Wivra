/* CI-only: 81 timeline clip positions (40 + 40 + 1) are really rendered
   through app/export.mjs, then validated with ffprobe. Source bytes are one
   synthetic WebM reused under 81 logical asset IDs, NOT Ray-Ban MP4/HEVC.
   This is a Linux Chromium smoke test, never proof of mobile export. */
const {chromium}=require('/tmp/wivra-media-lab/node_modules/playwright');
const {readFileSync,writeFileSync}=require('node:fs');
const {execFileSync}=require('node:child_process');
const http=require('node:http'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const output='wivra-long-multipart-export.json';
const report={test:'81 logical cuts, 40+40+1',environment:'Chromium Linux',
  source:'single generated WebM reused (NOT 81 Ray-Ban HEVC MP4 files)',
  realPhoneVerified:false,rayBanVerified:false};
const server=http.createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://local.test').pathname);
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)||!/\.(mjs|js|html)$/.test(file)){
    res.writeHead(404);return res.end();
  }
  try{res.writeHead(200,{'Content-Type':'text/javascript'});res.end(readFileSync(file))}
  catch{res.writeHead(404);res.end()}
});
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();
    page.setDefaultTimeout(60000);
    await page.goto('http://127.0.0.1:'+server.address().port+'/app/export.mjs');
    const result=await page.evaluate(async()=>{
      const {recordProject,exportPlan,validateMainVideoExport}=await import('/app/export.mjs');
      const {validateRayBanParts}=await import('/app/director-parts.mjs');
      const sleep=ms=>new Promise(r=>setTimeout(r,ms));
      const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;
      const g=canvas.getContext('2d'),stream=canvas.captureStream(20);
      const mime=['video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
      if(!mime)throw new Error('No WebM encoder in isolated Chromium');
      const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:250000});
      const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
      const finished=new Promise((resolve,reject)=>{
        recorder.onstop=resolve;recorder.onerror=e=>reject(e.error||new Error('fixture recorder failed'));
      });
      recorder.start(100);
      for(let i=0;i<35;i++){
        g.fillStyle=i<18?'#bb5511':'#1166bb';g.fillRect(0,0,160,90);
        await sleep(40);
      }
      recorder.stop();await finished;stream.getTracks().forEach(t=>t.stop());
      const source=new Blob(chunks,{type:recorder.mimeType});
      if(source.size<1000)throw new Error('synthetic input unexpectedly empty');
      const sourceUrl=URL.createObjectURL(source);
      try{
        const session='abcdef0123456789abcdef0123456789',files=Array.from({length:81},(_,i)=>({
          name:'Wivra_RayBan_1793352000000_'+session+'_part'+String(i+1).padStart(4,'0')+'.mp4',
          size:source.size // filename-only contract; bytes are really WebM
        }));
        let nextPart=1,cursor=0;
        const clips=[],assets=[],media={};
        for(const batch of [files.slice(0,40),files.slice(40,80),files.slice(80)]){
          const check=validateRayBanParts(batch,{nextPart,expectedSessionId:session});
          if(!check.ok)throw new Error(check.reason);
          for(const fake of check.files){
            const id='logical'+nextPart,span=0.18;
            clips.push({id:'clip'+nextPart,asset_id:id,start:cursor,
              in:0.08,out:0.26,muted:true});
            assets.push({id,name:fake.name,duration:0.18});
            media[id]={url:sourceUrl,w:160,h:90,kind:'video'};
            cursor+=span;nextPart++;
          }
        }
        const project={assets,clips,overlayClips:[],audioClips:[],texts:[],format:{aspect:'original'}};
        const valid=validateMainVideoExport(project);
        if(!valid.ok)throw new Error('montage preflight failed '+JSON.stringify(valid));
        const plan=exportPlan(project);
        if(plan.segments.length!==81||Math.abs(plan.total-14.58)>1e-7)
          throw new Error('81-part timeline inconsistent '+JSON.stringify({n:plan.segments.length,d:plan.total}));
        const t0=performance.now();
        const exported=await recordProject({project,media});
        if(!exported?.blob || exported.blob.size<1000)
          throw new Error('Long export failed or produced no media: '+JSON.stringify(exported));
        const b64=await new Promise((resolve,reject)=>{
          const f=new FileReader();
          f.onerror=()=>reject(f.error);
          f.onload=()=>{const s=String(f.result),mark=';base64,',at=s.lastIndexOf(mark);
            if(at<0)reject(new Error('No base64 FileReader result'));else resolve(s.slice(at+mark.length));};
          f.readAsDataURL(exported.blob);
        });
        return {partCount:clips.length,batches:[40,40,1],plannedSeconds:plan.total,
          inputBytes:source.size,outputBytes:exported.blob.size,mime:exported.mime,
          ext:exported.ext,elapsedSeconds:(performance.now()-t0)/1000,b64};
      }finally{URL.revokeObjectURL(sourceUrl)}
    });
    const bytes=Buffer.from(result.b64,'base64');
    const filename='/tmp/wivra-long-multipart.'+result.ext;
    writeFileSync(filename,bytes);
    const probed=JSON.parse(execFileSync('ffprobe',['-v','error','-show_packets',
      '-show_entries','stream=codec_type,codec_name:packet=pts_time,duration_time:format=duration,format_name',
      '-of','json',filename],{encoding:'utf8',timeout:30000}));
    const points=(probed.packets||[]).map(p=>Number(p.pts_time))
      .filter(Number.isFinite);
    const duration=Number(probed.format?.duration);
    const measured=Number.isFinite(duration)&&duration>0?duration:
      points.length?Math.max(...points)-Math.min(...points):0;
    report.partCount=result.partCount;report.batches=result.batches;
    report.plannedSeconds=result.plannedSeconds;
    report.outputBytes=result.outputBytes;report.inputBytes=result.inputBytes;
    report.elapsedSeconds=result.elapsedSeconds;report.mime=result.mime;
    report.durationDriftSeconds=+(measured-report.plannedSeconds).toFixed(3);
    report.ffprobe={duration:measured,format:probed.format?.format_name,
      video:(probed.streams||[]).some(s=>s.codec_type==='video'),
      packets:(probed.packets||[]).length};
    if(report.partCount!==81||!report.ffprobe.video||
       Math.abs(report.durationDriftSeconds)>0.45||
       !(report.outputBytes>1000))
      throw new Error('export did not meet long-montage smoke criteria: '+JSON.stringify(report));
    report.pass=true;
  }finally{await browser.close()}
})().catch(e=>{report.pass=false;report.error=String(e.stack||e);process.exitCode=1})
  .finally(()=>{writeFileSync(output,JSON.stringify(report,null,2)+'\n');server.close();console.log(JSON.stringify(report,null,2))});
