/**
 * Local in-app execution boundary: agent/model proposes JSON tools; editor owns
 * verification, explicit review and commit. The provider can run on-device
 * or through an authorized service. It NEVER receives raw files here.
 * No API/model credentials and NO network access exist in this module.
 * — ChatGPT
 */
import {applyBatch} from './operations.mjs';
import {validateProviderShotPlan} from './shoot-checklist.mjs';

export function createAgentToolController({session,model=null}={}){
 if(!session?.project||typeof session.apply!=='function')throw new Error('A real editor session is required');
 let pending=null;
 function parseCandidate(output){
   if(typeof output==='string'){try{return JSON.parse(output)}catch{throw new Error('Invalid JSON returned by model')}}
   return output;
 }
 return {
  getPending:()=>pending?structuredClone(pending):null,
  async propose({message,kind='edit',evidence=null,subject=null,platform='reels'}={}){
   if(typeof message!=='string'||!message.trim()||message.length>12000)throw new Error('Please give instructions');
   if(typeof model!=='function')throw new Error('No integrated AI provider is connected yet');
   if(!['edit','shot_plan'].includes(kind))throw new Error('Unsupported agent task');
   const revision=session.project.revision;
   // A plugin adapter can use exactly this structure; no file data/GPS sent.
   const payload={kind,message,revision,
     project:{revision,assets:session.project.assets.map(a=>({id:a.id,name:a.name,duration:a.duration})),
       clips:session.project.clips.map(x=>({...x})),
       texts:session.project.texts.map(x=>({...x}))},
     evidence,
     note:'The media files themselves are not shared. Request a review if evidence does not prove a fact.'};
   const raw=parseCandidate(await model(payload));
   if(kind==='edit'){
     if(!raw||!Array.isArray(raw.operations)||!raw.operations.length||raw.operations.length>50)
       throw new Error('Model must return 1 to 50 validated operations');
     const trial=applyBatch(session.project,raw.operations,revision);
     if(!trial.ok)throw new Error('Rejected model operation: '+trial.message);
     pending={kind,revision,operations:structuredClone(raw.operations),
       description:String(raw.description||'Propuesta de edición').slice(0,400),draftProject:trial.project};
   }else{
     const shotPlan=validateProviderShotPlan(raw,{subject:subject||message,platform});
     pending={kind,revision,shotPlan,
       description:String(raw.description||'Propuesta de tomas').slice(0,400)};
   }
   return structuredClone(pending);
  },
  approve(){
   if(!pending)throw new Error('No pending plan');
   const item=pending;pending=null;
   if(item.revision!==session.project.revision)throw new Error('The editor changed; request a new plan');
   if(item.kind==='shot_plan')return {ok:true,kind:'shot_plan',plan:item.shotPlan};
   const result=session.apply(item.operations,item.revision);
   if(!result.ok)throw new Error('Edit was rejected: '+result.message);
   return {ok:true,kind:'edit',revision:result.revision,operationsApplied:item.operations.length};
  },
  reject(){pending=null;return {ok:true,rejected:true}}
 };
}

/** Very small ON-DEVICE rule fallback to prove in-app edit control without
 * falsely presenting it as a semantic AI model. Never guesses best moments.
 */
export function localBasicCommand(request,project){
 const text=String(request||'').trim();
 const operations=[];
 const quoted=text.match(/(?:pon|agrega|añade|escribe)\s+(?:un\s+)?(?:texto|título|titulo)\s*[:]?\s*[«"“']([^»"”']{1,120})[»"”']/i);
 if(quoted){
  const length=project.clips.reduce((max,c)=>Math.max(max,c.start+c.out-c.in),0);
  if(length<=0)throw new Error('Primero importa un video para poner texto');
  operations.push({op:'add_text',text:quoted[1],start:0,duration:Math.min(3,length)});
 }
 const trim=text.match(/(?:recorta|corta)\s+(?:el\s+)?(?:video|clip)\s*(\d+)\s+(?:de|desde|entre)\s*(\d+(?:[.,]\d+)?)\s+(?:a|hasta|y)\s*(\d+(?:[.,]\d+)?)/i);
 if(trim){
  const idx=Number(trim[1])-1;
  const clip=[...project.clips].sort((a,b)=>a.start-b.start)[idx];
  if(!clip)throw new Error('No existe ese número de clip');
  operations.push({op:'trim_clip',clip_id:clip.id,in:Number(trim[2].replace(',','.')),out:Number(trim[3].replace(',','.'))});
 }
 if(!operations.length)throw new Error('El modo local básico solo entiende texto entre comillas o recortes explícitos. Para comprender ideas generales necesitas conectar un modelo de IA.');
 return {operations,description:'Operaciones locales básicas, sin modelo de IA'};
}
