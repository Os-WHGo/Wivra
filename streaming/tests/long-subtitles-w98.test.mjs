// W98 (Claude): native piece reader for long-video subtitles — scoped to files the person chose, ≤ 35 s pieces, PCM only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('Android: only files handed to the editor, main frame of the bundled editor, ≤ 35 s, decoded PCM only', () => {
  const seg = read('streaming/android/app/src/main/java/com/oswhgo/wivra/WivraAudioSegments.kt');
  assert.match(seg, /require\(fromS >= 0 && toS > fromS && toS - fromS <= MAX_SECONDS\)/);
  assert.match(seg, /const val MAX_SECONDS = 35\.0/);
  assert.doesNotMatch(seg, /File\(|openOutputStream|java\.net|HttpURLConnection/);
  const br = read('streaming/android/app/src/main/java/com/oswhgo/wivra/WivraAudioSegmentBridge.kt');
  assert.match(br, /if \(!isMainFrame \|\| !WivraExportBridge\.isEditor\(view\.url\)\) return@addWebMessageListener/);
  assert.match(br, /WivraAudioSegments\.lookup\(name, size\) \?: throw IllegalStateException\("NOT_GRANTED"\)/);
  const main = read('streaming/android/app/src/main/java/com/oswhgo/wivra/MainActivity.java');
  assert.match(main, /WivraAudioSegments\.INSTANCE\.remember\(MainActivity\.this, uris\);\s*chosenFiles\.onReceiveValue\(uris\);/);
});

test('iPhone: same scope through the editor bridge; registry fed only by the file chooser', () => {
  const seg = read('streaming/ios/B0/Sources/WivraAudioSegments.swift');
  assert.match(seg, /guard from >= 0, to > from, to - from <= 35/);
  assert.doesNotMatch(seg, /URLSession|FileManager\.default\.createFile|write\(to:/);
  const br = read('streaming/ios/B0/Sources/WivraEditorNativeBridge.swift');
  assert.match(br, /case "audio\.pcm16k":[\s\S]*?let url = WivraAudioSegments\.lookup\(name: name, size: size\) else \{\s*replyHandler\(\["ok": false, "error": "NOT_GRANTED"\], nil\)/);
  assert.match(read('streaming/ios/B0/Sources/WivraEmbeddedEditorScreen.swift'), /WivraAudioSegments\.remember\(urls\)/);
});

test('the editor reads long projects piece by piece and keeps the single-decode path for short ones', () => {
  const t = read('app/template.html');
  assert.match(t, /const long = duration > WV_MAX_AUDIO_S;/);
  assert.match(t, /if \(long\) pcm = await wvLongWindow\(project, c\.from \/ WV_RATE, c\.to \/ WV_RATE, lead, alive, shortCache\);/);
  assert.match(t, /for \(let a = from; a < to - 1e-6 && ok; a \+= 30\)/);           // ≤ 30 s per native request
  assert.match(t, /if \(!long\) \{\s*const ids = /);                                   // no whole-file decode in long mode
});
