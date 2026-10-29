import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const recorder = read('../android/app/src/main/java/com/oswhgo/wivra/WivraHevcMp4Recorder.kt');
const activity = read('../android/app/src/main/java/com/oswhgo/wivra/WivraMetaPreviewActivity.kt');

test('video must finish privately before user opts into gallery storage', () => {
  assert.match(recorder, /File\(context\.filesDir, "wivra_pending_videos"\)/);
  assert.match(recorder, /File\.createTempFile\("wivra_rayban_", "\.writing"/);
  assert.match(recorder, /local\.renameTo\(ready\)/);
  assert.doesNotMatch(recorder, /File\.createTempFile\([^\n]*context\.cacheDir/);
  assert.match(recorder, /fun finishToPending\(\): File\?/);
  assert.match(activity, /val finishingRecorder = recorder[\s\S]*?recorder = null[\s\S]*?val pending = withContext\(Dispatchers\.IO\) \{\s*finishingRecorder\?\.finishToPending\(\)\s*\}/);
  assert.match(activity, /WivraHevcMp4Recorder\.publishPending\(applicationContext, part\)/);
  assert.match(recorder, /local\.delete\(\)\s*\n\s*uri/);
});

test('no automatic deletion on dismiss and explicit two-step discard', () => {
  assert.match(activity, /private fun offerPendingVideo\(\)/);
  assert.match(activity, /\.setNegativeButton\(R\.string\.recording_discard\)[\s\S]*?confirmDiscardPending\(pending\)/);
  assert.match(activity, /private fun confirmDiscardPending\(pending: WivraHevcMp4Recorder\.PendingRecording\)/);
  assert.match(activity, /WivraHevcMp4Recorder\.discardPending\(applicationContext, part\)/);
  assert.match(activity, /\.setOnDismissListener \{ pendingDialogVisible = false \}/);
  assert.match(recorder, /isPending\(context, local\) && local\.delete\(\)/);
});

test('session unexpectedly stopping attempts to finalize, not wipe valid MP4', () => {
  assert.match(activity, /state == DeviceSessionState\.STOPPED[\s\S]*?if \(recordingMode && !recordingFinalizing\)[\s\S]*?finishRecording\(\)/);
  assert.match(activity, /state == StreamState\.CLOSED[\s\S]*?finishRecording\(\)/);
  assert.match(activity, /finishingJob\?\.cancelAndJoin\(\)/);
  assert.match(activity, /window\.decorView\.post \{ offerPendingVideo\(\) \}/);
});

test('six localized choices and deletion warning exist', () => {
  for (const suffix of ['', '-en', '-fr', '-de', '-it', '-ja']) {
    const xml = read(`../android/app/src/main/res/values${suffix}/strings.xml`);
    for (const name of [
      'recording_save_question', 'recording_pending_explanation',
      'recording_keep', 'recording_discard', 'recording_later',
      'recording_discard_confirm_title', 'recording_discard_confirm_message',
      'recording_discard_confirm', 'recording_remains_pending'
    ]) assert.match(xml, new RegExp(`name="${name}"`));
  }
});

test('late packet errors may retain an earlier finalized clip', () => {
  assert.match(recorder, /val valid = started && writtenSamples >= 2/);
  assert.doesNotMatch(recorder, /val valid = started && !failed && writtenSamples >= 2/);
  assert.match(recorder, /if \(started\) muxer\?\.stop\(\)/);
});
