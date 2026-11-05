// W71: sequential six-configuration AVC/AAC QA matrix.
// Each case uses the existing one-second synthetic diagnostic. This does NOT
// verify long recordings, native gallery storage or a physical phone.
// No project names, device models, user agents, media bytes or URLs are retained.
export const WIVRA_CODEC_MATRIX_CASES = Object.freeze([
  Object.freeze({id:'qvga30',width:320,height:240,fps:30}),
  Object.freeze({id:'qvga60',width:320,height:240,fps:60}),
  Object.freeze({id:'hd30',width:1280,height:720,fps:30}),
  Object.freeze({id:'hd60',width:1280,height:720,fps:60}),
  Object.freeze({id:'fhd30',width:1920,height:1080,fps:30}),
  Object.freeze({id:'fhd60',width:1920,height:1080,fps:60})
]);
const wivraMatrixStages=['environment','exact-support','encode','mux','container','decode','playback'];
const wivraMatrixCodes = new Set(['invalid-container','diagnostic-busy','cancelled','timeout',
  'invalid-configuration','api-unavailable','codec-unsupported','codec-config-mismatch',
  'resource-limit','encode-error','mux-error','decode-error','playback-error',
  'diagnostic-interrupted']);
let wivraCodecMatrixRunning=false;
const wivraMatrixObject=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const wivraMatrixSafeCode=value=>wivraMatrixCodes.has(value)?value:'invalid-evidence';

function wivraMatrixRuntime(value) {
  // Platform and browser identity are unauthenticated hints, not attestation.
  const platform=['ios','android','desktop','unknown'].includes(value?.platform)?value.platform:'unknown';
  const accepted=['ios-wkwebview','android-system-webview','android-chrome',
    'ios-safari','ios-chrome','other-ios-browser','desktop-chromium','desktop-safari',
    'unknown-desktop-browser','unknown-android-browser','unknown-ios-context','unknown'];
  const runtime=accepted.includes(value?.runtime)?value.runtime:'unknown';
  const evidence=['app-bridge-observed','user-agent-hint','conflicting-signals','unavailable']
    .includes(value?.evidence)?value.evidence:'unavailable';
  return {platform,runtime,evidence,physicalDeviceVerified:false};
}
function wivraMatrixCase(test,outcome='not-run',code=null,failedStage=null) {
  return {id:test.id,width:test.width,height:test.height,fps:test.fps,outcome,code,failedStage};
}
function wivraMatrixReadCase(test,result) {
  if (!wivraMatrixObject(result) || result.schemaVersion!==1 ||
      result.synthetic!==true || result.productionEligible!==false ||
      result.physicalDeviceVerified!==false)
    return wivraMatrixCase(test,'failed','invalid-evidence');
  if (result.outcome==='cancelled')
    return wivraMatrixCase(test,'cancelled','cancelled',
      wivraMatrixStages.includes(result.failedStage)?result.failedStage:null);
  if (result.outcome==='failed')
    return wivraMatrixCase(test,'failed',wivraMatrixSafeCode(result.code),
      wivraMatrixStages.includes(result.failedStage)?result.failedStage:null);
  if (result.outcome!=='passed')return wivraMatrixCase(test,'failed','invalid-evidence');
  const video=result.configuration?.video,audio=result.configuration?.audio;
  const stages=result.stages;
  const valid=video?.width===test.width&&video?.height===test.height&&
    video?.framerate===test.fps&&/^avc1\.[0-9a-f]{6}$/i.test(video?.codec??'')&&
    video?.avc?.format==='avc'&&audio?.codec==='mp4a.40.2'&&
    audio?.sampleRate===48000&&audio?.numberOfChannels===2&&
    result.observedCodecs?.audio==='mp4a.40.2'&&
    /^avc1\.[0-9a-f]{6}$/i.test(result.observedCodecs?.video??'')&&
    Array.isArray(stages)&&stages.length===wivraMatrixStages.length&&
    stages.every((s,i)=>s?.stage===wivraMatrixStages[i]&&s?.status==='passed');
  return valid?wivraMatrixCase(test,'passed'):wivraMatrixCase(test,'failed','invalid-evidence');
}

