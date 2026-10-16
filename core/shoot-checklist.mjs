/**
 * In-app shoot checklist, offline-first. No AI model or geocoding in this file.
 * Creates sensible GENERIC shots, never fabricates nearby businesses/places.
 * The director can accept any provider's verified structured shot proposal later.
 * — ChatGPT
 */
const MAX_SHOTS = 30;
const TYPES = Object.freeze(['establish','context','detail','action','perspective','closing','custom']);
const MEDIA = Object.freeze(['reels','tiktok','shorts','youtube','other']);
const clean=(v,limit,label)=>{
 if(typeof v!=='string'||!v.trim()||v.length>limit)throw new Error('Invalid '+label);
 return v.trim();
};
const pickLocationHints=subject=>{
 const val=subject.toLocaleLowerCase('es');
 if(/café|cafetería|coffee|restaurante|sushi|comida|local/i.test(val))
   return ['Fachada o entrada (si se permite grabar)','Mesa o producto con buena luz','Zona con ambiente, evitando grabar a desconocidos'];
 if(/montaña|sendero|bosque|parque|lago|mirador|río|nieve|naturaleza/i.test(val))
   return ['Acceso público y seguro','Punto panorámico permitido','Detalle cercano de paisaje o señalización'];
 if(/calle|ciudad|barrio|edificio|arquitectura|vancouver|whistler|pueblo/i.test(val))
   return ['Punto público para un plano general','Cruce o letrero legible desde zona segura','Perspectiva distinta sin bloquear el paso'];
 return ['Entrada o vista general del lugar','Detalle reconocible con buena iluminación','Segundo ángulo o punto de vista permitido'];
};
const beats=[
 {kind:'establish',title:'Gancho y plano general',text:'Primero muestra el lugar y lo más llamativo en una toma breve',pct:0.14},
 {kind:'context',title:'Identificación del lugar',text:'Graba el nombre, entrada o señal que ayude a entender dónde estás',pct:0.14},
 {kind:'detail',title:'Detalle distintivo',text:'Acércate a un objeto, textura o elemento interesante que realmente exista',pct:0.18},
 {kind:'action',title:'Recorrido o acción POV',text:'Camina o muestra la experiencia con una toma estable y movimiento controlado',pct:0.32},
 {kind:'closing',title:'Cierre y última imagen',text:'Cierra con otro ángulo y una frase o ambiente para conectar con el siguiente video',pct:0.22}
];
function apportionDuration(duration,n){
 const weights=n===5?beats.map(x=>x.pct):Array.from({length:n},()=>1/n);
 let secs=weights.map(w=>Math.max(1,Math.round(duration*w)));
 let diff=duration-secs.reduce((a,b)=>a+b,0);
 let cursor=secs.length-1;
 while(diff!==0 && secs.length){
   if(diff>0){secs[cursor]++;diff--}
   else if(secs[cursor]>1){secs[cursor]--;diff++}
   cursor=(cursor-1+secs.length)%secs.length;
   if(diff<0 && secs.every(n=>n<=1))break;
 }
 return secs;
}
export function createShootPlan({
 subject,platform='reels',durationSeconds=45,shotCount=5,
 style='',userLocation=null
}={}){
 const topic=clean(subject,1400,'subject');
 if(!MEDIA.includes(platform))throw new Error('Invalid platform');
 if(!Number.isInteger(durationSeconds)||durationSeconds<10||durationSeconds>3600)throw new Error('Duration from 10 to 3600 seconds');
 if(!Number.isInteger(shotCount)||shotCount<3||shotCount>12||durationSeconds<shotCount)
  throw new Error('Invalid shot count');
 if(typeof style!=='string'||style.length>500)throw new Error('Invalid style');
 if(userLocation!==null&&typeof userLocation!=='string')throw new Error('Invalid location');
 const duration=apportionDuration(durationSeconds,shotCount);
 const template=Array.from({length:shotCount},(_,i)=>{
   const b=beats[i<4?i:4];
   const text=i>=5?'Graba otro punto de vista permitido, con algo diferente de las tomas anteriores':b.text;
   return {
     id:'shot-'+(i+1),kind:i>=5?'custom':b.kind,
     title:i>=5?'Toma adicional '+(i+1):b.title,
     direction:text,
     durationSeconds:duration[i],
     state:'todo',
     assetId:null,
     verification:'generic_suggestion_unverified',
     note:''
   };
 });
 const locationHints=pickLocationHints(topic);
 return {
  schema:'agentcut-shoot-plan-v0.1',
  subject:topic,platform,durationSeconds,style:style.trim(),
  locationLabel:userLocation?.trim()||null,
  locationGrounding:'user_description_only',
  shotLocations:locationHints.map((hint,i)=>({
    id:'loc-'+(i+1),hint,actualPlaceVerified:false,coordinates:null
  })),
  shots:template,
  createdBy:'built_in_offline_template_not_ai',
  revision:0,
  editProjectAssetIds:[],
  warnings:[
   'Son ideas generales, NO establecimientos reales ni tomas que ya se hayan grabado.',
   'Para lugares concretos cercanos se requiere consulta geográfica y permiso explícito.',
   'Antes de grabar verifica acceso público, normas del lugar y privacidad de otras personas.'
  ]
 };
}
export function progress(plan){
 const completed=plan.shots.filter(x=>x.state==='done').length;
 const remaining=plan.shots.filter(x=>x.state==='todo'||x.state==='retry').length;
 // Skipped shots are terminal for the checklist, but never count as recorded.
 return {done:completed,total:plan.shots.length,remaining,
   percent:Math.round((plan.shots.length-remaining)*100/Math.max(1,plan.shots.length)),
   readyToEdit:completed>0 && remaining===0};
}
export function updateShot(plan,shotId,changes,{project=null}={}){
 if(!plan?.shots?.some(s=>s.id===shotId))throw new Error('Unknown shot');
 if(!changes||typeof changes!=='object')throw new Error('Invalid update');
 const permitted=['state','assetId','note','direction','title','durationSeconds'];
 if(Object.keys(changes).some(k=>!permitted.includes(k)))throw new Error('Unsupported shot field');
 if('state' in changes&&!['todo','done','retry','skipped'].includes(changes.state))throw new Error('Invalid shot state');
 if('title' in changes)clean(changes.title,130,'shot title');
 if('direction' in changes)clean(changes.direction,1200,'shot direction');
 if('note' in changes&&(typeof changes.note!=='string'||changes.note.length>1000))throw new Error('Invalid note');
 if('durationSeconds' in changes&&(!Number.isFinite(changes.durationSeconds)||changes.durationSeconds<=0||changes.durationSeconds>3600))
   throw new Error('Invalid shot duration');
 if('assetId' in changes&&changes.assetId!==null){
   if(!project?.assets?.some(asset=>asset.id===changes.assetId))throw new Error('Attach only existing video assets');
 }
 return {...plan,revision:plan.revision+1,
  shots:plan.shots.map(s=>s.id===shotId?{...s,...changes}:s)};
}
export function validateProviderShotPlan(candidate,{subject,platform='reels',maxShots=12}={}){
 if(!candidate||!Array.isArray(candidate.shots)||candidate.shots.length<1||candidate.shots.length>maxShots)
  throw new Error('Invalid model shot proposal');
 const topic=clean(subject,1400,'subject');
 if(!MEDIA.includes(platform))throw new Error('Invalid platform');
 let duration=0;
 const shots=candidate.shots.map((s,i)=>{
  if(!s||typeof s!=='object')throw new Error('Invalid model shot');
  const title=clean(s.title,130,'shot title'),direction=clean(s.direction,1200,'shot direction');
  if(!Number.isFinite(s.durationSeconds)||s.durationSeconds<1||s.durationSeconds>3600)throw new Error('Invalid shot duration');
  duration+=s.durationSeconds;
  return {id:'shot-'+(i+1),kind:TYPES.includes(s.kind)?s.kind:'custom',
    title,direction,durationSeconds:s.durationSeconds,
    state:'todo',assetId:null,verification:'model_suggested_not_verified',note:''};
 });
 const placeHints=Array.isArray(candidate.placeHints)?candidate.placeHints.slice(0,6).map(x=>clean(x,250,'location hint')):[];
 return {
  schema:'agentcut-shoot-plan-v0.1',subject:topic,platform,
  durationSeconds:duration,style:'',
  locationLabel:null,locationGrounding:'not_verified_by_map',
  shotLocations:placeHints.map((hint,i)=>({id:'loc-'+(i+1),hint,actualPlaceVerified:false,coordinates:null})),
  shots,revision:0,editProjectAssetIds:[],createdBy:'model_proposal_requires_review',
  warnings:['Modelo no verificó acceso ni ubicaciones: confirmar antes de viajar o grabar.']
 };
}
