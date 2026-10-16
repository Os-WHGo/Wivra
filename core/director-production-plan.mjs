/**
 * Wivra Director: production metadata and offline user-provided places.
 * Adapter to the SINGLE canonical agentcut-shoot-plan-v0.1 checklist.
 * No second plan schema, media database, IA provider or route engine.
 * No network, GPS, credentials or paid third-party calls.
 */
import {validateProviderShotPlan, updateShot, progress as checklistProgress} from './shoot-checklist.mjs';

export const PRODUCTION_FORMATS=Object.freeze(['reel','vertical_minidoc','vertical_series','vertical_film']);
export const NARRATION_MODES=Object.freeze(['live','voiceover_later','mixed','none']);
const cleaned=(value,max,label,required=true)=>{
 if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw new TypeError(label+' inválido.');
 return value.trim();
};
const checked=(n,min,max,label)=>{
 if(!Number.isInteger(n)||n<min||n>max)throw new RangeError(label+' fuera de rango.');
 return n;
};
function lengths(total,n){
 const base=Math.floor(total/n),extra=total%n;
 return Array.from({length:n},(_,i)=>base+(i<extra?1:0));
}
/**
 * Accept places provided by the user and return the *existing* checklist type,
 * enriched with production metadata. The editor/Director owns these same shots.
 */
export function createOfflineProduction({
 title,format='reel',durationSeconds=60,locations,
 narrationMode='voiceover_later',language='es',episodeNumber=null
}={}){
 const name=cleaned(title,150,'Título');
 if(!PRODUCTION_FORMATS.includes(format))throw new TypeError('Formato inválido.');
 if(!NARRATION_MODES.includes(narrationMode))throw new TypeError('Modo de voz inválido.');
 checked(durationSeconds,5,7200,'Duración');
 const locale=cleaned(language,16,'Idioma');
 if(episodeNumber!==null)checked(episodeNumber,1,999,'Episodio');
 if(!Array.isArray(locations)||locations.length<1||locations.length>30||locations.length>durationSeconds)
   throw new RangeError('Se requieren 1–30 lugares y tiempo suficiente.');
 const seconds=lengths(durationSeconds,locations.length);
 const places=locations.map((entry,i)=>{
   const item=typeof entry==='string'?{name:entry}:entry;
   if(!item||typeof item!=='object'||Array.isArray(item))throw new TypeError('Lugar inválido.');
   const name=cleaned(item.name,160,'Lugar');
   const note=cleaned(item.note??'',800,'Nota',false);
   const script=cleaned(item.script??'',2200,'Guion',false);
   const hint=cleaned(item.shootHint??'',700,'Instrucción',false);
   if(seconds[i]>3600)throw new RangeError('Dividir la producción en más escenas de máximo 3600 s.');
   return {name,note,script,hint};
 });
 // Same validator and same shot IDs/statuses that the Editor already uses.
 const candidate={shots:places.map((place,i)=>({
   kind:'custom',
   title:'Toma '+(i+1)+' · '+place.name,
   direction:place.hint||'Graba un plano general, un detalle y una toma alternativa. Revisa antes de continuar.',
   durationSeconds:seconds[i]
 }))};
 const plan=validateProviderShotPlan(candidate,{subject:name,platform:'reels',maxShots:30});
 const extras={
   title:name,format,narrationMode,language:locale,episodeNumber,
   route:{method:'user_order_only',geographicallyOptimized:false,
     navigationProvided:false,gpsUsed:false,externallyVerifiedPlaces:false},
   source:'user_provided_locations_and_script',
   verifiedExternalFacts:false
 };
 return {
   ...plan,createdBy:'wivra_offline_user_plan_not_ai',
   locationGrounding:'user_description_only',durationSeconds,
   production:extras,
   shots:plan.shots.map((shot,i)=>({
     ...shot,placeName:places[i].name,
     script:places[i].script,note:places[i].note,
     targetSeconds:seconds[i],
     suggestedRawSeconds:Math.max(seconds[i]+5,2*seconds[i])
   })),
   warnings:[
     'Orden narrativo dado por usuario. NO es ruta geográfica optimizada.',
     'Datos y guion aportados por usuario, NO verificados con fuentes externas.',
     'El texto de teleprompter NO está grabado ni se incrusta en el video.',
     'Ninguna toma se considera capturada automáticamente.'
   ]
 };
}
const requireProduction=plan=>{
 if(plan?.schema!=='agentcut-shoot-plan-v0.1'||plan?.production?.source!=='user_provided_locations_and_script'||
    !Array.isArray(plan.shots))throw new TypeError('Plan de producción no compatible.');
};
export function reorderOfflineProduction(plan,shotIds){
 requireProduction(plan);
 if(!Array.isArray(shotIds)||shotIds.length!==plan.shots.length||
   new Set(shotIds).size!==shotIds.length||
   plan.shots.some(x=>!shotIds.includes(x.id)))throw new TypeError('Orden inválido.');
 const byId=new Map(plan.shots.map(s=>[s.id,s]));
 return {...plan,revision:plan.revision+1,shots:shotIds.map(id=>({...byId.get(id)}))};
}
/**
 * Review through the SAME updateShot function used by the canonical checklist.
 * Only accepted shots may link real media assets; retry and skipped are
 * supported by the shared checklist and are not counted as captured.
 */
