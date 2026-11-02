// Experimental Wivra WebCodecs/Mediabunny audio timeline mixer.
// Render into bounded blocks instead of buffering minutes of Float32 PCM.
// Samples use ORIGINAL timeline time, source trims, speed, and mic offsets.
// Production MediaRecorder and originals are never modified.
import {clipLength, speedOf} from '../core/project.mjs';
import {clipGain} from './export.mjs';

export const ACCELERATED_AUDIO_SAMPLE_RATE = 48000;
export const ACCELERATED_AUDIO_BLOCK_FRAMES = 48000;
export const ACCELERATED_AUDIO_MAX_TRACKS = 32;

function checkAudio({tracks, totalSeconds, sampleRate, blockFrames, channels}) {
  if (!Array.isArray(tracks) || tracks.length > ACCELERATED_AUDIO_MAX_TRACKS ||
      !Number.isFinite(totalSeconds) || totalSeconds <= 0 ||
      !Number.isSafeInteger(sampleRate) || sampleRate < 8000 || sampleRate > 96000 ||
      !Number.isSafeInteger(blockFrames) || blockFrames < 128 ||
      blockFrames > sampleRate * 2 || channels !== 2)
    throw new Error('Invalid accelerated audio mixing limits.');
  for (const lane of tracks) {
    const c = lane?.clip;
    if (!c || !Number.isFinite(c.start) || c.start < 0 ||
        !Number.isFinite(c.in) || c.in < 0 ||
        !Number.isFinite(c.out) || c.out <= c.in ||
        typeof lane.buffers !== 'function')
      throw new Error('Invalid accelerated source audio track.');
    if (c.speed !== undefined && (!Number.isFinite(c.speed) ||
        c.speed < .25 || c.speed > 4))
      throw new Error('Audio speed outside editable range.');
    // Ducking is authored on a voice only, not inferred from music/audio.
    // Reject invalid values rather than silently changing an export mix.
    if(c.ducking !== undefined &&
      (typeof c.ducking !== 'number' || !Number.isFinite(c.ducking) ||
       c.ducking < 0 || c.ducking > 1 || !VOICE_ROLES.has(c.role)))
      throw new Error('Invalid voice ducking in accelerated audio.');
  }
}

const clamped = v => Math.max(-1, Math.min(1, v));
const VOICE_ROLES = new Set(['voice_primary','voice_guest']);
// Fade attenuation at voice boundaries to avoid PCM clicks.  A depth of 0
// keeps original audio, 1 mutes the non-voice bed while the voice is active.
// This is an explicit QA-only authoring knob, not automatic gain reduction.
const DUCK_ATTACK_SECONDS = .04;
const DUCK_RELEASE_SECONDS = .08;
function duckMultiplierAt(time, voiceDucks) {
  let multiplier=1;
  for(const {clip,depth,end} of voiceDucks) {
    if(time<clip.start || time>=end)continue;
    const edge=Math.max(0,Math.min(1,
      (time-clip.start)/DUCK_ATTACK_SECONDS,
      (end-time)/DUCK_RELEASE_SECONDS));
    multiplier=Math.min(multiplier,1-depth*edge);
  }
  return multiplier;
}

