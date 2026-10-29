import test from 'node:test';
import assert from 'node:assert/strict';
import { getNativeWhisperAvailability, createNativeWhisperRunner, checkNativeWhisper } from '../ai/native-whisper-bridge.mjs';
import { transcribeToSubtitles } from '../ai/local-transcription-pipeline.mjs';

const raw = { transcription: [{ offsets: { from: 0, to: 1000 }, text: 'Hola' }] };

test('unavailable native engine is never advertised as installed', async () => {
  assert.equal(getNativeWhisperAvailability({}).available, false);
  assert.deepEqual(await checkNativeWhisper({}), { available: false, engine: 'whisper.cpp', requiresLocalModel: true, modelInstalled: false });
  const result = await transcribeToSubtitles({ runWhisper: createNativeWhisperRunner({}), audio: 'file:///clip.wav', duration: 2 });
  assert.equal(result.code, 'ENGINE_ERROR');
});

test('native runner passes local URI and language to injected host', async () => {
  let received;
  const host = { WivraNativeWhisper: {
    status: async () => ({ modelInstalled: true }),
    transcribe: async input => { received = input; return raw; }
  } };
  assert.equal((await checkNativeWhisper(host)).modelInstalled, true);
  const result = await transcribeToSubtitles({ runWhisper: createNativeWhisperRunner(host), audio: 'file:///clip.wav', duration: 2, language: 'es' });
  assert.equal(result.ok, true);
  assert.deepEqual(received, { audioUri: 'file:///clip.wav', language: 'es' });
});

test('runner refuses non-local and malformed input and cancellation', async () => {
  const runner = createNativeWhisperRunner({ WivraNativeWhisper: { transcribe: async () => raw } });
  await assert.rejects(() => runner({ audio: '', language: 'es' }), TypeError);
  await assert.rejects(() => runner({ audio: 'https://example.com/audio.wav', language: 'es' }), TypeError);
  await assert.rejects(() => runner({ audio: 'file:///clip.wav\\nheader', language: 'es' }), TypeError);
  await assert.rejects(() => runner({ audio: 'file:///clip.wav', language: 'not a language' }), TypeError);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => runner({ audio: 'file:///clip.wav', signal: controller.signal }), { name: 'AbortError' });
});
