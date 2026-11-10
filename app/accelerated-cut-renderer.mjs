// Wivra accelerated export, first SHARED WebCodecs+Mediabunny cut renderer.
// Extracted from Claude's tools/export-engine-benchmark.cjs (Mediabunny 1.61.6).
// This module is intentionally NOT selected by the production recordProject:
// it lacks overlays, video speed, loudness, layered audio, native random-write
// v2, bundled offline library and device QA. Do not claim beta acceleration.
// Always keep original MediaRecorder pipeline until the full timeline is proven.
//
// M = locally bundled Mediabunny, injected rather than downloaded at runtime.
// writeAt(position, Uint8Array) must write atomically at arbitrary offsets.
// In particular MP4 moov/header fixes can OVERWRITE previously written bytes.
// The legacy append-only CRC sink must never be used for this transport.
import {mobileCodecConfig} from './accelerated-native-codec-probe.mjs';

export const ACCELERATED_CUT_RENDERER_VERSION = 1;
// Encoded cuts must cover their authored source intervals. Tolerate a few
// milliseconds of frame timestamp rounding/keyframe seeking, not long black
// or frozen gaps silently emitted by a partially decoded video track.
export const ACCELERATED_CUT_MAX_VIDEO_GAP_SECONDS = 0.1;

export function acceleratedCutEligibility(project, media, { maxSeconds = 120, maxCuts = 80,
  loudnessGainDb = 0 } = {}) {
  const deny = reason => ({ eligible: false, reason });
  const clips = project?.clips;
  if (!Array.isArray(clips) || !clips.length || clips.length > maxCuts) return deny('clip-count');
  if ((project.overlayClips || []).length || (project.audioClips || []).length ||
      (project.texts || []).length) return deny('other-tracks');
  if (Math.abs(Number(loudnessGainDb) || 0) > 0.001) return deny('master-audio');
  if (project.format?.aspect && project.format.aspect !== 'original') return deny('format');
  if (project.format?.fit && project.format.fit !== 'contain') return deny('fit');
  if (project.transitions?.length || project.effects?.length) return deny('effects');
  const first = clips[0], source = media?.[first.asset_id];
  if (!source || source.kind !== 'video' || !source.url ||
      !(source.w > 0 && source.h > 0) || !Number.isFinite(source.w * source.h)) return deny('source');
  const cuts = [];
  // Whitelist only properties with understood semantics. A new clip effect,
  // transform, composite, fade or look must NOT silently disappear in fast mode.
  const safeClipKeys = new Set(['id', 'asset_id', 'start', 'in', 'out', 'volume', 'muted', 'speed']);
  let nextStart = 0;
  for (const clip of clips) {
    const len = clip.out - clip.in;
    if (Object.keys(clip).some(key => !safeClipKeys.has(key) && clip[key] != null))
      return deny('unsupported-clip-property');
    if (clip.asset_id !== first.asset_id || !(len > 0.001) || !Number.isFinite(len) ||
        !Number.isFinite(clip.start) || !Number.isFinite(clip.in) ||
        !Number.isFinite(clip.out) || clip.in < 0 ||
        Math.abs(clip.start - nextStart) > 0.0005) return deny('timeline');
    // Only clean A/V cuts: reject muted/volume-adjusted audio, speed, filters
    // and text/effects rather than silently flattening or dropping them.
    if (clip.muted || (clip.volume != null && clip.volume !== 1) ||
        (clip.speed != null && clip.speed !== 1) ||
        clip.filters?.length || clip.filter || clip.effects?.length ||
        clip.transition || clip.shape || clip.crop) return deny('clip-effects');
    cuts.push({ in: clip.in, out: clip.out });
    nextStart += len;
  }
  if (!(nextStart > 0) || nextStart > maxSeconds) return deny('duration');
  return { eligible: true, cuts, sourceUrl: source.url, width: source.w,
    height: source.h, totalSeconds: nextStart };
}

/** Validates SDK's random-offset write contract, without changing existing v1. */
export function checkedRandomWrite(writeAt, { maxChunkBytes = 4 * 1024 * 1024 } = {}) {
  if (typeof writeAt !== 'function') throw new TypeError('Random-access native writer required.');
  let writes = 0, lastEnd = 0;
  return {
    get writes() { return writes; },
    get highWaterBytes() { return lastEnd; },
    async write(position, data) {
      if (!Number.isSafeInteger(position) || position < 0 || !(data instanceof Uint8Array) ||
          !data.length || data.byteLength > maxChunkBytes ||
          position + data.byteLength > Number.MAX_SAFE_INTEGER)
        throw new Error('Invalid accelerated random-access write.');
      const n = await writeAt(position, data);
      // Native must acknowledge actual write length, never assume success.
      if (n !== data.byteLength) throw new Error('Incomplete accelerated media write.');
      writes++;
      lastEnd = Math.max(lastEnd, position + n);
    }
  };
}

