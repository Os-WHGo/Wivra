import test from 'node:test';
import assert from 'node:assert/strict';
import { transcribeToSubtitles } from '../ai/local-transcription-pipeline.mjs';

const sample = { result: { language: 'es' }, transcription: [
  { offsets: { from: 0, to: 1250 }, text: 'Hola Whistler' },
  { offsets: { from: 1250, to: 2000 }, text: 'Bienvenidos' }
] };

test('offline runner returns validated transcript and WebVTT', async () => {
  let called = 0;
  const result = await transcribeToSubtitles({
    runWhisper: async ({ audio, language }) => { called++; assert.equal(audio, 'local-file'); assert.equal(language, 'es'); return sample; },
    audio: 'local-file', language: 'es', duration: 2, format: 'vtt'
  });
  assert.equal(called, 1);
  assert.equal(result.ok, true);
  assert.equal(result.transcript.segments.length, 2);
  assert.match(result.subtitles.content, /^WEBVTT\n\n00:00:00\.000 --> 00:00:01\.250/);
});

test('missing engine and missing audio fail closed', async () => {
  assert.equal((await transcribeToSubtitles({ audio: 'file', duration: 2 })).code, 'ENGINE_UNAVAILABLE');
  assert.equal((await transcribeToSubtitles({ runWhisper: async () => sample, duration: 2 })).code, 'AUDIO_REQUIRED');
});

test('cancellation before execution prevents runner invocation', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const result = await transcribeToSubtitles({
    runWhisper: async () => { calls++; return sample; }, audio: 'file', duration: 2, signal: controller.signal
  });
  assert.equal(result.code, 'CANCELLED');
  assert.equal(calls, 0);
});

test('runner exceptions do not expose sensitive error messages', async () => {
  const result = await transcribeToSubtitles({
    runWhisper: async () => { throw new Error('secret path or token'); }, audio: 'file', duration: 2
  });
  assert.equal(result.code, 'ENGINE_ERROR');
  assert.doesNotMatch(JSON.stringify(result), /secret path or token/);
});

test('invalid model output cannot reach subtitle export', async () => {
  const result = await transcribeToSubtitles({
    runWhisper: async () => ({ transcription: [{ offsets: { from: 0, to: 5000 }, text: 'too long' }] }),
    audio: 'file', duration: 2
  });
  assert.equal(result.code, 'INVALID_TIME');
});

test('cancellation after asynchronous runner suppresses result', async () => {
  const controller = new AbortController();
  const result = await transcribeToSubtitles({
    runWhisper: async () => { controller.abort(); return sample; },
    audio: 'file', duration: 2, signal: controller.signal
  });
  assert.equal(result.code, 'CANCELLED');
});