// Testable exact window mixer. Each entry has clip and buffers(from,to),
// which returns Mediabunny AudioBufferSink.buffers() wrapped buffers.
// AudioBufferSource.add() APPENDS sequentially, so leading silent blocks
// are required when a microphone begins later than the camera timeline.
// Active audio that cannot be decoded fails instead of disappearing.
export async function* mixAcceleratedAudioBlocks({
  tracks, totalSeconds, sampleRate = ACCELERATED_AUDIO_SAMPLE_RATE,
  blockFrames = ACCELERATED_AUDIO_BLOCK_FRAMES,
  channels = 2, isCancelled = () => false,
  AudioBufferClass = globalThis.AudioBuffer
} = {}) {
  checkAudio({tracks,totalSeconds,sampleRate,blockFrames,channels});
  if (typeof AudioBufferClass !== 'function')
    throw new Error('AudioBuffer unavailable in accelerated mixer.');
  const totalFrames=Math.round(totalSeconds*sampleRate);
  if (!Number.isSafeInteger(totalFrames) || totalFrames <= 0)
    throw new Error('Invalid accelerated audio duration.');
  const voiceDucks=tracks.filter(({clip})=>VOICE_ROLES.has(clip.role) &&
    clip.ducking>0 && clipGain(clip)>0).map(({clip})=>({
    clip,depth:clip.ducking,end:clip.start+clipLength(clip)
  }));
  for (let fromFrame=0;fromFrame<totalFrames;fromFrame+=blockFrames) {
    if (isCancelled()) throw new Error('Accelerated audio mixing cancelled.');
    const count=Math.min(blockFrames,totalFrames-fromFrame);
    const out=new AudioBufferClass({length:count,sampleRate,numberOfChannels:channels});
    const left=out.getChannelData(0),right=out.getChannelData(1);
    if (!(left instanceof Float32Array) || !(right instanceof Float32Array))
      throw new Error('Missing output PCM channels.');
    const start=fromFrame/sampleRate,stop=(fromFrame+count)/sampleRate;
    let mixedTracks=0, decodedBuffers=0, audibleFrames=0;
    for (const lane of tracks) {
      const c=lane.clip, gain=clipGain(c), speed=speedOf(c);
      const activeStart=Math.max(start,c.start);
      const activeStop=Math.min(stop,c.start+clipLength(c));
      if (activeStop<=activeStart || gain<=0) continue;
      const fromSource=c.in+(activeStart-c.start)*speed;
      const toSource=c.in+(activeStop-c.start)*speed;
      const buffers=[];
      // Decode only this required source region plus interpolation guard.
      // Never retain decoded PCM across output windows.
      for await (const entry of lane.buffers(Math.max(0,fromSource-.02),toSource+.02)) {
        if (isCancelled()) throw new Error('Accelerated audio mixing cancelled.');
        const b=entry?.buffer;
        if (!b || !Number.isFinite(entry.timestamp) ||
            !Number.isSafeInteger(b.length) || b.length<=0 ||
            !Number.isFinite(b.sampleRate) || b.sampleRate<8000 ||
            !(b.numberOfChannels>=1 && b.numberOfChannels<=8))
          throw new Error('Corrupt decoded audio buffer.');
        if(b.numberOfChannels>2)
          throw new Error('Surround input requires a validated multichannel downmix.');
        const first=b.getChannelData(0);
        if (!(first instanceof Float32Array) || first.length < b.length)
          throw new Error('Decoded PCM samples are missing.');
        const second=b.numberOfChannels>1 ? b.getChannelData(1):first;
        if (!(second instanceof Float32Array) || second.length < b.length)
          throw new Error('Decoded PCM channels are incomplete.');
        buffers.push({timestamp:entry.timestamp,rate:b.sampleRate,
          length:b.length,left:first,right:second});
        if (++decodedBuffers>256)
          throw new Error('Too many decoded audio buffers in one window.');
      }
      if (!buffers.length)
        throw new Error('An active audio track decoded no samples.');
      buffers.sort((a,b)=>a.timestamp-b.timestamp);
      let cursor=0, found=0, requested=0;
      const begin=Math.max(fromFrame,Math.ceil(activeStart*sampleRate-1e-6));
      const end=Math.min(fromFrame+count,Math.floor(activeStop*sampleRate+1e-6));
      for(let frame=begin;frame<end;frame++) {
        if (isCancelled()) throw new Error('Accelerated audio mixing cancelled.');
        const timelineTime=frame/sampleRate;
        const sourceTime=c.in+(timelineTime-c.start)*speed;
        requested++;
        while(cursor<buffers.length-1 &&
              sourceTime>=buffers[cursor].timestamp+
                buffers[cursor].length/buffers[cursor].rate)
          cursor++;
        const source=buffers[cursor];
        const sourceSample=(sourceTime-source.timestamp)*source.rate;
        if(sourceSample < -0.01 || sourceSample>source.length-1+0.01) continue;
        const ix=Math.min(source.length-1,Math.max(0,Math.floor(sourceSample)));
        const ix2=Math.min(ix+1,source.length-1);
        const frac=Math.max(0,Math.min(1,sourceSample-ix));
        const offset=frame-fromFrame;
        const bedGain=voiceDucks.length && !VOICE_ROLES.has(c.role)
          ?duckMultiplierAt(timelineTime,voiceDucks):1;
        const l=(source.left[ix]*(1-frac)+source.left[ix2]*frac)*gain*bedGain;
        const r=(source.right[ix]*(1-frac)+source.right[ix2]*frac)*gain*bedGain;
        if (!Number.isFinite(l) || !Number.isFinite(r))
          throw new Error('Non-finite accelerated audio sample.');
        left[offset]+=l;right[offset]+=r;
        found++;audibleFrames++;
      }
      // Codec priming can lose a few milliseconds, never a whole voice cut.
      if (requested>0 && requested-found>Math.max(sampleRate*.02,requested*.02))
        throw new Error('Audio source is shorter than its timeline clip.');
      mixedTracks++;
    }
    for(let i=0;i<count;i++) {
      left[i]=clamped(left[i]);right[i]=clamped(right[i]);
    }
    yield {buffer:out,startSeconds:start,frames:count,mixedTracks,
      decodedBuffers,audibleFrames};
  }
}
