// Wivra | Guarda la idea del Director sin videos ni permisos de archivos.
// Este es un borrador local recuperable, NO una orden para editar ni una transcripcion.
import { createDirectorBrief, recordInstruction, addShotIdea } from './creative-director.mjs';

export const DIRECTOR_DRAFT_KEY = 'wivra-director-story-draft-v1';
const SCHEMA = 'wivra-director-story-draft-v1';

export function createDirectorDraftRecord(brief) {
  if (!brief || brief.schema !== 'agentcut-director-brief-v0.1') throw new Error('El briefing no es válido.');
  const record = {
    schema: SCHEMA,
    mode: brief.mode,
    goal: brief.goal,
    platforms: brief.platforms,
    durationSeconds: brief.durationSeconds,
    outputCount: brief.outputCount,
    language: brief.language,
    tone: brief.style?.tone ?? '',
    voiceover: brief.style?.voiceover ?? 'optional',
    subtitles: brief.style?.subtitles ?? 'optional',
    music: brief.style?.music ?? 'optional',
    effects: brief.style?.effects ?? 'subtle',
    notes: brief.notes || '',
    utterances: (brief.utterances || []).map(({ text, source, kind }) => ({ text, source, kind })),
    shotIdeas: brief.mode === 'preproduction' ? (brief.shotIdeas || []).map(({ description, durationSeconds, kind }) => ({ description, durationSeconds, kind })) : []
  };
  // Nunca persistir assetDescriptions, URL, medios ni referencias a IDs efímeros.
  const serialized = JSON.stringify(record);
  if (serialized.length > 50000) throw new Error('El briefing supera el límite local (50 KB). Redúcelo antes de guardar.');
  return serialized;
}

export function restoreDirectorDraftRecord(input) {
  const obj = typeof input === 'string' ? JSON.parse(input) : input;
  if (!obj || obj.schema !== SCHEMA) throw new Error('El formato del borrador no es compatible.');
  let brief = createDirectorBrief({
    mode: obj.mode, goal: obj.goal, platforms: obj.platforms,
    durationSeconds: obj.durationSeconds ?? null, outputCount: obj.outputCount ?? 1,
    language: obj.language ?? 'es', tone: obj.tone ?? '', voiceover: obj.voiceover ?? 'optional',
    subtitles: obj.subtitles ?? 'optional', music: obj.music ?? 'optional',
    effects: obj.effects ?? 'subtle', notes: obj.notes ?? ''
  });
  if (!Array.isArray(obj.utterances) || obj.utterances.length > 50) throw new Error('Instrucciones guardadas inválidas.');
  for (const u of obj.utterances) brief = recordInstruction(brief, u.text, { source: u.source, kind: u.kind });
  if (brief.mode === 'preproduction') {
    if (!Array.isArray(obj.shotIdeas) || obj.shotIdeas.length > 50) throw new Error('Tomas guardadas inválidas.');
    for (const s of obj.shotIdeas) brief = addShotIdea(brief, s);
  }
  return brief; // sin assetDescriptions; la app debe pedir seleccionar medios otra vez
}

export function directorAITaskContext(brief, project) {
  // Se utiliza SOLO si usuario pulsa «Usar idea con IA», nunca por defecto.
  if (!brief || !project || !Array.isArray(project.assets)) return null;
  const descriptions = (project.assets || []).flatMap(a => {
    const entry = brief.assetDescriptions?.[a.id];
    return entry ? [{ assetId: a.id, userSays: String(entry.description || '').slice(0, 700),
      evidence: 'unverified_user_report' }] : [];
  }).slice(0, 30);
  return {
    kind: 'user_creative_intent_not_verified_media',
    mode: brief.mode,
    goal: String(brief.goal || '').slice(0, 4000),
    notes: String(brief.notes || '').slice(0, 2500),
    instructions: (brief.utterances || []).slice(-8).map(u => ({ kind: u.kind, text: String(u.text || '').slice(0, 1000) })),
    descriptions,
    limits: 'El brief es intención del usuario, NO pruebas de escenas. No inventar timecodes, contenido visual, voces ni audio. Proponer operaciones editables con aprobación.'
  };
}