export function reviewProductionShot(plan,shotId,decision,{assetId=null,project=null}={}){
 requireProduction(plan);
 const states={accepted:'done',retry:'retry',skipped:'skipped',todo:'todo'};
 if(!Object.hasOwn(states,decision))throw new TypeError('Decisión inválida.');
 if(assetId!==null && (decision!=='accepted'||typeof assetId!=='string'||
    !project?.assets?.some(a=>a.id===assetId)))
   throw new TypeError('El medio no existe o la toma no fue aceptada.');
 return updateShot(plan,shotId,{state:states[decision],assetId:decision==='accepted'?assetId:null},{project});
}
export function productionProgress(plan){
 requireProduction(plan);
 const base=checklistProgress(plan);
 return {
   accepted:base.done,
   skipped:plan.shots.filter(s=>s.state==='skipped').length,
   total:base.total,remaining:base.remaining,
   nextShotId:plan.shots.find(s=>['todo','retry'].includes(s.state))?.id??null,
   linkedMedia:plan.shots.filter(s=>s.state==='done'&&!!s.assetId).length,
   readyForManualReview:base.remaining===0
 };
}
/**
 * Small contextual voice dictionary, not a second agent or voice recognizer.
 * It returns an intent; it cannot operate camera, GPS, editor or LIVE.
 */
const COMMANDS=Object.freeze({
 next:['siguiente','siguiente toma','pasa a la siguiente','next','next shot',
   'suivant','prochaine prise','próximo','próxima cena','weiter','nächste aufnahme',
   'avanti','prossima ripresa','次へ','下一步'],
 repeat:['repite','repite la instruccion','que tengo que grabar','repeat','repeat that',
   'repete','repete ca','repete a instruçao','ripeti','wiederholen','もう一度','重复'],
 accepted:['ya la hice','toma lista','listo','terminada','done','shot done',
   'c est fait','feito','feito isso','fertig','fatto','撮影完了','拍好了'],
 retry:['repetir toma','no me gusto','otra toma','retake','try again',
   'refaire','refazer','nochmal aufnehmen','rifare','撮り直し','重拍'],
 skipped:['saltar','salta esta toma','omitir toma','skip','skip shot',
   'passer','pular','überspringen','salta la ripresa','スキップ','跳过']
});
const normalize=text=>text.normalize('NFKC').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase().replace(/[.!?¿¡,;:]+$/g,'').replace(/\s+/g,' ').trim();
const COMMAND_MAP=new Map(Object.entries(COMMANDS).flatMap(([action,phrases])=>
 phrases.map(phrase=>[normalize(phrase),action])));
export function understandDirectorCommand(text){
 if(typeof text!=='string'||text.length>180||!text.trim())return null;
 const action=COMMAND_MAP.get(normalize(text));
 return action?{scope:'director_shot_plan',action,requiresConfirmation:action==='skipped'}:null;
}
