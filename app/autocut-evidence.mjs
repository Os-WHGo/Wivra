/**
 * AutoCut: contrato de tiempos de voz para ASR LOCAL futuro y subtítulos importados.
 * No instala Whisper, no transcribe ni declara escenas semánticas.
 * Los tiempos son relativos a cada archivo de medios (no a la timeline).
 */
export const AUTOCUT_TIMED_SCHEMA = 'wivra-timed-speech-v1';
export const AUTOCUT_MAX_SEGMENTS = 30000;
const acsRound2 = n => Math.round(n * 100) / 100;
const acsIsFinite = n => typeof n === 'number' && Number.isFinite(n);

/**
 * {schema, granularity:'word'|'segment', source:'local_asr'|'timestamped_import',
 *  durationSeconds, segments:[{start,end,text,confidence?}], visualChanges?:[{time,delta}]}
 * "segment" NO equivale a marcas por palabra. "timestamped_import" NO demuestra
 * que lo dicho corresponda al audio. Solo se usan datos aportados explícitamente.
 */
export function normalizeTimedSpeech(input) {
  if (!input || input.schema !== AUTOCUT_TIMED_SCHEMA ||
      !['word','segment'].includes(input.granularity) ||
      !['local_asr','timestamped_import'].includes(input.source) ||
      !acsIsFinite(input.durationSeconds) || input.durationSeconds <= 0 || input.durationSeconds > 86400 ||
      !Array.isArray(input.segments) || !input.segments.length ||
      input.segments.length > AUTOCUT_MAX_SEGMENTS) return null;
  const words = [];
  for (const x of input.segments) {
    if (!x || !acsIsFinite(x.start) || !acsIsFinite(x.end) || x.start < 0 ||
        x.end <= x.start || x.end > input.durationSeconds + 0.02 ||
        typeof x.text !== 'string' || !x.text.trim() || x.text.length > 512 ||
        (x.confidence !== undefined && (!acsIsFinite(x.confidence) || x.confidence < 0 || x.confidence > 1))) return null;
    words.push({ start:x.start, end:x.end, weight: x.confidence === undefined ? 1 : 0.5 + 0.5 * x.confidence });
  }
  words.sort((a,b) => a.start - b.start || a.end - b.end);
  // Scene changes only mark observed frame discontinuities; NOT scenic quality.
  const visualChanges = Array.isArray(input.visualChanges) && input.visualChanges.length <= 500
    ? input.visualChanges.filter(x => x && acsIsFinite(x.time) && x.time >= 0 && x.time <= input.durationSeconds &&
        acsIsFinite(x.delta) && x.delta >= 0 && x.delta <= 1).map(x => x.time).sort((a,b)=>a-b) : [];
  return { words, visualChanges, granularity:input.granularity, source:input.source, durationSeconds:input.durationSeconds };
}
function acsStartAfter(words, time) {
  // Sorted by start: find first interval whose start could overlap time.
  let l=0,r=words.length;
  while (l<r) { const m=(l+r)>>1; if (words[m].start < time) l=m+1; else r=m; }
  return l;
}
/** Return timed evidence based cut, or null when no trustworthy timing contract. */
export function bestTimedWindow(input, from, to, duration) {
  const data = normalizeTimedSpeech(input);
  if (!data || !acsIsFinite(from) || !acsIsFinite(to) || !acsIsFinite(duration) || from < 0 ||
      to > data.durationSeconds + 0.02 || duration <= 0 || to - from <= duration + 1e-6) return null;
  const words = data.words.filter(w => w.end > from && w.start < to);
  if (!words.length) return null;
  const last = to - duration, center = from + (to - from - duration) / 2;
  const candidates = new Set([acsRound2(center),acsRound2(from),acsRound2(last)]);
  const add = t => { if (acsIsFinite(t)) candidates.add(acsRound2(Math.max(from, Math.min(last,t)))); };
  // Bounded sampling: long interviews must not lock up the phone.
  const stride = Math.max(1,Math.ceil(words.length/450));
  for (let i=0; i<words.length; i+=stride) {
    const w=words[i];
    add(w.start-0.12); add(w.end+0.12); add(w.start-duration-0.12); add(w.end-duration+0.12);
  }
  const visual = data.visualChanges.filter(t => t>=from && t<=to);
  for (const t of visual) { add(t); add(t-duration); }
  const score = s => {
    const e=s+duration;
    let overlap=0, cuts=0;
    // A word beginning before s can overlap s; handle rare overlaps from prior words.
    let idx=acsStartAfter(words,s);
    while (idx>0 && words[idx-1].end > s) idx--;
    for (let i=idx;i<words.length && words[i].start<e;i++) {
      const w=words[i], shared=Math.max(0,Math.min(e,w.end)-Math.max(s,w.start));
      if (!shared) continue;
      overlap += shared*w.weight;
      if (w.start < s-0.01 && w.end > s+0.01) cuts++;
      if (w.start < e-0.01 && w.end > e+0.01) cuts++;
    }
    // Discontinuity supports a neat boundary, never "best landscape" claims.
    const boundary = visual.some(t => Math.abs(t-s)<=0.12 || Math.abs(t-e)<=0.12) ? 0.025 : 0;
    return overlap/duration - cuts*0.35 + boundary;
  };
  const centerScore=score(center); let best=center, bestScore=centerScore;
  for (const s of candidates) {
    const value=score(s);
    if (value>bestScore+1e-7 || (Math.abs(value-bestScore)<1e-7 && Math.abs(s-center)<Math.abs(best-center))) {
      best=s;bestScore=value;
    }
  }
  if (bestScore < 0.04) return null;
  const moved = bestScore - centerScore >= 0.045 && Math.abs(best-center)>=0.02;
  return { start: acsRound2(moved?best:center),score:acsRound2(bestScore),centerScore:acsRound2(centerScore),moved,
    granularity:data.granularity,source:data.source,method:'timestamped_speech_boundaries' };
}
