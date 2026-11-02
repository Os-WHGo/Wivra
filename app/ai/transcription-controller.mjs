// Controller for a native-only transcription feature. No cloud calls or fake output.
// The UI provides project state and explicit approve/discard actions.
import { checkNativeWhisper, createNativeWhisperRunner } from './native-whisper-bridge.mjs';
import { prepareTranscriptionEdit, applyApprovedTranscriptionEdit } from './transcription-session.mjs';

const fail = (code, message) => ({ ok: false, code, message });

export function createTranscriptionController({ host = globalThis } = {}) {
  let pending = null;
  let aborter = null;
  let busy = false;

  return {
    status: () => checkNativeWhisper(host),
    getState: () => ({ busy, hasProposal: pending !== null, revision: pending?.revision ?? null }),
    async prepare({ project, audio, duration, timelineDuration, language = 'auto', offset = 0 } = {}) {
      if (busy) return fail('BUSY', 'Ya hay una transcripción en curso.');
      if (pending) return fail('PROPOSAL_PENDING', 'Aprueba o descarta la propuesta anterior.');
      const status = await checkNativeWhisper(host);
      if (!status.available) return fail('ENGINE_UNAVAILABLE', 'Motor Whisper nativo no disponible.');
      if (!status.modelInstalled) return fail('MODEL_NOT_INSTALLED', 'Instala un modelo Whisper local.');
      busy = true;
      aborter = new AbortController();
      try {
        const result = await prepareTranscriptionEdit({
          project, runWhisper: createNativeWhisperRunner(host),
          audio, duration, timelineDuration, language, offset, signal: aborter.signal
        });
        if (!result.ok) return result;
        pending = result.proposal;
        return { ...result, proposal: pending };
      } finally {
        busy = false;
        aborter = null;
      }
    },
    cancel() {
      if (!busy || !aborter) return fail('NOT_RUNNING', 'No hay transcripción activa.');
      aborter.abort();
      return { ok: true };
    },
    discard() {
      pending = null;
      return { ok: true };
    },
    approve(project) {
      if (busy) return fail('BUSY', 'Espera a que termine la transcripción.');
      if (!pending) return fail('NO_PROPOSAL', 'No hay cambios pendientes.');
      const result = applyApprovedTranscriptionEdit({ project, proposal: pending, approved: true });
      if (result.ok) pending = null;
      return result;
    }
  };
}
