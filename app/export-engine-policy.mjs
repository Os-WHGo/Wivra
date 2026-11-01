// WebCodecs/Mediabunny currently exists only as an isolated benchmark.
// Do not allow a caller to claim the renderer is implemented by passing flags.
// Flip this only in the commit that wires the full production renderer.
export const ACCELERATED_EXPORT_IMPLEMENTED = false;
export function selectExportEngine({ requested = 'auto', webCodecs = false, mediabunny = false, fullTimelineRenderer = false, nativeRandomAccess = false, verifiedOnDevice = false } = {}) {
  if (!['auto', 'webcodecs', 'mediarecorder'].includes(requested)) throw new Error('Motor de exportación desconocido.');
  const ready = ACCELERATED_EXPORT_IMPLEMENTED && webCodecs && mediabunny && fullTimelineRenderer && nativeRandomAccess && verifiedOnDevice;
  if (requested === 'mediarecorder' || !ready) return { engine: 'mediarecorder', fallback: false, ready: false, reason: 'Motor acelerado pendiente de integración y validación completa.' };
  return { engine: 'webcodecs', fallback: true, ready: true };
}
