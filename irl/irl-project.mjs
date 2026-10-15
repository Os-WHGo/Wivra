/**
 * AgentCut IRL session planning utilities.
 * Marker-based draft suggestions; no AI or video analysis is performed.
 * Timestamp values are seconds from start of media. All functions are pure.
 * — ChatGPT
 */
function safeDuration(s) {
  if(!Number.isFinite(s)||s<=0)throw new RangeError('durationSeconds must be > 0');
  return s;
}
export function addMarker(markers,seconds, label='Momento', durationSeconds=Infinity){
  if(!Array.isArray(markers))throw new TypeError('markers must be array');
  if(!Number.isFinite(seconds)||seconds<0||seconds>durationSeconds)
    throw new RangeError('marker must be inside recorded duration');
  const id='m'+(markers.reduce((mx,m)=>Math.max(mx,Number(String(m.id).replace('m',''))||0),0)+1);
  return [...markers,{id,second:Math.round(seconds*1000)/1000,label:String(label).trim().slice(0,100)||'Momento'}];
}
export function suggestHighlights(markers,durationSeconds,{before=7,after=12,maxClips=12}={}){
  safeDuration(durationSeconds);
  if(!Array.isArray(markers))throw new TypeError('markers must be array');
  for(const n of [before,after]){
    if(!Number.isFinite(n)||n<0)throw new RangeError('before/after must be >=0');
  }
  if(!Number.isInteger(maxClips)||maxClips<1)throw new RangeError('maxClips must be positive integer');
  const windows=markers.filter(m=>Number.isFinite(m.second)&&m.second>=0&&m.second<=durationSeconds)
    .map(m=>({startSeconds:Math.max(0,m.second-before),endSeconds:Math.min(durationSeconds,m.second+after),markerIds:[m.id],reasons:[m.label]}))
    .filter(w=>w.endSeconds>w.startSeconds)
    .sort((a,b)=>a.startSeconds-b.startSeconds);
  const result=[];
  for(const w of windows){
    const last=result[result.length-1];
    if(last && w.startSeconds<=last.endSeconds){
      last.endSeconds=Math.max(last.endSeconds,w.endSeconds);
      last.markerIds.push(...w.markerIds);
      last.reasons.push(...w.reasons);
    } else result.push({...w});
  }
  return result.slice(0,maxClips).map((v,i)=>({
    id:'h'+(i+1),startSeconds:Math.round(v.startSeconds*1000)/1000,
    endSeconds:Math.round(v.endSeconds*1000)/1000,
    markerIds:v.markerIds,reasons:v.reasons,
    provenance:'manual_markers_only',
    note:'Candidato basado SOLO en marcas manuales. No hubo análisis audiovisual ni IA.'
  }));
}
export function makeProject({sourceType, filename, durationSeconds, mimeType, markers=[],capturedAtUtc=null}){
  safeDuration(durationSeconds);
  if(!['camera_local','imported_local'].includes(sourceType))throw new RangeError('sourceType unsupported');
  if(!Array.isArray(markers))throw new TypeError('markers must be array');
  return {
    schemaVersion:'agentcut-irl-0.1',
    source:{sourceType,filename:String(filename||'video local'),durationSeconds,mimeType:String(mimeType||'unknown'),capturedAtUtc},
    markers:markers.map(m=>({...m})),
    suggestions:suggestHighlights(markers,durationSeconds),
    publication:false,uploaded:false,
    storageNote:'Manifest does not contain video data. Save the original clip separately.',
    analysisStatus:'manual_marker_candidates_not_ai'
  };
}