/** A QA matrix report only summarizes verified-in-context synthetic codec runs. */
export async function runAcceleratedCodecMatrix({
  diagnose,isCancelled=()=>false,onCaseStart=()=>{},onStage=()=>{},onCaseDone=()=>{}
}={}) {
  const report={schemaVersion:1,kind:'wivra-accelerated-codec-matrix',synthetic:true,
    productionEligible:false,physicalDeviceVerified:false,longFormVerified:false,
    nativeStorageVerified:false,environmentVerified:false,
    runtime:wivraMatrixRuntime(),outcome:'failed',fullMatrixPassed:false,
    cases:[],limits:{cases:6,secondsPerCase:1,realProjectMedia:false,
      actualDeviceAttestation:false}};
  if(wivraCodecMatrixRunning)return {...report,code:'diagnostic-busy'};
  if(typeof diagnose!=='function')return {...report,code:'diagnostic-unavailable'};
  wivraCodecMatrixRunning=true;
  try {
    let firstRuntime=null,contextChanged=false,cancelled=false;
    for(const test of WIVRA_CODEC_MATRIX_CASES) {
      if(isCancelled()){cancelled=true;break;}
      try{onCaseStart(test);}catch{}
      let result;
      try {
        result=await diagnose({width:test.width,height:test.height,fps:test.fps,
          isCancelled,onStage:stage=>{try{onStage(test,stage);}catch{}}});
      }catch {
        // Never include exception text; it may contain paths, URLs or user data.
        result=null;
      }
      const one=wivraMatrixReadCase(test,result);
      report.cases.push(one);
      if(wivraMatrixObject(result?.runtime)) {
        const runtime=wivraMatrixRuntime(result.runtime);
        if(!firstRuntime){firstRuntime=runtime;report.runtime=runtime;}
        else if(JSON.stringify(firstRuntime)!==JSON.stringify(runtime))contextChanged=true;
      }
      try{onCaseDone(test,one);}catch{}
      if(one.outcome==='cancelled'||isCancelled()){cancelled=true;break;}
    }
    const tested=new Set(report.cases.map(item=>item.id));
    for(const test of WIVRA_CODEC_MATRIX_CASES)
      if(!tested.has(test.id))report.cases.push(wivraMatrixCase(test));
    report.contextConsistent=!contextChanged;
    if(cancelled){report.outcome='cancelled';report.code='cancelled';}
    else if(contextChanged){report.outcome='failed';report.code='context-changed';}
    else if(report.cases.every(item=>item.outcome==='passed')){
      report.outcome='passed';report.fullMatrixPassed=true;
    }else{report.outcome='failed';report.code='matrix-incomplete';}
  }finally {wivraCodecMatrixRunning=false;}
  return report;
}

/** Validate the matrix shape for download/CI, without authenticating the phone. */
export function auditAcceleratedCodecMatrix(report) {
  if(!wivraMatrixObject(report)||report.schemaVersion!==1||
     report.kind!=='wivra-accelerated-codec-matrix'||report.synthetic!==true||
     report.productionEligible!==false||report.physicalDeviceVerified!==false||
     report.longFormVerified!==false||report.nativeStorageVerified!==false||
     report.environmentVerified!==false||!Array.isArray(report.cases)||
     report.cases.length!==WIVRA_CODEC_MATRIX_CASES.length)
    return {valid:false,reason:'invalid-matrix'};
  for(let i=0;i<WIVRA_CODEC_MATRIX_CASES.length;i++){
    const expected=WIVRA_CODEC_MATRIX_CASES[i],actual=report.cases[i];
    if(!wivraMatrixObject(actual)||actual.id!==expected.id||
       actual.width!==expected.width||actual.height!==expected.height||
       actual.fps!==expected.fps||
       !['passed','failed','cancelled','not-run'].includes(actual.outcome)||
       (actual.outcome==='passed'&&(actual.code!==null||actual.failedStage!==null))||
       (actual.outcome==='not-run'&&(actual.code!==null||actual.failedStage!==null)))
      return {valid:false,reason:'invalid-case'};
  }
  const allPassed=report.cases.every(c=>c.outcome==='passed')&&report.contextConsistent===true;
  if(report.fullMatrixPassed!==allPassed||(report.outcome==='passed')!==allPassed||
     !['passed','failed','cancelled'].includes(report.outcome))
    return {valid:false,reason:'inconsistent-outcome'};
  if(JSON.stringify(report).length>12000)
    return {valid:false,reason:'oversized-report'};
  return {valid:true,syntheticMatrixPassed:allPassed,
    physicalDeviceAccepted:false,productionApproved:false};
}
