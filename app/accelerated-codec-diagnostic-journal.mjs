import { mobileCodecConfig } from './accelerated-native-codec-probe.mjs';

// QA-only synthetic diagnostic receipt. This never reads/writes an export,
// capture, recovery token, project, device identifier or native journal.
// Interruption may mean closing the page; it does not identify an OOM/crash.
// — Codex
const codecJournalKey='wivra.qa.codec-diagnostic.v1';
const codecJournalStages=['environment','exact-support','encode','mux','container','decode','playback'];
function codecJournalConfiguration(value) {
 try{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const {width,height,fps}=value;
  return Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>=160&&height>=160&&
   width%2===0&&height%2===0&&Math.max(width,height)<=1920&&width*height<=1920*1080&&
   [24,25,30,50,60].includes(fps)?{width,height,fps}:null;
 }catch{return null;}
}
function codecJournalRecord(value) {
 if(!value||typeof value!=='object'||Array.isArray(value)||
  Object.keys(value).sort().join(',')!==
   'fps,height,lastCompleted,nextStage,pending,schemaVersion,synthetic,width'||
  value.schemaVersion!==1||value.synthetic!==true||value.pending!==true)return null;
 const configuration=codecJournalConfiguration(value);
 const completed=value.lastCompleted===null?-1:codecJournalStages.indexOf(value.lastCompleted);
 if(!configuration||completed< -1||completed>=codecJournalStages.length-1||
  (completed===-1&&value.lastCompleted!==null)||
  value.nextStage!==codecJournalStages[completed+1])return null;
 return {schemaVersion:1,synthetic:true,pending:true,...configuration,
  lastCompleted:value.lastCompleted,nextStage:value.nextStage};
}

/** Storage is optional and injected; unavailable/full storage is advisory. */
export function createCodecDiagnosticJournal(storage) {
 let pending=null,receiptConsumed=false;
 const remove=()=>{try{storage.removeItem(codecJournalKey);return true;}catch{return false;}};
 const write=()=>{
  try{storage.setItem(codecJournalKey,JSON.stringify(pending));return true;}
  catch{remove();return false;}
 };
 return {
  begin(configuration){
   pending=null;receiptConsumed=false;
   const valid=codecJournalConfiguration(configuration);
   if(!valid){remove();return false;}
   pending={schemaVersion:1,synthetic:true,pending:true,...valid,
    lastCompleted:null,nextStage:codecJournalStages[0]};
   return write();
  },
  // The callback names the stage which just completed. Only the next expected
  // stage advances the receipt. The last callback clears a fully verified run.
  stage(name){
   if(!pending||name!==pending.nextStage)return false;
   const index=codecJournalStages.indexOf(name);
   if(index===codecJournalStages.length-1){pending=null;receiptConsumed=true;return remove();}
   pending={...pending,lastCompleted:name,nextStage:codecJournalStages[index+1]};
   return write();
  },
  clear(){pending=null;receiptConsumed=true;return remove();},
  recover(){
   if(receiptConsumed)return null;
   let raw;
   try{raw=storage.getItem(codecJournalKey);}catch{return null;}
   if(raw===null||raw===undefined)return null;
   // Consume before parsing, including malformed data. If removal is blocked,
   // this instance still reports a given receipt only once.
   receiptConsumed=true;pending=null;remove();
   if(typeof raw!=='string'||raw.length>2048)return null;
   let receipt;
   try{receipt=codecJournalRecord(JSON.parse(raw));}catch{return null;}
   if(!receipt)return null;
   const failedIndex=codecJournalStages.indexOf(receipt.nextStage);
   return {schemaVersion:1,synthetic:true,productionEligible:false,physicalDeviceVerified:false,
    outcome:'failed',code:'diagnostic-interrupted',failedStage:receipt.nextStage,
    configuration:mobileCodecConfig({codec:{container:'mp4',videoCodec:'avc',audioCodec:'aac',hasAudio:true},
     width:receipt.width,height:receipt.height,fps:receipt.fps,sampleRate:48000}),
    stages:[...codecJournalStages.slice(0,failedIndex).map(stage=>({stage,status:'passed'})),
     {stage:receipt.nextStage,status:'failed',code:'diagnostic-interrupted'}]};
  }
 };
}
