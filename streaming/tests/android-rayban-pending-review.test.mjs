import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const activity = read('../android/app/src/main/java/com/oswhgo/wivra/WivraMetaPreviewActivity.kt');
const recorder = read('../android/app/src/main/java/com/oswhgo/wivra/WivraHevcMp4Recorder.kt');

test('review enters only from decision dialog and does not publish or delete videos', () => {
  assert.match(activity,/val reviewButton = Button\(this\)/);
  assert.match(activity,/reviewPendingVideo\(pending\)/);
  assert.match(activity,/private fun reviewPendingVideo\(pending: WivraHevcMp4Recorder\.PendingRecording\)/);
  assert.match(activity,/val clips = WivraHevcMp4Recorder\.listPendingRecordings\(applicationContext\)/);
  assert.match(activity,/\.firstOrNull \{ it\.id == pending\.id \}\?\.parts\.orEmpty\(\)/);
  const viewer=activity.slice(activity.indexOf('private fun reviewPendingVideo('),activity.indexOf('private fun confirmDiscardPending('));
  assert.match(viewer,/VideoView\(this\)/);
  assert.match(viewer,/player\.setVideoPath\(clips\[index\]\.absolutePath\)/);
  assert.match(viewer,/player\.stopPlayback\(\)/);
  assert.match(viewer,/window\.decorView\.post \{ offerPendingVideo\(\) \}/);
  assert.doesNotMatch(viewer,/publishPending|discardPending|contentResolver|MediaStore/);
  assert.match(recorder,/file\.extension == "mp4"/);
});

test('all six languages carry in-app video review and navigation labels', () => {
  const keys=['recording_review_video','recording_review_title','recording_review_part',
    'recording_review_close','recording_review_unavailable','recording_review_previous',
    'recording_review_next','recording_review_disclaimer'];
  for(const locale of ['','-en','-fr','-de','-it','-ja']) {
    const xml=read(`../android/app/src/main/res/values${locale}/strings.xml`);
    for(const key of keys) assert.match(xml,new RegExp(`name="${key}"`));
  }
});
