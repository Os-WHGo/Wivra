import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../android/app/src/main/java/com/oswhgo/wivra/WivraCaptureForegroundService.kt', import.meta.url), 'utf8');

test('Android background Ray-Ban notification reflects pause even when no further samples arrive', () => {
  // Both DAT session pause and camera stream pause may happen with no new frames.
  const pause = /if \(!finishing && captureState != CaptureState\.PAUSED\) \{\s*setCaptureState\(CaptureState\.PAUSED\)\s*refreshCaptureNotification\(\)\s*\}/g;
  assert.equal([...src.matchAll(pause)].length, 2, 'both pause paths must refresh the foreground notification');
  assert.match(src, /CaptureState\.PAUSED -> "Ray-Ban en pausa\. MP4 previos conservados\."/);
});

test('Android lock-screen says closing while HEVC MP4 finalization runs', () => {
  assert.match(src, /setCaptureState\(CaptureState\.FINALIZING\)\s*refreshCaptureNotification\(\)\s*val lastRecorder/);
  assert.match(src, /CaptureState\.FINALIZING -> "Cerrando último MP4\. Conserva la grabación\."/);
  assert.match(src, /\.setOngoing\(true\)/);
});

test('notification changes are best effort and do not throw away captured data', () => {
  assert.match(src, /private fun refreshCaptureNotification\(\) \{\s*runCatching \{/);
  assert.match(src, /getSystemService\(NotificationManager::class\.java\)\.notify\(/);
  assert.match(src, /if \(samples >= 2 &&[\s\S]*?refreshCaptureNotification\(\)/);
  assert.match(src, /setCaptureState\(CaptureState\.RECORDING\)/);
});
