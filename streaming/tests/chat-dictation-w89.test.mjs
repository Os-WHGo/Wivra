// W89 (Claude): on-phone dictation in the editor chat; microphone only for the packaged editor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('Android grants only AUDIO, only to the packaged editor, only after RECORD_AUDIO', () => {
  const j = read('streaming/android/app/src/main/java/com/oswhgo/wivra/MainActivity.java');
  assert.match(j, /public void onPermissionRequest\(PermissionRequest request\)/);
  assert.match(j, /"file"\.equals\(origin\.getScheme\(\)\)/);
  assert.match(j, /request\.getResources\(\)\.length == 1 &&\s*PermissionRequest\.RESOURCE_AUDIO_CAPTURE\.equals/);
  assert.match(j, /if \(!packagedEditor \|\| !onlyAudio\) \{ request\.deny\(\); return; \}/);
  assert.match(j, /requestPermissions\(new String\[\]\{android\.Manifest\.permission\.RECORD_AUDIO\}, REQUEST_EDITOR_MICROPHONE\)/);
  assert.doesNotMatch(j, /RESOURCE_VIDEO_CAPTURE/);
});

test('dictation stays local with a pack, never sends the chat request by itself, and releases the microphone', () => {
  const t = read('app/template.html');
  const mic = t.slice(t.indexOf('function wvMicButton('), t.indexOf("$('subFile').addEventListener"));
  assert.match(mic, /t\.stream\.getTracks\(\)\.forEach\(\(x\) => x\.stop\(\)\)/);          // microphone released after each take
  assert.match(mic, /wvTranscribeShort\(mono,/);
  assert.match(mic, /setTimeout\(finish, maxS \* 1000\)/);                                // time limit
  const chat = t.slice(t.indexOf('/* Dictado del chat (W89).'), t.indexOf("$('aiApply').onclick"));
  assert.match(chat, /\$\('ask'\)\.value = \(base \+ ' ' \+ text\)\.trim\(\)/);
  assert.doesNotMatch(chat, /\$\('aiAsk'\)\.onclick\(\)|\.click\(\)/);              // the person reviews and sends
  assert.match(t, /audioCtx: WV_SHORT_WINDOW_PACKS\.includes\(pack\.id\) \? wvAudioCtx\(pcm\.length\) : 0/);
});

test('Director: spoken orders go through the same small dictionary; «saltar» still asks first', () => {
  const t = read('app/template.html');
  assert.match(t, /\$\('dirCmdMic'\)\.onclick=wvMicButton\(\$\('dirCmdMic'\),\{maxS:8/);
  assert.match(t, /const cmd=understandDirectorCommand\(\$\('dirCmd'\)\.value\);/);
  assert.match(t, /if\(cmd\.action==='skipped'&&!confirm\(/);
});
