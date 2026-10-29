// Wivra Ray-Ban session coordinator. The host must implement actual Meta DAT
// capture, background handling, fragment finalization and atomic storage.
// This coordinator never claims that background recording is supported.
import { createCaptureJournalStore } from './capture-journal-store.mjs';

export function createNativeCaptureSession({ host, storage, now = Date.now } = {}) {
  for (const method of ['capabilities', 'start', 'stop']) {
    if (typeof host?.[method] !== 'function') throw new TypeError('Native capture host missing ' + method);
  }
  const store = createCaptureJournalStore(storage);
  let active = null;
  let busy = false;
  const timestamp = () => now();
  const assertActive = id => {
    if (!active || active.id !== id) throw new Error('No matching active capture');
  };
  async function locked(action) {
    if (busy) throw new Error('Capture operation in progress');
    busy = true;
    try { return await action(); } finally { busy = false; }
  }
  return {
    async capabilities() {
      const caps = await host.capabilities();
      return { rayban: caps?.rayban === true, lockedScreen: caps?.lockedScreen === true, backgroundVerified: caps?.backgroundVerified === true };
    },
    async start({ id, platform, profile } = {}) {
      return locked(async () => {
        if (active) throw new Error('Capture already active');
        const caps = await this.capabilities();
        if (!caps.rayban) throw new Error('Ray-Ban native capture unavailable');
        if (!caps.lockedScreen) throw new Error('Locked-screen capture not supported by this host');
        await store.start({ id, platform, startedAt: timestamp() });
        active = { id, platform };
        try {
          await host.start({ id, profile });
          return await store.transition(id, { state: 'recording', at: timestamp() });
        } catch (error) {
          await store.transition(id, { state: 'failed', at: timestamp() });
          active = null;
          throw error;
        }
      });
    },
    async interrupted(id, reason, confirmedSegment) {
      return locked(async () => {
        assertActive(id);
        return store.transition(id, { state: 'interrupted', at: timestamp(), reason, ...(confirmedSegment ? { segment: confirmedSegment } : {}) });
      });
    },
    async resumed(id) {
      return locked(async () => {
        assertActive(id);
        return store.transition(id, { state: 'recording', at: timestamp() });
      });
    },
    async stop(id) {
      return locked(async () => {
        assertActive(id);
        const current = await store.load(id);
        if (current.state !== 'recording' && current.state !== 'interrupted') throw new Error('Capture cannot stop in this state');
        await store.transition(id, { state: 'stopping', at: timestamp() });
        try {
          // Host returns only verified closed media fragments and final output.
          const output = await host.stop({ id });
          const segments = output?.segments;
          if (!Array.isArray(segments) || !segments.length) throw new Error('No confirmed media fragments');
          let j = await store.load(id);
          for (const segment of segments) {
            j = await store.transition(id, { state: 'failed', at: timestamp(), segment });
            // 'failed' is terminal; host must report its segments in one batch.
            break;
          }
          // Stop output is kept recoverable until a native implementation
          // provides transactional batch fragment confirmation.
          active = null;
          return { ok: false, needsRecovery: true, journal: j };
        } catch (error) {
          await store.transition(id, { state: 'failed', at: timestamp() });
          active = null;
          throw error;
        }
      });
    },
    async pending() { return store.recoverPending(); },
    async snapshot(id) { return store.load(id); }
  };
}
