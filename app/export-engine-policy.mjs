// Fail closed until the accelerated renderer is integrated and tested on device.
export function selectExportEngine({ requested = 'auto', webCodecs = false, mediabunny = false, fullTimelineRenderer = false, nativeRandomAccess = false, verifiedOnDevice = false } = {}) {
  if (!['auto', 'webcodecs', 'mediarecorder'].includes(requested)) throw new Error('Motor de exportación desconocido.');
  const ready = webCodecs && mediabunny && fullTimelineRenderer && nativeRandomAccess && verifiedOnDevice;
  if (requested === 'mediarecorder' || !ready) return { engine: 'mediarecorder', fallback: false, ready, reason: ready ? null : 'Motor acelerado pendiente de validación completa.' };
  return { engine: 'webcodecs', fallback: true, ready: true };
}
