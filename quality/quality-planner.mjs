/**
 * AgentCut quality planner experiment. Advisory ONLY: no encoding, deleting,
 * uploading, real codec probing or quality measurement. — ChatGPT
 */
const number=(v,k)=>{if(typeof v!=="number"||!Number.isFinite(v)||v<=0)throw new RangeError(k+" must be positive");return v};
const round=(x)=>Math.round(x*100)/100;
const even=(v)=>Math.max(2,2*Math.floor(v/2));
export function inspectAsset({sizeBytes,durationSeconds,width,height,captureProof=null}){
  [ ["sizeBytes",sizeBytes],["durationSeconds",durationSeconds],["width",width],["height",height] ].forEach(([k,v])=>number(v,k));
  return {file:{sizeBytes,durationSeconds,width,height,avgTotalMbps:round(8*sizeBytes/durationSeconds/1e6)},
    capture: captureProof?.verified===true?{verified:true,description:captureProof.description||"unspecified"}:{verified:false,description:"unknown"},
    warning:"File dimensions are not proof of native capture resolution; average bitrate includes audio and overhead."};
}
export function proxySize(width,height,maxLongEdge=720){
  number(width,"width");number(height,"height");number(maxLongEdge,"maxLongEdge");
  const s=Math.min(1,maxLongEdge/Math.max(width,height));
  return {width:even(width*s),height:even(height*s),upscaled:false};
}
export function planExport(asset,{purpose="archive",pixelEffects=false,exactTrim=false,privacyTrim=false,verifiedSafeCopy=false,device={}}={}){
  if(!asset?.file)throw new TypeError("use inspectAsset output");
  if(!["preview","archive","publish","live"].includes(purpose))throw new RangeError("unsupported purpose");
  const f=asset.file;
  if(purpose==="preview")return {action:"edit_proxy",dimensions:proxySize(f.width,f.height),sourceIntact:true,
    note:"Small proxy accelerates editing but is extra storage; use source for final export."};
  if(purpose==="archive"&&!device.requestCompression&&!pixelEffects&&!exactTrim&&!privacyTrim)
    return {action:"keep_original",codec:"source",sourceIntact:true,note:"No compression or size saving claimed."};
  const safeCopy=verifiedSafeCopy&&!pixelEffects&&!exactTrim&&!privacyTrim&&!device.requestCompression;
  if(safeCopy)return {action:"stream_copy_after_verification",codec:"source",sourceIntact:true,
    note:"Only safe when sample boundaries and output privacy have been verified; copy does not compress."};
  let codec="unknown";
  if(purpose==="archive"){
    if(device.hevcEncodeHardware===true&&device.hevcPlayback===true)codec="hevc";
    else if(device.av1EncodeHardware===true&&device.av1Playback===true)codec="av1";
    else if(device.h264EncodeHardware===true)codec="h264";
  }else if(device.h264EncodeHardware===true)codec="h264";
  return {action:"encode_and_measure",codec,dimensions:{width:f.width,height:f.height,upscaled:false},
    sourceIntact:true,requiresUserApprovalToDeleteSource:true,
    note:codec==="unknown"?"No verified encoder; implementation cannot promise export.":"Measure actual file size, visual quality, audio sync, thermals, battery and compatibility."};
}
export function allocateSceneBudget(scenes,targetVideoMbps){
  number(targetVideoMbps,"targetVideoMbps");
  if(!Array.isArray(scenes)||!scenes.length)throw new RangeError("scenes required");
  const s=scenes.map((item,i)=>{
    number(item.seconds,"seconds");
    const motion=item.motion??0,detail=item.detail??0;
    if(![motion,detail].every(v=>typeof v==="number"&&v>=0&&v<=1&&Number.isFinite(v)))throw new RangeError("motion/detail must be 0..1");
    return {id:item.id??String(i),seconds:item.seconds,weight:0.85+0.85*motion+0.55*detail+(item.textImportant?0.4:0)};
  });
  const seconds=s.reduce((sum,v)=>sum+v.seconds,0);
  const weighted=s.reduce((sum,v)=>sum+v.weight*v.seconds,0);
  const bits=seconds*targetVideoMbps;
  return {totalPlannedMegabits:round(bits),
    scenes:s.map(v=>({id:v.id,seconds:v.seconds,targetVideoMbps:round(bits*v.weight/weighted)})),
    note:"Research heuristic only. A video encoder may not achieve target sizes; validate with VMAF/human playback."};
}
export function hypotheticalSavings(gb,reduction){
  number(gb,"gb");if(typeof reduction!=="number"||reduction<0||reduction>=1)throw new RangeError("reduction must be 0..1");
  return {fromGB:gb,toGB:round(gb*(1-reduction)),savedGB:round(gb*reduction),
    note:"Illustration only, not measured. Originals remain until explicitly deleted."};
}
