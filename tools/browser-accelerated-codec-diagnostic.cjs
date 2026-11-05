// Real synthetic AVC/AAC diagnostic in Linux browser engines. A failure to
// encode AAC here is useful evidence, never a reason to substitute Opus/VP9.
// This does not attest to Android System WebView, WKWebView or a real phone.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict');
const STAGES=['environment','exact-support','encode','mux','container','decode','playback'];

function validateDiagnosticReport(report,{cancelled=false,privateMarker=''}={}){
 assert.ok(report&&typeof report==='object'&&!Array.isArray(report),'Diagnostic report missing');
 assert.equal(report.schemaVersion,1,'Diagnostic schema changed');
 assert.ok(['passed','failed','cancelled'].includes(report.outcome),'Unknown diagnostic outcome');
 assert.equal(report.productionEligible,false,'Synthetic sample cannot enable production');
 assert.equal(report.physicalDeviceVerified,false,'Linux sample cannot attest to physical hardware');
 if(cancelled)assert.equal(report.outcome,'cancelled','Cancellation was not reported');
 assert.ok(Array.isArray(report.stages),'Diagnostic stages missing');
 assert.ok(report.stages.length<=16,'Unbounded diagnostic stages');
 for(const item of report.stages){
  assert.ok(item&&typeof item==='object'&&!Array.isArray(item),'Invalid stage');
  assert.match(item.stage,/^[a-z][a-z0-9-]{0,63}$/,'Stage is not a sanitized identifier');
  assert.match(item.status,/^[a-z][a-z0-9-]{0,31}$/,'Status is not a sanitized identifier');
  assert.ok(STAGES.includes(item.stage),'Unknown diagnostic stage');
 }
 assert.equal(new Set(report.stages.map(item=>item.stage)).size,report.stages.length,'Repeated diagnostic stage');
 if(report.outcome==='passed'){
  assert.deepEqual(report.stages.map(item=>item.stage),STAGES,'Completed diagnostic skipped a verification stage');
  assert.ok(report.stages.every(item=>item.status==='passed'),'Completed diagnostic contains an unverified stage');
  const {video,audio}=report.configuration||{};
  assert.match(video?.codec,/^avc1\.[0-9A-Fa-f]{6}$/,'Completed sample is not exact AVC');
  assert.equal(video?.avc?.format,'avc');
  assert.equal(audio?.codec,'mp4a.40.2','Completed sample is not AAC-LC');
  assert.equal(audio?.numberOfChannels,2);
  assert.ok(Number.isSafeInteger(video.width)&&video.width>0&&video.width<=1920);
  assert.ok(Number.isSafeInteger(video.height)&&video.height>0&&video.height<=1920);
  assert.ok(Number.isSafeInteger(video.framerate)&&video.framerate>=12&&video.framerate<=60);
 }
 if(report.code!==undefined)assert.match(report.code,/^[a-z][a-z0-9-]{0,63}$/,'Error code is not sanitized');
 if(report.outcome==='failed'){
  assert.match(report.failedStage,/^[a-z][a-z0-9-]{0,63}$/,'Failed stage missing');
  assert.ok(report.code,'Failure must retain its reproducible sanitized code');
 }
 const serialized=JSON.stringify(report);
 assert.ok(serialized.length<=32768,'Report exceeds synthetic diagnostic budget');
 assert.ok(!/Mozilla\/|AppleWebKit\/|Chrome\/|Safari\//.test(serialized),'Raw user agent leaked');
 assert.ok(!/(?:https?:\/\/|file:\/\/|blob:|\/workspace\/|\/tmp\/|\/home\/)/.test(serialized),'URL or local path leaked');
 if(privateMarker)assert.ok(!serialized.includes(privateMarker),'Page metadata leaked');
 const checkKeys=value=>{
  if(!value||typeof value!=='object')return;
  for(const [key,item] of Object.entries(value)){
   assert.ok(!/^(userAgent|ua|url|path|filename|deviceModel|project|credentials|stack)$/i.test(key),'Sensitive metadata field leaked');
   checkKeys(item);
  }
 };
 checkKeys(report);
 return true;
}

async function runBrowserDiagnostics(){
 const root=path.resolve(__dirname,'..');
 let playwright;
 try{playwright=require('/tmp/wivra-media-lab/node_modules/playwright');}
 catch{playwright=require('playwright');}
 const candidates=['/tmp/wivra-media-lab/node_modules/mediabunny',path.join(root,'node_modules/mediabunny')];
 const vendorRoot=candidates.find(dir=>fs.existsSync(path.join(dir,'dist/bundles/mediabunny.cjs')));
 assert.ok(vendorRoot,'Pinned Mediabunny 1.61.6 browser bundle is required');
 const pkg=JSON.parse(fs.readFileSync(path.join(vendorRoot,'package.json'),'utf8'));
 assert.equal(pkg.version,'1.61.6');assert.equal(pkg.license,'MPL-2.0');
 const bundle=path.join(vendorRoot,'dist/bundles/mediabunny.cjs');
 const server=http.createServer((req,res)=>{
  const pathname=new URL(req.url,'http://127.0.0.1').pathname;
  if(pathname==='/'){
   res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
   res.end('<!doctype html><meta charset="utf-8"><title>Synthetic codec diagnostic</title>');return;
  }
  let file=null;
  if(pathname==='/bundle/mediabunny.cjs')file=bundle;
  else if(pathname==='/synthetic-fixture.mp4')
   file=path.join(root,'app/tests/fixtures/mediarecorder/ffmpeg-h264-aac-fragmented.mp4');
  else if(/^\/(app|core)\/[A-Za-z0-9_-]+\.mjs$/.test(pathname))file=path.join(root,pathname.slice(1));
  if(!file||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':pathname.endsWith('.mp4')?'video/mp4':'text/javascript','Cache-Control':'no-store'});
  fs.createReadStream(file).pipe(res);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const privateMarker='diagnostic-private-page-marker';
 const result={schemaVersion:1,scope:'Linux browser engines with synthetic samples only',
  physicalDeviceVerified:false,productionEligible:false,pass:false,browsers:[]};
 try{
  for(const name of ['chromium','webkit']){
   const engine=playwright[name];
   if(name==='webkit'&&!fs.existsSync(engine.executablePath())){
    result.browsers.push({engine:name,platform:'linux',available:false,reason:'browser-not-installed'});continue;
   }
   // Retain the engine and active case BEFORE crossing into the browser. A
   // crashed codec process must leave honest partial evidence, not disappear
   // from an artifact that contains only the preceding successful engine.
   const record={engine:name,platform:'linux',available:false,completed:false,
    phase:'launch',events:{pageCrashed:false,browserDisconnected:false},cases:[],faultInjection:[]};
   result.browsers.push(record);
   let browser,page,activeCase,closing=false;
   const begin=(trace,phase)=>{
    record.phase=phase;activeCase=trace;trace.status='running';trace.currentStage='environment';
    console.log('[Wivra codec QA] '+name+' '+trace.name+' started');
   };
   const onStage=(caseName,stage)=>{
    if(activeCase?.name!==caseName||!STAGES.includes(stage))return;
    activeCase.lastCompletedStage=stage;
    activeCase.currentStage=STAGES[STAGES.indexOf(stage)+1]||'completed';
    console.log('[Wivra codec QA] '+name+' '+activeCase.name+' passed '+stage);
   };
   try{
    console.log('[Wivra codec QA] '+name+' launching');
    browser=await engine.launch({headless:true});
    record.available=true;record.phase='page-setup';
    browser.on('disconnected',()=>{
     if(closing)return;
     record.events.browserDisconnected=true;
     console.log('[Wivra codec QA] '+name+' browser disconnected unexpectedly');
    });
    page=await browser.newPage();
    page.on('crash',()=>{
     record.events.pageCrashed=true;
     console.log('[Wivra codec QA] '+name+' page process crashed');
    });
    await page.exposeFunction('__wivraDiagnosticStage',onStage);
    await page.goto(base+'/?private='+privateMarker);
    await page.addScriptTag({url:base+'/bundle/mediabunny.cjs'});
    const cases=record.cases;
    for(const sample of [
     {name:'short-avc-aac',width:320,height:240,fps:30},
     {name:'1080p-avc-aac',width:1920,height:1080,fps:30},
     {name:'cancel-before-start',width:320,height:240,fps:30,cancelled:true},
     {name:'retry-after-cancel',width:320,height:240,fps:30}
    ]){
     const trace={name:sample.name};cases.push(trace);begin(trace,'diagnostic');
     let timer;
     const report=await Promise.race([
      page.evaluate(async sample=>{
       const {runAcceleratedCodecDiagnostic}=await import('/app/accelerated-codec-diagnostic.mjs');
       return runAcceleratedCodecDiagnostic({M:globalThis.Mediabunny,
        width:sample.width,height:sample.height,fps:sample.fps,
        timeoutMs:15000,isCancelled:()=>sample.cancelled===true,
        onStage:stage=>{globalThis.__wivraDiagnosticStage(sample.name,stage).catch(()=>{});}});
      },sample),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Synthetic diagnostic exceeded browser deadline')),25000);})
     ]).finally(()=>clearTimeout(timer));
     validateDiagnosticReport(report,{cancelled:sample.cancelled===true,privateMarker});
     trace.report=report;trace.status='completed';trace.currentStage=report.failedStage||'completed';
     console.log('[Wivra codec QA] '+name+' '+sample.name+' '+report.outcome+
      (report.code?' '+report.code:''));
    }
    assert.equal(cases[0].report.outcome,cases[3].report.outcome,'Cancellation changed codec availability on retry');
    assert.equal(cases[0].report.code,cases[3].report.code,'Cancellation changed the codec failure on retry');
    assert.equal(cases[0].report.failedStage,cases[3].report.failedStage,'Cancellation changed the failed verification stage');
    // These intentionally fake encoder failures. They exercise cleanup and
    // error handling only and MUST NOT become codec compatibility evidence.
    const faultInjection=record.faultInjection;
    for(const scenario of ['encoder-constructor-error','encoder-configure-error','support-timeout','cancel-hanging-support']){
     const trace={name:scenario,syntheticFailureOnly:true,compatibilityEvidence:false};
     faultInjection.push(trace);begin(trace,'fault-injection');
     const report=await page.evaluate(async({scenario,privateMarker})=>{
      const {runAcceleratedCodecDiagnostic}=await import('/app/accelerated-codec-diagnostic.mjs');
      const originalVideo=globalThis.VideoEncoder,originalAudio=globalThis.AudioEncoder;
      let cancelled=false,timer;
      class FailingEncoder{
       static isConfigSupported(config){
        return scenario.includes('support')?new Promise(()=>{}):Promise.resolve({supported:true,config});
       }
       constructor(){
        if(scenario==='encoder-constructor-error')throw Error(privateMarker+' https://private.example/credential');
        this.state='unconfigured';
       }
       configure(){throw Error(privateMarker+' /private/user/movie.mp4');}
       close(){this.state='closed';}
      }
      try{
       globalThis.VideoEncoder=FailingEncoder;globalThis.AudioEncoder=FailingEncoder;
       if(scenario==='cancel-hanging-support')timer=setTimeout(()=>{cancelled=true;},40);
       return await runAcceleratedCodecDiagnostic({M:globalThis.Mediabunny,
        timeoutMs:scenario==='support-timeout'?100:1000,isCancelled:()=>cancelled,
        onStage:stage=>{globalThis.__wivraDiagnosticStage(scenario,stage).catch(()=>{});}});
      }finally{
       clearTimeout(timer);globalThis.VideoEncoder=originalVideo;globalThis.AudioEncoder=originalAudio;
      }
     },{scenario,privateMarker});
     validateDiagnosticReport(report,{cancelled:scenario==='cancel-hanging-support',privateMarker});
     assert.notEqual(report.outcome,'passed','Injected failure masqueraded as compatibility success');
     const expected=scenario==='support-timeout'?'timeout':scenario==='cancel-hanging-support'?'cancelled':'encode-error';
     assert.equal(report.code,expected,'Injected failure was not categorized safely');
     assert.equal(report.failedStage,scenario.includes('support')?'exact-support':'encode');
     trace.report=report;trace.status='failed-as-expected';
     trace.retryTrace={name:scenario+'-retry'};begin(trace.retryTrace,'retry-after-fault');
     const retry=await page.evaluate(async caseName=>{
      const {runAcceleratedCodecDiagnostic}=await import('/app/accelerated-codec-diagnostic.mjs');
      return runAcceleratedCodecDiagnostic({M:globalThis.Mediabunny,timeoutMs:15000,
       onStage:stage=>{globalThis.__wivraDiagnosticStage(caseName,stage).catch(()=>{});}});
     },scenario+'-retry');
     validateDiagnosticReport(retry,{privateMarker});
     assert.notEqual(retry.code,'diagnostic-busy','A failed diagnostic retained its single-run lock');
     assert.equal(retry.outcome,cases[0].report.outcome,'Injected codec state survived cleanup');
     assert.equal(retry.code,cases[0].report.code,'Injected codec failure survived cleanup');
     assert.equal(retry.failedStage,cases[0].report.failedStage,'Injected verification state survived cleanup');
     trace.retry=retry;trace.retryTrace.status='completed';
    }
    record.fileValidationTrace={name:'corrupt-file-validation'};
    begin(record.fileValidationTrace,'file-validation');
    const fileValidation=await page.evaluate(async()=>{
     const {validateDiagnosticMp4}=await import('/app/accelerated-codec-diagnostic.mjs');
     const {fmp4AddDurationAndIndex,inspectExport}=await import('/app/media-container.mjs');
     const source=new Uint8Array(await (await fetch('/synthetic-fixture.mp4')).arrayBuffer());
     const repaired=fmp4AddDurationAndIndex(source).bytes;
     const seconds=inspectExport(repaired).durationMs/1000;
     validateDiagnosticMp4(repaired,seconds);
     const faults={empty:new Uint8Array(),truncatedHeader:repaired.subarray(0,20),
      truncatedMedia:repaired.subarray(0,repaired.length-17),corruptBoxSize:repaired.slice()};
     faults.corruptBoxSize.set([0xff,0xff,0xff,0xff],0);
     const rejected=[];
     for(const [name,bytes] of Object.entries(faults)){
      try{validateDiagnosticMp4(bytes,seconds);throw Error('Invalid synthetic MP4 was accepted');}
      catch(error){if(error.diagnosticCode!=='invalid-container')throw error;rejected.push(name);}
     }
     return {syntheticFixture:true,structuralValidationOnly:true,validFixtureAccepted:true,rejected};
    });
    assert.deepEqual(fileValidation.rejected,['empty','truncatedHeader','truncatedMedia','corruptBoxSize']);
    record.fileValidation=fileValidation;record.fileValidationTrace.status='completed';
    record.completed=true;record.phase='completed';activeCase=null;
    console.log('[Wivra codec QA] '+name+' completed');
    await page.close();
   }catch(error){
    // Preserve standardized failure context only. Playwright's error text can
    // contain page URLs, filesystem paths and browser stderr; it is not part
    // of the downloadable privacy-safe diagnostic report.
    record.failureCode=record.events.pageCrashed||record.events.browserDisconnected||page?.isClosed()
     ?'browser-process-closed':error.message==='Synthetic diagnostic exceeded browser deadline'
      ?'browser-deadline':error.name==='AssertionError'?'report-invariant-error'
       :record.phase==='launch'?'browser-launch-failed':'browser-operation-failed';
    if(activeCase){activeCase.status='harness-failed';activeCase.failureCode=record.failureCode;}
    console.log('[Wivra codec QA] '+name+' '+record.phase+' '+record.failureCode);
    throw error;
   }finally{closing=true;await browser?.close();}
  }
  assert.ok(result.browsers.some(item=>item.available),'No real browser diagnostic executed');
  result.pass=true;
 }finally{
  await new Promise(resolve=>server.close(resolve));
  fs.writeFileSync(path.join(root,'wivra-accelerated-codec-diagnostic.json'),JSON.stringify(result,null,2)+'\n');
 }
 console.log(JSON.stringify(result,null,2));
 return result;
}

if(require.main===module)runBrowserDiagnostics().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={validateDiagnosticReport,runBrowserDiagnostics};
