import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const store = readFileSync(new URL('../android/app/src/main/java/com/oswhgo/wivra/WivraExportStore.kt', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../android/app/src/main/java/com/oswhgo/wivra/WivraExportBridge.kt', import.meta.url), 'utf8');

test('repaired media retries metadata on IO without inventing a playable duration', () => {
  assert.match(store, /private fun inspectAfterPublish\(context: Context, uri: Uri, mime: String, repaired: Boolean\)/);
  const helper = store.split('private fun inspectAfterPublish(')[1]?.split('private class Repaired(')[0] ?? '';
  assert.match(helper, /if \(!repaired\) return runCatching/);
  assert.match(helper, /repeat\(4\) \{ attempt ->/);
  assert.match(helper, /media\.video && media\.durationMs > 0/);
  assert.match(helper, /media\.declaresDuration && media\.seekIndex/);
  assert.match(helper, /Thread\.sleep\(100L \* \(attempt \+ 1\)\)/);
  assert.match(helper, /InterruptedException/);
  assert.match(helper, /return null/);
  assert.match(store, /inspectAfterPublish\(context, done\.uri, item\.session\.mime, repaired = true\)/);
  assert.match(store, /inspectAfterPublish\(context, item\.uri, item\.session\.mime, repaired = false\)/);
  assert.match(store, /saved\[token\] = Finished\(result, item\.owner\)/);
});

test('bridge exposes unknown inspection status rather than asserting a playable video', () => {
  assert.match(bridge, /androidMediaInspection", if \(saved\.media == null\) "unverified" else "available"/);
  assert.match(bridge, /saved\.media\?\.let/);
  assert.doesNotMatch(bridge, /"durationMs", 60000|"video", true/);
});
