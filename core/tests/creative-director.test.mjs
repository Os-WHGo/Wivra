import test from 'node:test';
import assert from 'node:assert/strict';
import {createDirectorBrief,recordInstruction,describeAsset,addShotIdea,
directorContext,directorPrompt} from '../creative-director.mjs';
import {createProject} from '../project.mjs';
const project=createProject({assets:[
{id:'a1',name:'Granville.mov',duration:45},
{id:'a2',name:'Burrard.mov',duration:62},
{id:'a3',name:'SeaPlains.mov',duration:82}
]});
test('automatic highlight request requires no prior explanation',()=>{
 const brief=createDirectorBrief({goal:'Haz un reel de los mejores momentos',mode:'automatic',platforms:['reels','tiktok'],durationSeconds:30});
 const context=directorContext(project,brief);
 assert.equal(context.mode,'automatic');assert.equal(context.assets.length,3);
 assert.match(directorPrompt(project,brief),/inspection plan/);
 assert.equal(context.assets[0].verifiedByApp.streetIdentified,false);
});
test('guided workflow stores spoken descriptions for five files as user-reported evidence',()=>{
 const multi=createProject({assets:Array.from({length:5},(_,i)=>({id:'a'+i,name:'video'+i+'.mov',duration:60}))});
 let brief=createDirectorBrief({mode:'guided',goal:'Crear capítulo de Vancouver y 3 reels',platforms:['youtube','reels'],outputCount:3});
 for(let i=0;i<5;i++)brief=describeAsset(brief,multi,{assetId:'a'+i,description:'En este video grabé escena número '+i,source:'dictated'});
 brief=recordInstruction(brief,'Quiero subtítulos, humor y voz en off',{source:'dictated'});
 const ctx=directorContext(multi,brief);
 assert.equal(Object.keys(brief.assetDescriptions).length,5);
 assert.ok(ctx.assets.every(a=>a.userDescription.evidenceLevel==='user_reported'));
 assert.equal(ctx.utterances[0].source,'dictated');
});
test('preproduction mode works before filming, with no assets',()=>{
 const empty=createProject();
 let brief=createDirectorBrief({mode:'preproduction',goal:'Quiero grabar un TikTok con cinco cortes y efectos',durationSeconds:45,platforms:['tiktok'],effects:'dynamic'});
 brief=addShotIdea(brief,{description:'Toma de apertura',durationSeconds:4});
 const ctx=directorContext(empty,brief);
 assert.equal(ctx.assets.length,0);assert.equal(ctx.shotsGivenByUser[0].origin,'user');
 assert.match(directorPrompt(empty,brief),/FUTURE recording/);
});
test('long natural dictated briefing is preserved and corrections remain ordered',()=>{
 let brief=createDirectorBrief({mode:'guided',goal:'Un capítulo entretenido'});
 const long='Quiero '.repeat(700); // > 4000 chars within 12000
 brief=recordInstruction(brief,long,{source:'dictated'});
 brief=recordInstruction(brief,'Mejor no, cambia tercera toma',{source:'dictated',kind:'correction'});
 assert.equal(brief.utterances[0].text,long.trim());
 assert.equal(brief.utterances[1].order,2);
 assert.equal(brief.utterances[1].kind,'correction');
});
test('description never guesses a timecode and invalid asset is rejected',()=>{
 const brief=createDirectorBrief({mode:'guided',goal:'Encuentra el Convention Centre'});
 assert.throws(()=>describeAsset(brief,project,{assetId:'does-not-exist',description:'Allí grabé una orca'}),/does not exist/);
 assert.throws(()=>describeAsset(brief,project,{assetId:'a1',description:'Una orca',timeHintSeconds:90}),/outside media/);
 const next=describeAsset(brief,project,{assetId:'a1',description:'Vogue Theatre'});
 assert.equal(next.assetDescriptions.a1.timeHintSeconds,null);
 assert.equal(next.assetDescriptions.a1.evidenceLevel,'user_reported');
});
test('raw thumbnails or unexpected observations cannot be leaked to external prompt',()=>{
 const b=createDirectorBrief({mode:'automatic',goal:'Un reel'});
 const c=directorContext(project,b,{observations:{a1:{sampledFrames:8,thumbnailDataUrl:'data:image/jpeg;base64,SECRET',gps:'SECRET_GPS',transcript:'FAKE'}}});
 const exported=JSON.stringify(c);
 assert.equal(c.assets[0].verifiedByApp.sampledFrames,8);
 assert.ok(!exported.includes('SECRET'));
 assert.equal(c.assets[0].verifiedByApp.speechTranscribed,false);
});
test('invalid platforms, durations and huge instruction are rejected',()=>{
 assert.throws(()=>createDirectorBrief({mode:'fake',goal:'Hola'}),/Invalid director/);
 assert.throws(()=>createDirectorBrief({goal:'Hola',durationSeconds:-1}),/Invalid desired/);
 assert.throws(()=>createDirectorBrief({goal:'Hola',platforms:['bad']}),/platforms/);
 assert.throws(()=>recordInstruction(createDirectorBrief({goal:'Hola'}),'a'.repeat(13000)),/12000/);
});
