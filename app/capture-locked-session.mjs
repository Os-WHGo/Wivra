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
const safeName = s => typeof s === 'string' && s.length > 0 && s.length <= 240 &&
  s !== '.' && s !== '..' && !/[\x00-\x1f\x7f/\\:]/.test(s);
export const isCaptureFileName = safeName;

export function createCaptureJournal({ id, platform, startedAt = Date.now() } = {}) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) || !['ios', 'android'].includes(platform) || !validTime(startedAt)) throw new TypeError('Invalid capture session');
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
  if (typeof journal.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(journal.id) ||
      !['ios', 'android'].includes(journal.platform) || journal.source !== 'rayban-meta' ||
      !validTime(journal.startedAt) || !validTime(journal.updatedAt) || journal.updatedAt < journal.startedAt ||
      !Array.isArray(journal.interruptions) || journal.interruptions.some((event, index, events) =>
        !event || !validTime(event.at) || event.at < journal.startedAt || event.at > journal.updatedAt ||
        (index > 0 && event.at < events[index - 1].at) || typeof event.reason !== 'string' || event.reason.length > 160) ||
      (journal.state === 'finalized' && (!safeName(journal.finalFile) || journal.segments.length === 0))) {
    throw new TypeError('Invalid capture journal envelope');
  }
  // Recovery must not trust a corrupt persisted snapshot or expose unsafe names.
  const verified = [];
  for (const segment of journal.segments) {
    if (!segment || segment.confirmed !== true || !safeName(segment.file) ||
        !validTime(segment.startMs) || !validTime(segment.endMs) ||
        segment.endMs <= segment.startMs ||
        verified.some(previous => previous.file === segment.file || segment.startMs < previous.endMs)) break;
    verified.push(segment);
  }
  return { ...journal, recoverableFiles: verified.map(s => s.file),
    requiresReview: journal.state !== 'finalized' || verified.length !== journal.segments.length };
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
