// Transactional ASR session: generate a proposal against a project revision,
// then validate and apply only after explicit owner approval.
import { proposeTranscribedTextEdits } from './transcription-editor-bridge.mjs';
import { applyBatch } from '../../core/operations.mjs';

const fail = (code, message) => ({ ok: false, code, message });

export async function prepareTranscriptionEdit({ project, ...options } = {}) {
  if (!project || typeof project !== 'object' || !Number.isInteger(project.revision)) {
    return fail('INVALID_PROJECT', 'Proyecto inválido.');
  }
  const result = await proposeTranscribedTextEdits(options);
  if (!result.ok) return result;
  const preview = applyBatch(project, result.ops);
  if (!preview.ok) return fail('INVALID_EDIT', preview.message || 'La edición no es compatible con el proyecto.');
  return {
    ok: true,
    proposal: Object.freeze({
      revision: project.revision,
      ops: result.ops.map(op => Object.freeze({ ...op })),
      transcript: result.transcript,
      subtitles: result.subtitles,
      late: result.late,
      warnings: result.warnings
    }),
    preview: preview.project,
    requiresApproval: true
  };
}

export function applyApprovedTranscriptionEdit({ project, proposal, approved = false } = {}) {
  if (!approved) return fail('APPROVAL_REQUIRED', 'Debes aprobar la edición.');
  if (!project || !Number.isInteger(project.revision) || !proposal || !Number.isInteger(proposal.revision) || !Array.isArray(proposal.ops)) {
    return fail('INVALID_PROPOSAL', 'Propuesta inválida.');
  }
  if (project.revision !== proposal.revision) {
    return fail('STALE_PROPOSAL', 'El proyecto cambió desde que se preparó la transcripción.');
  }
  if (!proposal.ops.length || proposal.ops.some(op => !op || op.op !== 'add_text')) {
    return fail('INVALID_PROPOSAL', 'Operaciones de subtítulos inválidas.');
  }
  const result = applyBatch(project, proposal.ops);
  return result.ok ? { ok: true, project: result.project } : fail('INVALID_EDIT', result.message || 'No se pudo aplicar.');
}
