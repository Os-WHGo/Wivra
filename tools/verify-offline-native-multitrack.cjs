// Isolated browser QA: use the SAME offline editor HTML and v2 sidecar,
// encode real local pixels, and verify protocol-2 writes with a mock host.
// Does NOT claim hardware, MediaStore, Photos or real phone permissions.
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('/tmp/wivra-media-lab/node_modules/playwright');
const htmlPath=path.resolve(__dirname,'../app/dist/agentcut.html');
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  const result=await page.evaluate(()=>null).catch(()=>null);
  void result;
  await page.goto('file://'+htmlPath,{waitUntil:'domcontentloaded'});
  const test=await page.evaluate(async()=>{
   const M=globalThis.Mediabunny,qa=globalThis.WivraAcceleratedQA;
   if(typeof qa?.recordExperimentalNativeMultitrack!=='function')
    throw Error('Offline multitrack sidecar unavailable');
   if(!MediaRecorder.isTypeSupported('video/webm;codecs=vp8'))
    return {skip:true,reason:'VP8 source recorder not supported'};
   const canvas=document.createElement('canvas');
   canvas.width=320;canvas.height=180;
   const ctx=canvas.getContext('2d'),stream=canvas.captureStream(24);
   const rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
   const chunks=[];
   rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   const stopped=new Promise(resolve=>rec.onstop=resolve);
   let index=0;
   const timer=setInterval(()=>{
    ctx.fillStyle=(index++%2)?'#ea580c':'#1d4ed8';
    ctx.fillRect(0,0,320,180);
   },40);
   rec.start(100);
   await new Promise(resolve=>setTimeout(resolve,1700));
   rec.stop();await stopped;clearInterval(timer);
   stream.getTracks().forEach(t=>t.stop());
   const blob=new Blob(chunks,{type:'video/webm'});
   const url=URL.createObjectURL(blob);
   let binary=new Uint8Array(1024*1024),end=0,seq=0;
   const ops=[];
   const host={
    platform:'android',
    async request(message){
     ops.push(message.op);
     if(message.op==='helloRandom')return {protocol:2,randomWrite:true};
     if(message.op==='beginRandom')return {token:81};
     if(message.op==='abortRandom')return {};
     if(message.op==='finishRandom'){
      const data=binary.subarray(0,end);
      const hash=await crypto.subtle.digest('SHA-256',data);
      const sha256=[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
      const media=inspectExport(data);
      return {verified:!!(media.video&&media.seekIndex&&media.declaresDuration),
       bytes:end,sha256,media};
     }
     throw Error('Unexpected native v2 operation');
    },
    async sendWriteAt({seq:next,position,bytes}){
     if(next!==seq++)throw Error('Out of order write');
     if(position+bytes.length>binary.length){
      const larger=new Uint8Array(Math.max(binary.length*2,position+bytes.length));
      larger.set(binary);binary=larger;
     }
     binary.set(bytes,position);end=Math.max(end,position+bytes.length);
     return {seq:next,writtenBytes:bytes.length,maxEnd:end};
    }
   };
   try{
    const project={clips:[{id:'a',asset_id:'v',start:0,in:.2,out:.8}],
     overlayClips:[],audioClips:[],texts:[],format:{aspect:'original'}};
    const saved=await qa.recordExperimentalNativeMultitrack({
     project,media:{v:{kind:'video',url,w:320,h:180,duration:1.7}},
     M,host,expectAudio:false,experimentalAccelerated:true
    });
    const inspected=inspectExport(binary.subarray(0,end));
    return {skip:false,verified:saved.verifiedNative,device:saved.verifiedOnDevice,
     frames:saved.render.videoFrames,bytes:end,ops,
     video:inspected.video,declaresDuration:inspected.declaresDuration,
     seekIndex:inspected.seekIndex,audio:inspected.audio};
   }finally{URL.revokeObjectURL(url);}
  });
  if(!test.skip){
   assert.equal(test.verified,true);
   assert.equal(test.device,false);
   assert.ok(test.frames>=12);
   assert.ok(test.bytes>1000);
   assert.equal(test.video,true);
   assert.equal(test.declaresDuration,true);
   assert.equal(test.seekIndex,true);
   assert.equal(test.audio,false);
   assert.deepEqual(test.ops,['helloRandom','beginRandom','finishRandom']);
  }
  console.log('QA-only single-editor WebCodecs to mocked protocol v2 PASS: '+JSON.stringify(test));
 } finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
