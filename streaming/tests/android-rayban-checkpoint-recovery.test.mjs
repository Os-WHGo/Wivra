import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const segmenter = read('../android/app/src/main/java/com/oswhgo/wivra/WivraSegmentedHevcRecorder.kt');
const recorder = read('../android/app/src/main/java/com/oswhgo/wivra/WivraHevcMp4Recorder.kt');
const activity = read('../android/app/src/main/java/com/oswhgo/wivra/WivraMetaPreviewActivity.kt');

test('checkpoint boundaries require an HEVC random-access frame and full codec setup', () => {
  assert.match(segmenter, /checkpointIntervalUs: Long = 30_000_000L/);
  assert.match(segmenter, /if \(type in 32\.\.34\) codecSets\[type\] = bytes/);
  assert.match(segmenter, /if \(type in 16\.\.21\) randomAccess = true/);
  assert.match(segmenter, /codecSets\.keys\.containsAll\(setOf\(32, 33, 34\)\)/);
  assert.match(segmenter, /randomAccess && !isCodecConfig/);
  assert.match(segmenter, /if \(canCheckpoint\) \{/);
  assert.match(segmenter, /recorder\.consume\(config, ptsUs, width, height, true\)/);
});

test('checkpointed parts survive a failed final segment and remain visible after relaunch', () => {
  assert.match(segmenter, /private val finishedParts = mutableListOf<File>\(\)/);
  assert.match(segmenter, /private fun closeCurrentPart\(\)/);
  assert.match(segmenter, /finishedParts\.add\(ready\)/);
  assert.match(segmenter, /finishedParts\.lastOrNull\(\)/);
  assert.match(segmenter, /fun discard\(\) = synchronized\(lock\) \{/);
  assert.doesNotMatch(segmenter, /finishedParts\.forEach\s*\{\s*it\.delete\(\)/);
  assert.match(recorder, /File\(context\.filesDir, "wivra_pending_videos"\)/);
  assert.match(recorder, /fun listPendingRecordings\(context: Context\)/);
  assert.match(recorder, /groupBy \{ file ->/);
  assert.match(recorder, /partNamePattern\.matchEntire\(file\.name\)/);
  assert.match(activity, /WivraHevcMp4Recorder\.listPendingRecordings\(applicationContext\)/);
  assert.match(activity, /pending\.parts\.count \{ part ->/);
});

test('multi-part storage is honestly labeled, not misrepresented as one merged video', () => {
  for (const suffix of ['', '-en', '-fr', '-de', '-it', '-ja']) {
    const xml = read(`../android/app/src/main/res/values${suffix}/strings.xml`);
    for (const key of [
      'recording_frames_checkpoints', 'recording_pending_multiple_parts',
      'recording_partially_saved'
    ]) assert.match(xml, new RegExp(`name="${key}"`));
  }
  assert.match(activity, /pending\.parts\.size > 1/);
  assert.match(activity, /confirmDiscardPending\(pending\)/);
  assert.match(activity, /WivraHevcMp4Recorder\.discardPending\(applicationContext, part\)/);
});

test('recording is still explicitly video-only with no live streaming/audio claim', () => {
  assert.match(activity, /compressVideo = recording/);
  assert.match(activity, /WivraSegmentedHevcRecorder\(applicationContext\)/);
  assert.doesNotMatch(segmenter, /(?:audioStream\.collect|RTMP|RTMPS|AAC)/);
});
