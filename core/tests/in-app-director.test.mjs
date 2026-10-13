import test from 'node:test';
import assert from 'node:assert/strict';
import {createShootPlan,updateShot,progress,validateProviderShotPlan} from '../shoot-checklist.mjs';
import {createAgentToolController,localBasicCommand} from '../in-app-agent.mjs';
import {createProject} from '../project.mjs';
import {Session} from '../session.mjs';
test('create a five-shot checklist of a place with duration and safe generic spots',()=>{
 const p=createShootPlan({subject:'Quiero grabar sobre este restaurante',platform:'reels',durationSeconds:45});
 assert.equal(p.shots.length,5);
 assert.equal(p.shots.reduce((a,s)=>a+s.durationSeconds,0),45);
 assert.equal(p.shotLocations.every(x=>x.actualPlaceVerified===false),true);
 assert.equal(progress(p).readyToEdit,false);
});
test('mark each shot complete and undo by changing it back',()=>{
 let p=createShootPlan({subject:'Vistas de Vancouver'});
 for(const s of p.shots)p=updateShot(p,s.id,{state:'done'});
 assert.equal(progress(p).percent,100);assert.equal(progress(p).readyToEdit,true);
 p=updateShot(p,'shot-2',{state:'todo'});
 assert.equal(progress(p).remaining,1);
});
test('link a known video but never accept invented source assets',()=>{
 let p=createShootPlan({subject:'Una calle'});
 const project=createProject({assets:[{id:'a1',name:'Granville.mov',duration:12}]});
 assert.throws(()=>updateShot(p,'shot-1',{assetId:'a999'},{project}),/Attach only existing/);
 p=updateShot(p,'shot-1',{assetId:'a1'},{project});
 assert.equal(p.shots[0].assetId,'a1');
});
test('structured model shots are suggestions not verified place results',()=>{
 const p=validateProviderShotPlan({shots:[{kind:'context',title:'Entrada',direction:'Plano general',durationSeconds:4}],placeHints:['Desde un punto público']},{subject:'Café',platform:'reels'});
 assert.equal(p.shots[0].verification,'model_suggested_not_verified');
 assert.equal(p.shotLocations[0].actualPlaceVerified,false);
});
test('an in-app agent dry-runs and applies actual operations with one undo',async()=>{
 const session=new Session(createProject({assets:[{id:'a1',name:'video.mp4',duration:30}]}));
 session.apply([{op:'add_clip',asset_id:'a1',start:0}],0);
 const startRevision=session.project.revision;
 const model=async()=>({operations:[{op:'trim_clip',clip_id:'c1',in:2,out:8}],description:'Acortar'});
 const agent=createAgentToolController({session,model});
 const plan=await agent.propose({message:'Recórtalo'});
 assert.equal(session.project.clips[0].out,30);
 assert.equal(plan.draftProject.clips[0].out,8);
 const result=agent.approve();
 assert.equal(result.operationsApplied,1);
 assert.equal(session.project.clips[0].out,8);
 assert.equal(session.project.revision,startRevision+1);
 session.undo();assert.equal(session.project.clips[0].out,30);
});
test('reject model hallucinations and prevent stale revision edits',async()=>{
 const session=new Session(createProject({assets:[{id:'a1',duration:18}]}));
 session.apply([{op:'add_clip',asset_id:'a1'}],0);
 const agent=createAgentToolController({session,model:async()=>({operations:[{op:'trim_clip',clip_id:'c1',in:2,out:99}]})});
 await assert.rejects(agent.propose({message:'recorta'}),/Rejected model operation/);
 const valid=createAgentToolController({session,model:async()=>({operations:[{op:'trim_clip',clip_id:'c1',in:2,out:8}]})});
 await valid.propose({message:'recorta'});
 session.apply([{op:'add_text',text:'Hola',start:0,duration:2}],session.project.revision);
 assert.throws(()=>valid.approve(),/editor changed/);
});
test('local basic command executes without cloud, but clearly limits understanding',async()=>{
 const session=new Session(createProject({assets:[{id:'a1',duration:15}]}));
 session.apply([{op:'add_clip',asset_id:'a1'}],0);
 const model=async({message,project})=>localBasicCommand(message,project);
 const agent=createAgentToolController({session,model});
 await agent.propose({message:'Recorta clip 1 desde 2 a 7 y pon texto "Hola"'});
 const applied=agent.approve();
 assert.equal(applied.operationsApplied,2);
 assert.equal(session.project.clips[0].out,7);
 assert.equal(session.project.texts[0].text,'Hola');
 await assert.rejects(agent.propose({message:'elige los mejores momentos'}),/modo local básico/);
});
test('shot plan model adapter requires review and no platform publishing',async()=>{
 const session=new Session(createProject());
 const agent=createAgentToolController({session,model:async()=>({shots:[{title:'Toma',direction:'Grabar fachada',durationSeconds:4}]})});
 await agent.propose({message:'quiero grabar un café',kind:'shot_plan'});
 assert.equal(session.project.clips.length,0);
 const r=agent.approve();
 assert.equal(r.plan.shots[0].state,'todo');
});
