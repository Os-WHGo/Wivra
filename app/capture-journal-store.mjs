// Durable storage contract for native Ray-Ban capture journals.
// The host supplies atomic write/read/list primitives (Android/iOS). This
// module cannot grant background execution or access the camera.
import { createCaptureJournal, advanceCaptureJournal, recoverCaptureJournal, appendConfirmedCaptureSegment } from './capture-locked-session.mjs';

// Multiple coordinators can wrap the same native writer in one JS realm.
// This is not a substitute for native atomic writes or cross-process CAS.
const writerLocks = new WeakMap();

export function createCaptureJournalStore({ writeAtomic, read, list } = {}) {
  if (typeof writeAtomic !== 'function' || typeof read !== 'function' || typeof list !== 'function') throw new TypeError('Native storage callbacks required');
  if (!writerLocks.has(writeAtomic)) writerLocks.set(writeAtomic, new Set());
  const locks = writerLocks.get(writeAtomic);
  const withLock = async (id, fn) => {
    if (locks.has(id)) throw new Error('Concurrent session mutation');
    locks.add(id);
    try { return await fn(); } finally { locks.delete(id); }
  };
  const key = id => {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new TypeError('Unsafe session id');
    return 'wivra-capture-' + id + '.json';
  };
  async function load(id) {
    const data = await read(key(id));
    if (data == null) return null;
    const j = JSON.parse(data);
    if (j.id !== id || j.schema !== 1 || !Array.isArray(j.segments)) throw new Error('Invalid stored capture');
    const recovery = recoverCaptureJournal(j);
    // Never mutate a partially corrupted persisted journal. Keep its raw
    // snapshot untouched so native recovery can inspect the original bytes.
    if (recovery.recoverableFiles.length !== j.segments.length) throw new Error('Corrupted stored capture segments');
    return j;
  }
  async function persist(journal) {
    const recovery = recoverCaptureJournal(journal);
    // Atomic storage must never persist an invalid or partially corrupted
    // segment sequence, even if the caller bypasses the transition helpers.
    if (recovery.recoverableFiles.length !== journal.segments.length) {
      throw new Error('Corrupted capture segments cannot be saved');
    }
    await writeAtomic(key(journal.id), JSON.stringify(journal));
    return journal;
  }
  return {
    load,
    async save(journal) {
      return withLock(journal?.id, async () => {
        // Validate before comparing so corrupt snapshots never hide as retries.
        const recovery = recoverCaptureJournal(journal);
        if (recovery.recoverableFiles.length !== journal.segments.length) throw new Error('Corrupted capture segments cannot be saved');
        const current = await load(journal.id);
        if (current && journal.updatedAt <= current.updatedAt && JSON.stringify(journal) !== JSON.stringify(current)) {
          throw new Error('Stale capture snapshot');
        }
        return persist(journal);
      });
    },
    async start(args) {
      return withLock(args.id, async () => {
        if (await load(args.id)) throw new Error('Session already exists');
        return persist(createCaptureJournal(args));
      });
    },
    async transition(id, event) {
      return withLock(id, async () => {
        const journal = await load(id);
        if (!journal) throw new Error('Session not found');
        return persist(advanceCaptureJournal(journal, event));
      });
    },
    async appendConfirmedSegment(id, segment, at) {
      return withLock(id, async () => {
        const journal = await load(id);
        if (!journal) throw new Error('Session not found');
        return persist(appendConfirmedCaptureSegment(journal, segment, at));
      });
    },
    async recoverPending() {
      const names = await list('wivra-capture-');
      const pending = [];
      for (const name of names) {
        if (typeof name !== 'string' || !/^wivra-capture-[a-zA-Z0-9_-]{1,100}\.json$/.test(name)) continue;
        const id = name.slice('wivra-capture-'.length, -'.json'.length);
        try {
          const journal = await load(id);
          const recovery = recoverCaptureJournal(journal);
          if (recovery.requiresReview) pending.push({ id, state: journal.state, files: recovery.recoverableFiles });
        } catch {
          // Keep the raw journal untouched, but expose the session to review.
          // Never expose file names from a malformed manifest as verified media.
          pending.push({ id, state: 'corrupted', files: [] });
        }
      }
      return pending;
    }
  };
}
