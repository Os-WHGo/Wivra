// WebView-to-native whisper.cpp adapter contract.
// Native hosts must explicitly register window.WivraNativeWhisper.transcribe.
// No fake transcription or cloud fallback is used when the host is unavailable.
const fail = (code, message) => ({ ok: false, code, message });
const validAudio = audio => typeof audio === 'string' && audio.length > 0 && audio.length <= 4096 && /^(file:\/\/|content:\/\/|capacitor:\/\/localhost\/_capacitor_file_\/)/i.test(audio) && !/[\x00\r\n]/.test(audio);
const validLanguage = language => typeof language === 'string' && /^(auto|[a-z]{2,3}(?:-[A-Za-z]{2,4})?)$/.test(language);

export function getNativeWhisperAvailability(host = globalThis) {
  return {
    available: typeof host?.WivraNativeWhisper?.transcribe === 'function',
    engine: 'whisper.cpp',
    requiresLocalModel: true
  };
}

export function createNativeWhisperRunner(host = globalThis) {
  return async ({ audio, language = 'auto', signal } = {}) => {
    if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    if (!validAudio(audio)) throw new TypeError('A local audio URI is required');
    if (!validLanguage(language)) throw new TypeError('Invalid language');
    const native = host?.WivraNativeWhisper;
    if (!native || typeof native.transcribe !== 'function') {
      throw Object.assign(new Error('Native whisper.cpp engine unavailable'), { code: 'ENGINE_UNAVAILABLE' });
    }
    if (typeof native.status === 'function') {
      const status = await native.status();
      if (status?.modelInstalled !== true) {
        throw Object.assign(new Error('Local Whisper model not installed'), { code: 'MODEL_NOT_INSTALLED' });
      }
    }
    const result = await native.transcribe({ audioUri: audio, language });
    if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    return result;
  };
}

export async function checkNativeWhisper(host = globalThis) {
  const available = getNativeWhisperAvailability(host);
  if (!available.available) return { ...available, modelInstalled: false };
  try {
    const status = typeof host.WivraNativeWhisper.status === 'function'
      ? await host.WivraNativeWhisper.status() : null;
    return { ...available, modelInstalled: status?.modelInstalled === true };
  } catch {
    return { ...available, modelInstalled: false };
  }
}
