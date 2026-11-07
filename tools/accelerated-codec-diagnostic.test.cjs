const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateDiagnosticReport}=require('./browser-accelerated-codec-diagnostic.cjs');
const failed=()=>({schemaVersion:1,outcome:'failed',code:'codec-unsupported',failedStage:'exact-support',
 productionEligible:false,physicalDeviceVerified:false,
 stages:[{stage:'exact-support',status:'failed'}]});

test('unsupported AVC/AAC is valid negative evidence without changing the production gate',()=>{
 assert.equal(validateDiagnosticReport(failed()),true);
});
test('browser evidence rejects accidental physical or production acceptance',()=>{
 for(const field of ['productionEligible','physicalDeviceVerified']){
  assert.throws(()=>validateDiagnosticReport({...failed(),[field]:true}));
 }
});
test('browser report rejects raw user agents, private page markers, URLs and filesystem paths',()=>{
 for(const value of ['Mozilla/5.0','https://example.test/private','file:///private/movie.mp4','blob:private',
  '/workspace/Wivra/private.mov','/tmp/private.mov','/home/person/private.mov','private-marker']){
  assert.throws(()=>validateDiagnosticReport({...failed(),extra:value},{privateMarker:'private-marker'}));
 }
});
test('empty, oversized or unidentified failures cannot look like completed diagnostic evidence',()=>{
 assert.throws(()=>validateDiagnosticReport(null));
 assert.throws(()=>validateDiagnosticReport({...failed(),stages:null}));
 assert.throws(()=>validateDiagnosticReport({...failed(),failedStage:undefined}));
 assert.throws(()=>validateDiagnosticReport({...failed(),extra:'x'.repeat(33000)}));
 assert.throws(()=>validateDiagnosticReport({...failed(),code:'Encoder error with private text'}));
});
test('cancellation must be explicit and bounded',()=>{
 assert.throws(()=>validateDiagnosticReport(failed(),{cancelled:true}));
 assert.equal(validateDiagnosticReport({...failed(),outcome:'cancelled'},{cancelled:true}),true);
 assert.throws(()=>validateDiagnosticReport({...failed(),stages:Array(17).fill({stage:'decode',status:'passed'})}));
});
test('a passed diagnostic requires exact AVC/AAC and every real verification stage',()=>{
 const stages=['environment','exact-support','encode','mux','container','decode','playback']
  .map(stage=>({stage,status:'passed'}));
 const report={schemaVersion:1,outcome:'passed',productionEligible:false,physicalDeviceVerified:false,stages,
  configuration:{video:{codec:'avc1.42E01F',width:320,height:240,framerate:30,avc:{format:'avc'}},
   audio:{codec:'mp4a.40.2',numberOfChannels:2}}};
 assert.equal(validateDiagnosticReport(report),true);
 assert.throws(()=>validateDiagnosticReport({...report,stages:stages.slice(0,-1)}));
 assert.throws(()=>validateDiagnosticReport({...report,stages:[...stages.slice(0,-1),{stage:'playback',status:'skipped'}]}));
 assert.throws(()=>validateDiagnosticReport({...report,configuration:{...report.configuration,
  audio:{codec:'opus',numberOfChannels:2}}}));
 assert.throws(()=>validateDiagnosticReport({...failed(),runtime:{ua:'sensitive'}}));
});
