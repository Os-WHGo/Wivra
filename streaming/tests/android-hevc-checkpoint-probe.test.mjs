import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const dir='../android/app/src/';
const probe=readFileSync(new URL(dir+'main/java/com/oswhgo/wivra/WivraMp4Probe.kt',import.meta.url),'utf8');
const preview=readFileSync(new URL(dir+'main/java/com/oswhgo/wivra/WivraMetaPreviewActivity.kt',import.meta.url),'utf8');
const deviceTest=readFileSync(new URL(dir+'androidTest/java/com/oswhgo/wivra/WivraMp4ProbeTest.kt',import.meta.url),'utf8');

test('diagnose completed HEVC checkpoints read-only with Android platform extractor',()=>{
  assert.match(probe,/MediaExtractor\(\)/);
  assert.match(probe,/FileInputStream\(file\)\.use/);
  assert.match(probe,/MediaFormat\.MIMETYPE_VIDEO_HEVC/);
  assert.match(probe,/extractor\.sampleTrackIndex == track/);
  assert.match(probe,/MediaCodecList\(MediaCodecList\.REGULAR_CODECS\)/);
  assert.match(probe,/extractor\.release\(\)/);
  assert.doesNotMatch(probe,/\.delete\(|\.renameTo\(|openOutputStream|\.writeBytes\(/);
});
test('Ray-Ban preview inspects only the user selected segment on IO dispatcher',()=>{
  assert.match(preview,/val selected = clips\[index\]/);
  assert.match(preview,/withContext\(Dispatchers\.IO\) \{/);
  assert.match(preview,/WivraMp4Probe\.inspect\(selected\)/);
  assert.match(preview,/serial != inspectionSerial/);
  assert.match(preview,/No se pudo verificar la pista HEVC/);
});
test('instrumentation exercises invalid and missing private files without touching originals',()=>{
  assert.match(deviceTest,/unrecognizedBytesCannotBeClaimedAsPlayableHevc/);
  assert.match(deviceTest,/absentFileReturnsNonPlayableWithoutCreatingIt/);
  assert.match(deviceTest,/assertTrue\(file\.readBytes\(\)\.contentEquals\(before\)\)/);
});
