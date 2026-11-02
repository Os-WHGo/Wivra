/* Verify the accelerated SDK is embedded OFFLINE in an isolated build.
 * No RTMP, credentials, real user media or app package changes. */
const fs=require('node:fs'), path=require('node:path');
const assert=require('node:assert/strict');
let {chromium}=require('/tmp/wivra-media-lab/node_modules/playwright');
const htmlPath=path.resolve(__dirname,'../app/dist/agentcut.html');
const html=fs.readFileSync(htmlPath,'utf8');
assert.match(html,/Wivra optional QA vendor: Mediabunny 1\.61\.6, MPL-2\.0/);
assert.match(html,/acceleratedCutEligibility/);
assert.match(html,/renderAcceleratedCuts/);
assert.match(html,/createAcceleratedNativeSink/);
assert.doesNotMatch(html,/<script[^>]+src=["']https?:/i);
(async()=>{let browser=await chromium.launch();try{
  const page=await browser.newPage();
  await page.goto('file://'+htmlPath,{waitUntil:'domcontentloaded'});
  const status=await page.evaluate(()=>({
    vendor:typeof globalThis.Mediabunny,
    output:typeof globalThis.Mediabunny?.Output,
    cut:typeof globalThis.renderAcceleratedCuts,
    random:typeof globalThis.createAcceleratedNativeSink,
    qa:typeof globalThis.recordExperimentalAcceleratedProject,
    api:typeof globalThis.recordProject,
    multipista:typeof globalThis.WivraAcceleratedQA?.recordExperimentalNativeMultitrack,
    photoQA:typeof globalThis.WivraAcceleratedQA?.prepareAcceleratedMultitrack,
    nativeLaunch:typeof globalThis.WivraAcceleratedQA?.recordOnNative,
    qaUI:document.getElementById('wivraAcceleratedQA')?.id || null,
    nativeHost:typeof globalThis.WivraAcceleratedQA?.nativeHost,
    photos:typeof globalThis.WivraAcceleratedQA?.saveToPhotos,
  }));
  assert.deepEqual(status,{vendor:'object',output:'function',cut:'function',random:'function',qa:'function',api:'function',multipista:'function',photoQA:'function',nativeLaunch:'function',qaUI:null,nativeHost:'function',photos:'function'});
  // The same offline QA HTML must show controls ONLY when a dedicated
  // v2 host exists. An ordinary browser may inspect codecs but cannot launch
  // native export or recovery. This is Chromium Linux, not an iPhone proof.
  const simulated=await browser.newPage();
  await simulated.addInitScript(()=>{
    globalThis.WivraAcceleratedExportNative={
      addEventListener(){},postMessage(){}
    };
  });
  await simulated.goto('file://'+htmlPath,{waitUntil:'domcontentloaded'});
  const gated=await simulated.evaluate(()=>{
    const box=document.getElementById('wivraAcceleratedQA');
    const start=document.getElementById('wivraQaStart');
    return {box:!!box,start:!!start,consent:document.getElementById('wivraQaEnable')?.checked,
      native:globalThis.WivraAcceleratedQA?.nativeHost()?.platform};
  });
  assert.deepEqual(gated,{box:true,start:true,consent:false,native:'android'});
  // The export sheet is intentionally closed until a project is selected.
  // Trigger the handler in DOM to check the consent gate without pretending
  // the hidden button is visible/clickable to a user.
  await simulated.evaluate(()=>document.getElementById('wivraQaStart').click());
  const denied=await simulated.locator('#wivraAcceleratedQA [role="status"]').first().textContent();
  assert.match(denied,/Marca primero la autorización experimental/);
  await simulated.close();
  const hostSafety=await page.evaluate(async()=>{
    const qa=globalThis.WivraAcceleratedQA;
    let deniedWithoutConsent=false,deniedWithoutHost=false;
    try { await qa.recordOnNative({}); } catch(e) {
      deniedWithoutConsent=/autorización experimental/.test(e.message);
    }
    try { await qa.recordOnNative({experimentalAccelerated:true}); } catch(e) {
      deniedWithoutHost=/puente nativo acelerado v2/.test(e.message);
    }
    return {deniedWithoutConsent,deniedWithoutHost};
  });
  assert.deepEqual(hostSafety,{deniedWithoutConsent:true,deniedWithoutHost:true});
  // End-to-end opt-in Wivra API with synthetic, local browser media. No
  // external CDN, no RTMP, no original user video, no native disk writer.
  const result=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');
    canvas.width=320;canvas.height=180;
    const g=canvas.getContext('2d'),stream=canvas.captureStream(24);
    if (!MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) {
      return {skip:true,reason:'VP8 MediaRecorder unavailable'};
    }
    const rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
    const chunks=[];
    rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    const stopped=new Promise(resolve=>rec.onstop=resolve);
    let n=0;
    const tick=setInterval(()=>{g.fillStyle=n++%2?'#fff':'#111';g.fillRect(0,0,320,180)},35);
    rec.start(100);
    await new Promise(r=>setTimeout(r,1800));
    rec.stop();await stopped;clearInterval(tick);
    stream.getTracks().forEach(t=>t.stop());
    const blob=new Blob(chunks,{type:'video/webm'});
    const url=URL.createObjectURL(blob);
    try {
      const result=await recordProject({
        project:{clips:[{id:'a',asset_id:'v',start:0,in:0.2,out:0.8,volume:1}],
          overlayClips:[],audioClips:[],texts:[],format:{aspect:'original'}},
        media:{v:{kind:'video',url,w:320,h:180}},
        saveMode:'memory',experimentalAccelerated:true
      });
      return {skip:false,experimental:result.experimental,verifiedOnDevice:result.verifiedOnDevice,
        frames:result.acceleration.frames,mime:result.mime,size:result.blob.size,hasAudio:result.hasAudio};
    } finally {URL.revokeObjectURL(url)}
  });
  if(!result.skip){
    assert.equal(result.experimental,true);
    assert.equal(result.verifiedOnDevice,false);
    assert.ok(result.frames>0,'No decoded frames passed through shared renderer');
    assert.ok(result.size>1000,'No finished file from QA memory exporter');
    assert.match(result.mime,/^video\/(?:mp4|webm)$/);
    assert.equal(result.hasAudio,false);
  }
  console.log('Wivra offline Mediabunny bundle and opt-in API smoke PASS: '+JSON.stringify({status,result}));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1;});
