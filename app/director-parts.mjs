// Pure offline verification of Ray-Ban's published MP4 checkpoint naming.
// Never infer session membership from gallery time or file-list ordering.
const NAME=/^Wivra_RayBan_[0-9]{10,16}_([0-9a-f]{32})_part([0-9]{4})\.mp4$/;
export const MAX_DIRECTOR_PARTS=40;

export function validateRayBanParts(files) {
 if(!Array.isArray(files)||files.length<2||files.length>MAX_DIRECTOR_PARTS)
  return {ok:false,reason:'Selecciona entre 2 y 40 segmentos de una sola grabación Ray-Ban.'};
 const parts=[],seen=new Set();
 let session=null;
 for(const file of files) {
  if(!file||typeof file.name!=='string'||!Number.isFinite(file.size)||file.size<=0)
   return {ok:false,reason:'Todos los segmentos deben ser archivos de video completos.'};
  const match=NAME.exec(file.name);
  if(!match)return {ok:false,reason:'Solo se aceptan segmentos MP4 con identificador de sesión Ray-Ban.'};
  const [,id,number]=match,part=Number(number);
  if(!part||seen.has(part)||session!==null&&session!==id)
   return {ok:false,reason:'Hay segmentos repetidos o de distintas sesiones.'};
  session=id;seen.add(part);
  parts.push({file,part});
 }
 parts.sort((a,b)=>a.part-b.part);
 if(parts.some((item,i)=>item.part!==i+1))
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
 if(raw.length<1||raw.length>MAX_DIRECTOR_PARTS ||
    new Set(raw).size!==raw.length ||
    raw.some(id=>typeof id!=='string'||!projectIds.has(id)||!availableIds.has(id)))
   return empty;
 if(shot.assetId && shot.assetId!==raw[0])return empty;
 return {assetId:raw[0],assetIds:[...raw]};
}
