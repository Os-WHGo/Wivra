// Standalone media capability probe for Mediabunny/WebCodecs risk evaluation.
// Runs ONLY in isolated CI; neither Wivra's editor nor native app imports it.
// Chromium/Linux and Playwright/WebKit are proxies, NOT iOS/Android hardware.
const { chromium, webkit } = require('/tmp/wivra-media-lab/node_modules/playwright');
const http = require('node:http');
const { writeFileSync } = require('node:fs');
const MIMES = [
 'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
 'video/mp4;codecs=avc1', 'video/mp4',
 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'
];
(async () => {
 const srv = http.createServer((_req,res) => { res.writeHead(200,{'Content-Type':'text/html'}); res.end('<!doctype html><title>Wivra media capabilities</title>'); });
 await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
 const url = 'http://127.0.0.1:' + srv.address().port + '/';
 const report = { scope:'WebCodecs/MediaRecorder browser compatibility, NOT a Wivra export test',
   limits:'Linux CI browser engines are not iPhone WKWebView or Android WebView; do not infer 4K/HEVC/HDR/energy/real app performance',browsers:[] };
 try {
  for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]) {
   let browser;
   try {
    browser = await engine.launch({headless:true});
    const page = await browser.newPage(); await page.goto(url);
    const observed = await page.evaluate(async mime => {
     const result={secure:window.isSecureContext,ua:navigator.userAgent,
      mediaRecorder:typeof MediaRecorder,videoEncoder:typeof VideoEncoder,
      videoDecoder:typeof VideoDecoder,audioEncoder:typeof AudioEncoder,
      canvasCapture:typeof HTMLCanvasElement.prototype.captureStream,
      mimes:{},codecs:{},encoded:null,recorded:null};
     for(const m of mime){try{result.mimes[m]=typeof MediaRecorder==='function' && MediaRecorder.isTypeSupported(m)}catch(e){result.mimes[m]=String(e)}}
     if(typeof VideoEncoder==='function') for(const codec of ['avc1.42001E','vp8','vp09.00.10.08']) {
      try{result.codecs[codec]=(await VideoEncoder.isConfigSupported({codec,width:320,height:240,bitrate:500000,framerate:30})).supported}
      catch(e){result.codecs[codec]=e.name+': '+e.message}
     }
     const canvas=document.createElement('canvas');canvas.width=320;canvas.height=240;
     const ctx=canvas.getContext('2d');ctx.fillStyle='#345';ctx.fillRect(0,0,320,240);
     if(typeof VideoEncoder==='function' && typeof VideoFrame==='function') {
      const codec=Object.keys(result.codecs).find(c=>result.codecs[c]===true);let enc;
      if(codec)try {
       let count=0, bytes=0,error=null;
       enc=new VideoEncoder({output:chunk=>{count++;bytes+=chunk.byteLength},error:e=>{error=String(e)}});
       enc.configure({codec,width:320,height:240,bitrate:500000,framerate:30});
       for(let i=0;i<5;i++){ctx.fillStyle='rgb('+i*25+',22,90)';ctx.fillRect(0,0,320,240);
        const f=new VideoFrame(canvas,{timestamp:i*33333});enc.encode(f,{keyFrame:i===0});f.close();}
       await enc.flush();result.encoded={codec,count,bytes,error};
      }catch(e){result.encoded={codec,error:e.name+': '+e.message}}
      finally{try{enc?.close()}catch(e){}}
     }
     if(typeof canvas.captureStream==='function' && typeof MediaRecorder==='function') {
      const m=mime.find(q=>result.mimes[q]===true);
      if(m){const stream=canvas.captureStream(15);let rec;let blobs=[];
       try{rec=new MediaRecorder(stream,{mimeType:m});rec.ondataavailable=e=>{if(e.data?.size)blobs.push(e.data)};
        await new Promise(resolve=>{
         let finished=false, timer;const done=()=>{if(!finished){finished=true;clearTimeout(timer);resolve()}};
         rec.onstop=done;rec.onerror=done;
         timer=setTimeout(()=>{try{if(rec.state==='recording')rec.stop()}catch(e){}done()},3000);
         rec.start(100);setTimeout(()=>{try{rec.stop()}catch(e){done()}},600);
        });
        result.recorded={mime:m,parts:blobs.length,bytes:blobs.reduce((a,b)=>a+b.size,0)};
       }catch(e){result.recorded={mime:m,error:e.name+': '+e.message}}
       finally{stream.getTracks().forEach(t=>t.stop());try{if(rec?.state==='recording')rec.stop()}catch(e){}}
      }
     }
     return result;
    },MIMES);
    report.browsers.push({name,...observed});await page.close();
   }catch(e){report.browsers.push({name,launchError:String(e).slice(0,600)})}
   finally{await browser?.close()}
  }
 }finally{await new Promise(resolve=>srv.close(resolve))}
 writeFileSync('wivra-media-capabilities.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
 if(report.browsers.every(x=>x.launchError))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
