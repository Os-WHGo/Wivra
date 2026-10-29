// Ray-Ban capture journal: platform-neutral state and recoverable segment metadata.
// Native iOS/Android must persist snapshots after each transition; this does NOT
// keep an OS background task alive or record video by itself.
const STATES = new Set(['connecting', 'recording', 'interrupted', 'stopping', 'finalized', 'failed']);
const ALLOWED = {
  connecting: ['recording', 'failed'],
  recording: ['interrupted', 'stopping', 'failed'],
  interrupted: ['recording', 'stopping', 'failed'],
  stopping: ['finalized', 'failed'],
  finalized: [], failed: []
};
const validTime = n => Number.isFinite(n) && n >= 0;
const safeName = s => typeof s === 'string' && s.length > 0 && s.length <= 240 && !/[\x00-\x1f]/.test(s);

export function createCaptureJournal({ id, platform, startedAt = Date.now() } = {}) {
  if (!safeName(id) || !['ios', 'android'].includes(platform) || !validTime(startedAt)) throw new TypeError('Invalid capture session');
  return { schema: 1, id, platform, source: 'rayban-meta', state: 'connecting', startedAt, updatedAt: startedAt, segments: [], interruptions: [], finalFile: null };
}
export function advanceCaptureJournal(journal, { state, at = Date.now(), segment, reason, finalFile } = {}) {
  if (!journal || !STATES.has(journal.state) || !ALLOWED[journal.state].includes(state) || !validTime(at) || at < journal.updatedAt) throw new TypeError('Invalid capture transition');
  const next = { ...journal, state, updatedAt: at, segments: journal.segments.slice(), interruptions: journal.interruptions.slice() };
  if (segment !== undefined) {
    if (!['recording', 'interrupted', 'stopping'].includes(journal.state) || !safeName(segment.file) || !validTime(segment.startMs) || !validTime(segment.endMs) || segment.endMs <= segment.startMs || segment.confirmed !== true) throw new TypeError('Invalid confirmed segment');
    const last = next.segments.at(-1);
    if (last && segment.startMs < last.endMs) throw new TypeError('Overlapping capture segments');
    if (next.segments.some(s => s.file === segment.file)) throw new TypeError('Duplicate capture file');
    next.segments.push({ file: segment.file, startMs: segment.startMs, endMs: segment.endMs, confirmed: true });
  }
  if (state === 'interrupted') next.interruptions.push({ at, reason: typeof reason === 'string' ? reason.slice(0, 160) : 'unknown' });
  if (state === 'finalized') {
    if (!safeName(finalFile) || next.segments.length === 0) throw new TypeError('Cannot finalize without verified output');
    next.finalFile = finalFile;
  }
  return next;
}
export function recoverCaptureJournal(journal) {
  if (!journal || journal.schema !== 1 || !STATES.has(journal.state) || !Array.isArray(journal.segments)) throw new TypeError('Invalid capture journal');
  return { ...journal, recoverableFiles: journal.segments.filter(s => s.confirmed === true && safeName(s.file)).map(s => s.file), requiresReview: journal.state !== 'finalized' };
}

export function appendConfirmedCaptureSegment(journal, segment, at = Date.now()) {
  if (!journal || !['recording', 'interrupted', 'stopping'].includes(journal.state) ||
      !validTime(at) || at < journal.updatedAt || !safeName(segment?.file) ||
      segment.confirmed !== true || !validTime(segment.startMs) ||
      !validTime(segment.endMs) || segment.endMs <= segment.startMs) throw new TypeError('Invalid confirmed segment');
  const last = journal.segments.at(-1);
  if ((last && segment.startMs < last.endMs) || journal.segments.some(s => s.file === segment.file)) throw new TypeError('Overlapping or duplicate segment');
  return { ...journal, updatedAt: at, segments: [...journal.segments, { file: segment.file, startMs: segment.startMs, endMs: segment.endMs, confirmed: true }] };
}
