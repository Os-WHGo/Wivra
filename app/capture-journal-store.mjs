// Durable storage contract for native Ray-Ban capture journals.
// The host supplies atomic write/read/list primitives (Android/iOS). This
// module cannot grant background execution or access the camera.
import { createCaptureJournal, advanceCaptureJournal, recoverCaptureJournal, appendConfirmedCaptureSegment } from './capture-locked-session.mjs';

export function createCaptureJournalStore({ writeAtomic, read, list } = {}) {
  if (typeof writeAtomic !== 'function' || typeof read !== 'function' || typeof list !== 'function') throw new TypeError('Native storage callbacks required');
  const locks = new Set();\n  const withLock = async (id, fn) => {\n    if (locks.has(id)) throw new Error('Concurrent session mutation');\n    locks.add(id);\n    try { return await fn(); } finally { locks.delete(id); }\n  };\n  const key = id => {
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new TypeError('Unsafe session id');
    return 'wivra-capture-' + id + '.json';
  };
  async function load(id) {
    const data = await read(key(id));
    if (data == null) return null;
    const j = JSON.parse(data);
    if (j.id !== id || j.schema !== 1 || !Array.isArray(j.segments)) throw new Error('Invalid stored capture');
    recoverCaptureJournal(j);
    return j;
  }
  async function save(journal) {
    recoverCaptureJournal(journal);
    await writeAtomic(key(journal.id), JSON.stringify(journal));
    return journal;
  }
  return {
    load, save,
    async start(args) {
      if (await load(args.id)) throw new Error('Session already exists');
      return save(createCaptureJournal(args));
    },
    async transition(id, event) {
      const journal = await load(id);
      if (!journal) throw new Error('Session not found');
      return save(advanceCaptureJournal(journal, event));
    },
    async appendConfirmedSegment(id, segment, at) {
      const journal = await load(id);
      if (!journal) throw new Error('Session not found');
      return save(appendConfirmedCaptureSegment(journal, segment, at));
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
        } catch { /* skip corrupted manifests; native host should retain for forensic recovery */ }
      }
      return pending;
    }
  };
}
