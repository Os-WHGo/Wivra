// Pure offline verification of Ray-Ban's published MP4 checkpoint naming.
// Never infer session membership from gallery time or file-list ordering.
const NAME=/^Wivra_RayBan_[0-9]{10,16}_([0-9a-f]{32})_part([0-9]{4})\.mp4$/;
export const MAX_DIRECTOR_PARTS=40;
// One Director take can accumulate many independent 30-second MP4 parts.
// Only a bounded batch is decoded/imported at once to protect mobile memory.
export const MAX_SHOT_PARTS=1440;

export function validateRayBanParts(files,{nextPart=1,expectedSessionId=null}={}) {
 if(!Number.isSafeInteger(nextPart)||nextPart<1||nextPart>MAX_SHOT_PARTS||
    (expectedSessionId!==null&&!/^[0-9a-f]{32}$/.test(expectedSessionId))||
    !Array.isArray(files)||files.length<(nextPart===1?2:1)||
    files.length>MAX_DIRECTOR_PARTS||nextPart+files.length-1>MAX_SHOT_PARTS)
  return {ok:false,reason:'Selecciona entre 2 y 40 segmentos de una sola grabación Ray-Ban.'};
 const parts=[],seen=new Set();
 let session=null;
 for(const file of files) {
  if(!file||typeof file.name!=='string'||!Number.isFinite(file.size)||file.size<=0)
   return {ok:false,reason:'Todos los segmentos deben ser archivos de video completos.'};
  const match=NAME.exec(file.name);
  if(!match)return {ok:false,reason:'Solo se aceptan segmentos MP4 con identificador de sesión Ray-Ban.'};
  const [,id,number]=match,part=Number(number);
  if(!part||seen.has(part)||session!==null&&session!==id||
     expectedSessionId!==null&&id!==expectedSessionId)
   return {ok:false,reason:'Hay segmentos repetidos o de distintas sesiones.'};
  session=id;seen.add(part);
  parts.push({file,part});
 }
 parts.sort((a,b)=>a.part-b.part);
 if(parts.some((item,i)=>item.part!==nextPart+i))
  return {ok:false,reason:'Falta un segmento anterior o intermedio. No se importó la toma incompleta.'};
 return {ok:true,sessionId:session,files:parts.map(x=>x.file)};
}


/**
 * Rehydrate ONLY real, available project assets. Project metadata can survive
 * even when its IndexedDB media blob was evicted or a save ran out of space.
 * Never claim a complete Ray-Ban take when any one part is unavailable.
 */
export function restoreDirectorAssetLinks(shot,projectIds,availableIds) {
 const empty={assetId:null,assetIds:[]};
 if(!shot||!projectIds||!availableIds) return empty;
 const raw=Array.isArray(shot.assetIds) ? shot.assetIds :
   (typeof shot.assetId==='string'&&shot.assetId ? [shot.assetId] : []);
 if(raw.length<1||raw.length>MAX_SHOT_PARTS ||
    new Set(raw).size!==raw.length ||
    raw.some(id=>typeof id!=='string'||!projectIds.has(id)||!availableIds.has(id)))
   return empty;
 if(shot.assetId && shot.assetId!==raw[0])return empty;
 return {assetId:raw[0],assetIds:[...raw]};
}

/** Positions for independently playable MP4 parts.
 * Never round at every cut: 40×30.003s accumulates timing errors when
 * individual boundaries are snapped to 10ms. Renderer may round labels.
 */
export function rayBanPartPositions(durations, start=0) {
 if(!Array.isArray(durations)||!durations.length||durations.length>MAX_DIRECTOR_PARTS||
    !Number.isFinite(start)||start<0||
    durations.some(d=>!Number.isFinite(d)||d<=0))
   throw new Error('Duraciones o punto de inserción Ray-Ban inválidos.');
 const starts=[];let cursor=start;
 for(const duration of durations){starts.push(cursor);cursor+=duration}
 return {starts,end:cursor,total:cursor-start};
}

/**
 * Inspect the FIRST already imported batch without reopening its video bytes.
 * Metadata must still describe parts 0001..N of exactly one Ray-Ban session.
 * A regular video cannot be accidentally appended to a Ray-Ban recording.
 */
export function rayBanContinuation(shot,project) {
 const ids=Array.isArray(shot?.assetIds)&&shot.assetIds.length
   ? shot.assetIds : (shot?.assetId?[shot.assetId]:[]);
 if(!ids.length||ids.length>=MAX_SHOT_PARTS||new Set(ids).size!==ids.length||
    !Array.isArray(project?.assets))return null;
 const lookup=new Map(project.assets.map(a=>[a.id,a.name]));
 let id=null;
 for(let i=0;i<ids.length;i++){
   const name=lookup.get(ids[i]),match=typeof name==='string'?NAME.exec(name):null;
   if(!match||Number(match[2])!==i+1||(id!==null&&id!==match[1]))return null;
   id=match[1];
 }
 return {sessionId:id,nextPart:ids.length+1,assetIds:[...ids]};
}

/** Resume only after a complete, unedited, contiguous run of the prior parts.
 * Never append to the cursor after an unrelated edit or altered source trim.
 */
export function rayBanAppendAt(assetIds,project) {
 if(!Array.isArray(assetIds)||!assetIds.length||
    !Array.isArray(project?.clips)||!Array.isArray(project?.assets))return null;
 const assets=new Map(project.assets.map(a=>[a.id,a]));
 let end=null;
 for(const id of assetIds){
   const clips=project.clips.filter(c=>c.asset_id===id);
   if(clips.length!==1)return null;
   const c=clips[0],asset=assets.get(id),speed=c.speed??1;
   if(!asset||!Number.isFinite(asset.duration)||asset.duration<=0||
      !Number.isFinite(c.start)||c.start<0||!Number.isFinite(c.in)||
      !Number.isFinite(c.out)||Math.abs(c.in)>1e-6||
      Math.abs(c.out-asset.duration)>1e-6||speed!==1||
      (end!==null&&Math.abs(c.start-end)>1e-6))return null;
   end=c.start+asset.duration;
 }
 return end;
}
