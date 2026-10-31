// Wivra Ray-Ban session coordinator. The host must implement actual Meta DAT
// capture, background handling, fragment finalization and atomic storage.
// This coordinator never claims that background recording is supported.
import { createCaptureJournalStore } from './capture-journal-store.mjs';
import { isCaptureFileName } from './capture-locked-session.mjs';
import { detectNativeCaptureFileVerifier } from './capture-native-verifier.mjs';

export function createNativeCaptureSession({ host, storage, now = Date.now } = {}) {
  for (const method of ['capabilities', 'start', 'stop']) {
    if (typeof host?.[method] !== 'function') throw new TypeError('Native capture host missing ' + method);
  }
  const store = createCaptureJournalStore(storage);
  const nativeVerifyFile = detectNativeCaptureFileVerifier();
  const verifyPhysicalFile = args => typeof host.verifyFile === 'function' ? host.verifyFile(args) : nativeVerifyFile(args);
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
        // A capability probe is not permission to overwrite an existing
        // durable session, including one left after a previous crash.
        await store.start({ id, platform, startedAt: timestamp() });
        active = { id, platform };
        try {
          await host.start({ id, profile });
          return await store.transition(id, { state: 'recording', at: timestamp() });
        } catch (error) {
          // The native start may fail at the same time as journal storage.
          // Preserve its original error and release the coordinator lock.
          try { await store.transition(id, { state: 'failed', at: timestamp() }); }
          catch { /* Keep the last durable snapshot for recovery. */ }
          finally { active = null; }
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
          // Native host must close and verify all fragments before reporting success.
          // The manifest remains recoverable if any fragment or final output fails.
          if (!isCaptureFileName(output.finalFile)) throw new Error('Missing or unsafe finalized output');
          const previous = (await store.load(id)).segments;
          let cursor = previous.length ? previous.at(-1).endMs : 0;
          const names = new Set(previous.map(s => s.file));
          for (const segment of segments) {
            if (!segment || segment.confirmed !== true || !isCaptureFileName(segment.file) || names.has(segment.file) ||
                !Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs) ||
                segment.startMs < cursor || segment.endMs <= segment.startMs) {
              throw new Error('Invalid confirmed native fragment');
            }
            names.add(segment.file);
            cursor = segment.endMs;
          }
          // Existing fragments can disappear during an interrupted recording.
          // Recheck the entire assembled take before publishing final state.
          if (typeof host.verifyFile !== 'function' && !nativeVerifyFile) throw new Error('Native media verification required for finalization');
          for (const file of new Set([output.finalFile, ...previous.map(segment => segment.file), ...segments.map(segment => segment.file)])) {
            if (await verifyPhysicalFile({ id, file }) !== true) throw new Error('Native media verification required for finalization');
          }
          // Persist fragments with intermediate stopping snapshots, never
          // publish finalized state before every segment is durable.
          let j = await store.load(id);
          for (const segment of segments) {
            j = await store.appendConfirmedSegment(id, segment, timestamp());
          }
          j = await store.transition(id, { state: 'finalized', at: timestamp(), finalFile: output.finalFile });
          active = null;
          return { ok: true, journal: j };
        } catch (error) {
          // A storage failure must not leave this coordinator permanently
          // occupied. Preserve the original error and the last durable
          // journal snapshot if marking failure also fails.
          try { await store.transition(id, { state: 'failed', at: timestamp() }); }
          catch { /* Native recovery will inspect the last durable snapshot. */ }
          finally { active = null; }
          throw error;
        }
      });
    },
    async pending() {
      return locked(async () => store.recoverPending());
    },
    // A pending journal is metadata, not proof that an MP4 exists on disk.
    // Only a finalized session with an explicitly confirmed native file may
    // be handed to Director; the host must verify the physical media itself.
    async directorHandoff(id) {
      return locked(async () => {
      const journal = await store.load(id);
      if (!journal || journal.state !== 'finalized' || !journal.finalFile || !journal.segments.length) {
        throw new Error('Capture not finalized for Director');
      }
      if (typeof host.verifyFile !== 'function' && !nativeVerifyFile) throw new Error('Native media verification required for Director');
      // A verified final output does not prove its referenced source fragments
      // still exist. Verify every file before advertising the complete take.
      const files = [journal.finalFile, ...journal.segments.map(segment => segment.file)];
      for (const file of new Set(files)) {
        if (await verifyPhysicalFile({ id, file }) !== true) {
          throw new Error('Native media verification required for Director');
        }
      }
      return { sessionId: id, platform: journal.platform, file: journal.finalFile,
        segments: journal.segments.map(({ file, startMs, endMs }) => ({ file, startMs, endMs })) };
      });
    },
    async snapshot(id) { return store.load(id); }
  };
}
