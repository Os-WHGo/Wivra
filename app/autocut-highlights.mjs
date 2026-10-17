// AutoCut: multiple highlights from ONE long video, without external models.
// Deterministic, local, reversible. Sound/caption timing is not scene understanding.
import { makeAutoPicker } from './autocut.mjs';
import { planSilenceCut } from './silence.mjs';
import { applyBatch } from '../core/operations.mjs';
import { QA_MIN_TARGET, QA_MAX_TARGET } from './quick-assembly.mjs';

export const AH_MAX_PARTS = 8;
const ahFinite = n => typeof n === 'number' && Number.isFinite(n);
const ahR = n => Math.round(n * 1000) / 1000;

/** Strict safety gate: mixed edits can still use the old single-window planner. */
export function ahSafeSingleSource(project, target) {
  if (!project || !Array.isArray(project.clips) || project.clips.length !== 1 ||
    !ahFinite(target) || target < QA_MIN_TARGET || target > QA_MAX_TARGET ||
    (project.overlayClips || []).length) return null;
  const c = project.clips[0], asset = (project.assets || []).find(a=>a.id===c.asset_id);
  if (!asset || asset.kind === 'image' || !ahFinite(asset.duration) ||
    !ahFinite(c.in) || !ahFinite(c.out) || !ahFinite(c.start) ||
    Math.abs(c.start)>0.002 || c.in<0 || c.out<=c.in ||
    c.out>asset.duration+0.002 || (c.speed !== undefined && c.speed!==1)) return null;
  const len=c.out-c.in;
  if (len<target*1.6 || len<target+2) return null;
  for (const a of project.audioClips || []) {
    const start=a.start, end=start+a.out-a.in;
    if (!ahFinite(start) || !ahFinite(a.in) || !ahFinite(a.out) ||
      a.out<=a.in || (a.speed !== undefined && a.speed!==1) ||
      !['voice_primary','voice_guest','scratch','ambience','other'].includes(a.role || 'other') ||
      Math.max(0,Math.min(end,len)-Math.max(start,0))<len*0.8) return null;
  }
  return {clip:c,len};
}

/**
 * Keep one short window in each temporal bucket. Sound or imported timestamps
 * may move each window within that bucket. With no evidence, use its center.
 * Reuse the existing silence-cut operations to preserve paired microphone
 * tracks and retime subtitles, then atomically VALIDATE before offering Apply.
 */
export function planAutoHighlights(project, {targetSeconds=60,envOf=()=>null}={}) {
  const target=Number(targetSeconds), safe=ahSafeSingleSource(project,target);
  if (!safe) return null;
  const {clip,len}=safe, count=Math.min(AH_MAX_PARTS,Math.max(3,Math.round(target/10)));
  if (target/count<3) return null;
  const picker=makeAutoPicker(typeof envOf==='function'?envOf:()=>null);
  const fromMs=Math.round(clip.in*1000), toMs=Math.round(clip.out*1000);
  const totalMs=Math.round(target*1000);
  const windows=[];
  let chosen=0;
  for (let i=0;i<count;i++) {
    const lo=clip.in+len*i/count, hi=clip.in+len*(i+1)/count;
    const partMs=Math.floor(totalMs/count)+(i<totalMs%count?1:0);
    const lowMs=Math.max(fromMs,Math.ceil(lo*1000)), highMs=Math.min(toMs,Math.floor(hi*1000));
    const lastMs=highMs-partMs;
    if (lastMs-lowMs<30) return {ok:false,error:'No caben los fragmentos con esta duración.'};
    const d=partMs/1000, center=(lo+hi-d)/2;
    const selected=picker({asset_id:clip.asset_id,in:lo,out:hi},d);
    const use=ahFinite(selected)&&selected>=lo&&selected+d<=hi;
    const pickMs=Math.max(lowMs,Math.min(lastMs,Math.round((use?selected:center)*1000)));
    if (use) chosen++;
    windows.push({start:pickMs/1000,end:(pickMs+partMs)/1000,fromEvidence:use});
  }
  const cuts=[];
  let cursor=fromMs;
  for (const w of windows) {
    const start=Math.round(w.start*1000), end=Math.round(w.end*1000);
    if (start-cursor>2) cuts.push({start:cursor/1000,end:start/1000});
    cursor=end;
  }
  if (toMs-cursor>2) cuts.push({start:cursor/1000,end:toMs/1000});
  if (!cuts.length) return null;
  const plan=planSilenceCut(project,{[clip.id]:cuts});
  if (!plan.ok) return {ok:false,error:plan.error};
  const tested=applyBatch(project,plan.ops);
  if (!tested.ok) return {ok:false,error:'El motor rechazó el montaje: '+tested.message};
  const cs=[...tested.project.clips].sort((a,b)=>a.start-b.start);
  const actual=cs.reduce((n,c)=>Math.max(n,c.start+c.out-c.in),0);
  if (Math.abs(actual-target)>0.04 || cs.length!==count ||
    cs.some((c,i)=>c.asset_id!==clip.asset_id ||
      Math.abs(c.in-windows[i].start)>0.01 ||
      Math.abs(c.out-windows[i].end)>0.01)) {
    return {ok:false,error:'El montaje no superó la validación de tiempos.'};
  }
  return {ok:true,ops:plan.ops,before:ahR(len),after:ahR(actual),
    trimmed:1,picked:chosen,highlights:count,windows,
    warnings:[
      'Se seleccionaron '+count+' momentos repartidos por el video ('+chosen+' elegidos por audio o tiempos importados). No reconoce paisajes ni interpreta imágenes.',
      ...(plan.warnings||[])
    ]};
}
