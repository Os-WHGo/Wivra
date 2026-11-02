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
  }));
  assert.deepEqual(status,{vendor:'object',output:'function',cut:'function',random:'function',qa:'function',api:'function'});
  console.log('Wivra offline Mediabunny bundle smoke PASS: '+JSON.stringify(status));
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1;});
