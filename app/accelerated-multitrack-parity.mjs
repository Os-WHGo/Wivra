// Wivra P0-W: deterministic multi-lane parity ledger for future accelerated
// rendering. This is NOT a renderer or a feature flag. It preserves source
// timing, user-authored edits and missing-media failures before any native
// file is opened. Production MediaRecorder remains the canonical baseline.
import {clipLength, speedOf} from '../core/project.mjs';
import {exportPlan, validateMainVideoExport} from './export.mjs';
import {acceleratedCutEligibility} from './accelerated-cut-renderer.mjs';

export const ACCELERATED_MULTITRACK_PARITY_VERSION = 1;
const LANES = [
  ['main', 'clips'],
  ['overlay', 'overlayClips'],
  ['audio', 'audioClips']
];

export function analyzeAcceleratedMultitrackParity(project, media, {
  maxItems = 1440, maxTimelineSeconds = 4 * 60 * 60
} = {}) {
  const reject = (reason, details = {}) => ({
    valid:false, rendererReady:false, reason, ...details
  });
  if (!project || typeof project !== 'object' || !media || typeof media !== 'object')
    return reject('missing-project-or-media');
  if (!Number.isSafeInteger(maxItems) || maxItems < 1 ||
      !(Number.isFinite(maxTimelineSeconds) && maxTimelineSeconds > 0))
    return reject('invalid-analysis-limits');
  if (!Array.isArray(project.clips) ||
      !Array.isArray(project.overlayClips ?? []) ||
      !Array.isArray(project.audioClips ?? []) ||
      !Array.isArray(project.texts ?? []))
    return reject('invalid-lane-arrays');
  const lists = LANES.map(([type,key]) => [type,project[key] ?? []]);
  const authored = lists.reduce((n,[,items])=>n+items.length,0)
    +(project.texts?.length || 0);
  if (!authored || authored > maxItems) return reject('item-count',{authored});
  const mainGate = validateMainVideoExport(project);
  if (!mainGate.ok) return reject('main-video-'+mainGate.reason,
    {clipId:mainGate.clipId});
  const sourcePlan=exportPlan(project);
  if (!Number.isFinite(sourcePlan.total) || sourcePlan.total <= 0 ||
      sourcePlan.total > maxTimelineSeconds)
    return reject('timeline-duration',{totalSeconds:sourcePlan.total});
  const clips=[], assets=new Map();
  for (const [type,items] of lists) {
    for (const [index,c] of items.entries()) {
      if (!c || typeof c !== 'object' ||
          typeof c.asset_id !== 'string' || !c.asset_id ||
          !Number.isFinite(c.start) || c.start < 0 ||
          !Number.isFinite(c.in) || c.in < 0 ||
          !Number.isFinite(c.out) || c.out <= c.in ||
          (c.speed != null && (!Number.isFinite(c.speed) || c.speed < .25 || c.speed > 4)))
        return reject('invalid-clip',{lane:type,index});
      const duration=clipLength(c), end=c.start+duration;
      if (!Number.isFinite(duration) || duration<=0 || !Number.isFinite(end))
        return reject('invalid-clip-duration',{lane:type,index});
      const source=media[c.asset_id];
      if (!source || typeof source.url !== 'string' || !source.url ||
          !['video','audio','image'].includes(source.kind) ||
          (type==='main' && source.kind!=='video') ||
          (type==='audio' && source.kind!=='audio') ||
          (type==='overlay' && source.kind!=='video' && source.kind!=='image'))
        return reject('missing-or-unsupported-asset',{lane:type,index,assetId:c.asset_id});
      // Do not silently truncate overlays or independent microphone tracks.
      // The v1 export duration is video-led; every later lane must be preserved
      // and explicitly clipped at that same output boundary.
      const effectiveEnd=Math.min(end,sourcePlan.total);
      clips.push({
        lane:type,index,id:c.id,assetId:c.asset_id,sourceKind:source.kind,
        start:c.start,sourceIn:c.in,sourceOut:c.out,speed:speedOf(c),
        duration,end,renderEnd:effectiveEnd,
        visibleDuration:Math.max(0,effectiveEnd-c.start),
        // Preserve *all* authored clip knobs: effects, fades, crop and other
        // future controls cannot disappear while changing render engines.
        authored:structuredClone(c)
      });
      if (!assets.has(c.asset_id)) assets.set(c.asset_id,{
        assetId:c.asset_id,kind:source.kind,url:source.url,
        duration:source.duration??null,width:source.w??null,height:source.h??null
      });
    }
  }
  const texts=[];
  for (const [index,t] of (project.texts??[]).entries()) {
    if (!t || typeof t!=='object' || !Number.isFinite(t.start) ||
        !Number.isFinite(t.end) || t.start<0 || t.end<=t.start)
      return reject('invalid-text',{index});
    texts.push({index,start:t.start,end:t.end,
      visibleEnd:Math.min(t.end,sourcePlan.total),authored:structuredClone(t)});
  }
  const cutGate=acceleratedCutEligibility(project,media);
  const needsParity={
    overlays:(project.overlayClips??[]).length>0,
    independentAudio:(project.audioClips??[]).length>0,
    captions:texts.length>0,
    speeds:clips.some(c=>c.speed!==1),
    multipleVideoAssets:new Set(clips.filter(c=>c.lane==='main').map(c=>c.assetId)).size>1,
    extraEffects:!!(project.effects?.length||project.transitions?.length),
    timelineGaps:sourcePlan.segments.some(s=>s.type==='gap'),
    textsBeyondEnd:sourcePlan.textBeyondEnd
  };
  return {
    version:ACCELERATED_MULTITRACK_PARITY_VERSION,
    valid:true,
    // Analysis NEVER grants production acceleration. Even simple cuts must
    // pass native device codec tests and the explicit experimental gate.
    rendererReady:false,
    cutOnlyExperimentalEligible:cutGate.eligible,
    cutOnlyDenyReason:cutGate.eligible?null:cutGate.reason,
    totalSeconds:sourcePlan.total, authoredItems:authored,
    segments:sourcePlan.segments.map(s=>({type:s.type,
      start:s.type==='gap'?s.start:s.clip.start,duration:s.dur,
      clipId:s.clip?.id??null})),
    tracks:clips, captions:texts, assets:[...assets.values()],
    needsParity,
    authoredEffects:structuredClone(project.effects??[]),
    authoredTransitions:structuredClone(project.transitions??[])
  };
}
