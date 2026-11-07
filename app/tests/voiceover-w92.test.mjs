// W92 (Claude): voice-over recorded in the editor — muted playback, WAV, independent audio track at the start point.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadI18n } from '../i18n-parse.mjs';
const tpl = readFileSync(new URL('../template.html', import.meta.url), 'utf8');
const block = tpl.slice(tpl.indexOf('/* W92: voz en off.'), tpl.indexOf("// Música original local"));

test('nothing plays aloud while recording (video, layers and audio tracks)', () => {
  assert.match(tpl, /v\.muted = voMuteAll \|\| !!c\.muted/);
  assert.match(tpl, /!c\.muted && !voMuteAll && tlTime >= c\.start/);
  assert.match(tpl, /el\.muted = voMuteAll \|\| !!c0\.muted/);
  assert.match(block, /voMuteAll = true; recorder\.start\(1000\)/);
  assert.match(block, /voMuteAll = false; stopPlayIfAny\(\)/);
});

test('the take becomes a WAV on an independent audio track at the point where it started; nothing is lost on a stop', () => {
  assert.match(block, /encodeWavMono\(mono, buf\.sampleRate\)/);
  assert.match(block, /tlTime = t\.start; await addTrackFile\(file, 'audio'\)/);
  assert.match(block, /if \(\(session\.project\.audioClips \|\| \[\]\)\.length <= before\)/);          // no false success
  assert.match(block, /document\.visibilityState === 'hidden'\) voStop\('hidden'\)/);                // background keeps what was said
  assert.match(block, /t\.stream\.getTracks\(\)\.forEach\(\(x\) => x\.stop\(\)\)/);                   // microphone released
});

test('texts in the 7 other languages', () => {
  const data = loadI18n(), keys = new Set([...block.matchAll(/aiT\('((?:[^'\\]|\\.)+)'/g)].map((m) => m[1]));
  keys.add('🎙️ Grabar voz en off');
  for (const lang of ['en', 'pt', 'fr', 'de', 'ja', 'zh', 'it']) for (const k of keys) assert.ok(data[lang][k], `${lang}: ${k}`);
});