/**
 * Renders a single-source cut timeline with source audio preserved.
 * This is an isolated *executable renderer* shared with the benchmark, not a
 * production UI/phone export until fully bundled and QA'd.
 */
export async function renderAcceleratedCuts({
  M, sourceUrl, cuts, width, height, writeAt,
  expectedAudio = null, label = '', isCancelled = () => false,
  videoBitrate = 2_000_000, audioBitrate = 96_000,
  nativeCodecPlan = null
}) {
  if (!M || typeof M.Input !== 'function' || typeof M.StreamTarget !== 'function')
    throw new Error('Mediabunny unavailable in this offline build.');
  if (!(width > 0 && height > 0) || !Number.isFinite(width * height))
    throw new Error('Invalid video dimensions.');
  if (!Array.isArray(cuts) || !cuts.length ||
      cuts.some(c => !Number.isFinite(c.in) || !Number.isFinite(c.out) ||
        c.in < 0 || !(c.out > c.in))) throw new Error('Invalid accelerated cuts.');
  if (isCancelled()) throw new Error('Accelerated export cancelled.');
  const writer = checkedRandomWrite(writeAt);
  const input = new M.Input({ source: new M.UrlSource(sourceUrl), formats: M.ALL_FORMATS });
  let output, finalized=false;
  try {
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    if (!video) throw new Error('No decodable source video.');
    if (expectedAudio === true && !audio) throw new Error('Source audio disappeared.');
    if (expectedAudio === false && audio) throw new Error('Unexpected source audio.');
    const codec = await M.getFirstEncodableVideoCodec(['avc', 'vp9', 'vp8'],
      { width, height });
    if (!codec) throw new Error('No supported WebCodecs video encoder.');
    const hasAudio = !!audio;
    const aac = hasAudio && await M.canEncodeAudio('aac');
    const avc = codec === 'avc' && (!hasAudio || aac);
    const chosenCodec = avc ? 'avc' :
      (codec !== 'avc' ? codec :
        await M.getFirstEncodableVideoCodec(['vp9', 'vp8'], { width, height }));
    if (!chosenCodec) throw new Error('No valid video and audio codec pair.');
    if (hasAudio && !avc && !(await M.canEncodeAudio('opus')))
      throw new Error('No compatible audio codec.');
    const container = avc ? 'mp4' : 'webm', audioCodec = !hasAudio ? null :
      (avc ? 'aac' : 'opus');
    // A mobile preflight is only valid for the same codec and bitrate
    // selected by the real renderer. Never silently downgrade to WebM
    // after approval of an H.264/AAC MP4 output.
    if (nativeCodecPlan && (nativeCodecPlan.videoCodec!==chosenCodec ||
        nativeCodecPlan.audioCodec!==audioCodec ||
        nativeCodecPlan.container!==container ||
        nativeCodecPlan.hasAudio!==hasAudio))
      throw new Error('Los códecs reales de corte difieren del preflight nativo.');
    const nativeConfig=nativeCodecPlan?mobileCodecConfig({
      codec:nativeCodecPlan,width,height,fps:30,sampleRate:48000,
      videoBitrate,audioBitrate
    }):null;
    const checkActualEncoder=(kind,actual)=>{
      const expected=nativeConfig[kind];
      const keys=kind==='video'?['codec','width','height','framerate','bitrate']:
        ['codec','sampleRate','numberOfChannels','bitrate'];
      if(!actual || keys.some(key=>actual[key]!==expected[key]) ||
         (expected.avc && actual.avc?.format!==expected.avc.format))
        throw new Error('La configuración del codificador de corte no coincide con el preflight.');
    };
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const g = canvas.getContext('2d');
    if (!g) throw new Error('Canvas 2D unavailable.');

    // StreamTarget supports patching offsets. Existing v1 append+CRC cannot.
    // Await each individual write for backpressure; never ignore native errors.
    const writable = new WritableStream({
      write: chunk => writer.write(chunk.position, chunk.data)
    });
    output = new M.Output({
      format: avc ? new M.Mp4OutputFormat({ fastStart: false }) : new M.WebMOutputFormat(),
      target: new M.StreamTarget(writable, { chunked: true, chunkSize: 1 << 20 })
    });
    const videoSource = new M.CanvasSource(canvas,
      { codec: chosenCodec, bitrate: videoBitrate, keyFrameInterval: 1,
        ...(nativeConfig?{fullCodecString:nativeConfig.video.codec,
          onEncoderConfig:config=>checkActualEncoder('video',config)}:{}) });
    output.addVideoTrack(videoSource, { frameRate: 30 });
    const audioSource = hasAudio ?
      new M.AudioBufferSource({ codec: audioCodec, bitrate: audioBitrate,
        ...(nativeConfig?{fullCodecString:nativeConfig.audio.codec,
          onEncoderConfig:config=>checkActualEncoder('audio',config)}:{}) }) : null;
    if (audioSource) output.addAudioTrack(audioSource);
    await output.start();
    const videoSink = new M.CanvasSink(video,
      { width, height, fit: 'contain' });
    const audioSink = hasAudio ? new M.AudioBufferSink(audio) : null;
    let position = 0, frames = 0, audioBuffers = 0;
    for (const cut of cuts) {
      if (isCancelled()) throw new Error('Accelerated export cancelled.');
      let cutFrames = 0, coveredThrough = cut.in;
      for await (const wc of videoSink.canvases(cut.in, cut.out)) {
        if (isCancelled()) throw new Error('Accelerated export cancelled.');
        if (!Number.isFinite(wc?.timestamp) || !Number.isFinite(wc.duration) ||
            wc.duration<=0)
          throw new Error('Invalid decoded cut video timestamp or duration.');
        const s = Math.max(wc.timestamp, cut.in);
        const e = Math.min(wc.timestamp + wc.duration, cut.out);
        if (!(e > s)) continue;
        if (s-coveredThrough > ACCELERATED_CUT_MAX_VIDEO_GAP_SECONDS)
          throw new Error('Decoded cut video contains an uncovered frame gap.');
        g.drawImage(wc.canvas, 0, 0, width, height);
        if (label) {
          g.fillStyle = '#fff'; g.font = '700 28px sans-serif';
          g.textAlign = 'center'; g.fillText(label, width / 2, height - 30);
        }
        await videoSource.add(position + s - cut.in, e - s);
        coveredThrough=Math.max(coveredThrough,e);
        frames++; cutFrames++;
      }
      if (!cutFrames) throw new Error('Source cut produced no video frames.');
      if (cut.out-coveredThrough > ACCELERATED_CUT_MAX_VIDEO_GAP_SECONDS)
        throw new Error('Decoded cut video ends before its authored out point.');
      if (audioSink) {
        // A global audioBuffers>0 used to permit the first cut to contain
        // sound while a later cut silently lost its audio entirely.
        let cutAudioBuffers=0, audioCoveredThrough=cut.in;
        for await (const wb of audioSink.buffers(cut.in, cut.out)) {
          if (isCancelled()) throw new Error('Accelerated export cancelled.');
          const b=wb?.buffer;
          if (!Number.isFinite(wb?.timestamp) || !Number.isFinite(wb.duration) ||
              wb.duration<=0 || !Number.isSafeInteger(b?.length) || b.length<=0 ||
              !Number.isFinite(b.sampleRate) || b.sampleRate<=0 ||
              ![1,2].includes(b.numberOfChannels) ||
              typeof b.getChannelData!=='function')
            throw new Error('Invalid decoded cut audio samples or channels.');
          const s=Math.max(wb.timestamp,cut.in);
          const e=Math.min(wb.timestamp+wb.duration,cut.out);
          if (!(e>s)) continue;
          if (s-audioCoveredThrough>ACCELERATED_CUT_MAX_VIDEO_GAP_SECONDS)
            throw new Error('Decoded cut audio contains an uncovered gap.');
          const from=Math.round((s-wb.timestamp)*b.sampleRate);
          const length=Math.round((e-s)*b.sampleRate);
          if (!length)continue;
          if (from<0 || from>=b.length || from+length>b.length+1)
            throw new Error('Decoded cut audio is shorter than its requested segment.');
          const part=new AudioBuffer({length,sampleRate:b.sampleRate,
            numberOfChannels:b.numberOfChannels});
          for(let ch=0;ch<b.numberOfChannels;ch++){
            const pcm=b.getChannelData(ch);
            if(!(pcm instanceof Float32Array)||pcm.length<from+length-1)
              throw new Error('Decoded cut audio channel is incomplete.');
            part.copyToChannel(pcm.subarray(from,from+length),ch);
          }
          await audioSource.add(part);
          audioBuffers++;cutAudioBuffers++;
          audioCoveredThrough=Math.max(audioCoveredThrough,e);
        }
        if(!cutAudioBuffers || cut.out-audioCoveredThrough>ACCELERATED_CUT_MAX_VIDEO_GAP_SECONDS)
          throw new Error('Decoded cut audio missing before its authored out point.');
      }
      position += cut.out - cut.in;
    }
    if (hasAudio && !audioBuffers) throw new Error('Audio decoding yielded no samples.');
    if (isCancelled()) throw new Error('Accelerated export cancelled.');
    await output.finalize();
    finalized=true;
    return { engine: 'webcodecs-mediabunny', container, videoCodec: chosenCodec,
      audioCodec, durationSeconds: position, frames, audioBuffers,
      writes: writer.writes, outputBytes: writer.highWaterBytes };
  } finally {
    // The cut path must release its decoder, just like the multitrack path.
    // On encoder failure, release the writable before the native caller
    // aborts the temporary file. Never delete any user original.
    if (!finalized && typeof output?.cancel === 'function') {
      try { await output.cancel(); } catch { /* native abort still follows */ }
    }
    try { await input.dispose?.(); } catch { /* cleanup is best-effort */ }
  }
}
