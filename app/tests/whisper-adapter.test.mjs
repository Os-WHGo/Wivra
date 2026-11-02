import test from 'node:test';
import assert from 'node:assert/strict';
import { fromWhisperJson } from '../ai/whisper-adapter.mjs';
import { exportSubtitles } from '../ai/subtitle-export.mjs';

const whisper = {
  result: { language: 'es' },
  transcription: [
    { timestamps: { from: '00:00:00,000', to: '00:00:01,250' }, offsets: { from: 0, to: 1250 }, text: ' Hola ' },
    { timestamps: { from: '00:00:01,250', to: '00:00:02,000' }, offsets: { from: 1250, to: 2000 }, text: 'Whistler' }
  ]
};

test('converts whisper.cpp millisecond offsets to seconds and validated SRT', () => {
  const normalized = fromWhisperJson(whisper, { duration: 2 });
  assert.equal(normalized.ok, true);
  assert.equal(normalized.value.engine, 'whisper.cpp');
  assert.equal(normalized.value.language, 'es');
  assert.deepEqual(normalized.value.segments[0], { start: 0, end: 1.25, text: 'Hola' });
  const srt = exportSubtitles(normalized.value, { format: 'srt', duration: 2 });
  assert.equal(srt.ok, true);
  assert.match(srt.content, /00:00:00,000 --> 00:00:01,250\nHola/);
});

test('rejects malformed Whisper payloads, invalid offsets and overlapping cues', () => {
  assert.equal(fromWhisperJson(null).code, 'INVALID_WHISPER_RESULT');
  assert.equal(fromWhisperJson({ transcription: [{ text: 'a' }] }).code, 'INVALID_WHISPER_OFFSETS');
  assert.equal(fromWhisperJson({ transcription: [{ offsets: { from: 0, to: NaN }, text: 'a' }] }).code, 'INVALID_WHISPER_OFFSETS');
  assert.equal(fromWhisperJson({ transcription: [{ offsets: { from: 0, to: 2000 }, text: 'a' }, { offsets: { from: 1000, to: 3000 }, text: 'b' }] }).code, 'OVERLAPPING_SEGMENTS');
});

test('rejects Whisper segments exceeding media duration', () => {
  assert.equal(fromWhisperJson(whisper, { duration: 1 }).code, 'INVALID_TIME');
});
