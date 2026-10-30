import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const unit = read('../ios/B0/Sources/WivraHEVCRecorder.swift');
const segmented = read('../ios/B0/Sources/WivraSegmentedHEVCRecorder.swift');
const store = read('../ios/B0/Sources/WivraPendingRecordingStore.swift');
const model = read('../ios/B0/Sources/MetaB0Model.swift');
const library = read('../ios/B0/Sources/WivraNativeCaptureLibrary.swift');

test('each video-only MOV begins on a keyframe and checkpoints close at a safe boundary', () => {
  assert.match(segmented, /intervalSeconds: Double = 30/);
  assert.match(segmented, /import QuartzCore/);
  assert.match(segmented, /let now = CACurrentMediaTime\(\)/);
  assert.match(segmented, /now - segmentStartUptime >= intervalSeconds/);
  assert.doesNotMatch(segmented, /CMTimeGetSeconds\(CMTimeSubtract\(pts, firstPTS\)\)/);

  assert.match(segmented, /WivraHEVCRecorder\.isHEVCKeyframe\(buffer\)/);
  assert.match(segmented, /isKeyframe,[\s\S]*?writer\.writtenFrames >= 2/);
  assert.match(segmented, /finalizations\.append\(Task\.detached/);
  assert.match(segmented, /await writer\.stop\(\)/);
  assert.match(segmented, /next\.arm\(fileName: partName\(partIndex\)\)/);
  assert.match(segmented, /current\?\.append\(buffer\)/);
  assert.match(unit, /guard Self\.isHEVCKeyframe\(buffer\)/);
});

test('iPhone ignores initial DAT STOPPED and finalizes on terminal session loss', () => {
  assert.match(model, /private var streamEverActive = false/);
  assert.match(model, /if state == \.streaming \{ self\.streamEverActive = true \}/);
  assert.match(model, /if state == \.stopped &&\s*\(self\.streamEverActive \|\| wasStopping\)/);
  assert.match(model, /if self\.recordingArmed && !self\.recordingFinishing \{/);
  assert.match(model, /Conexión Ray-Ban terminada\. Guardando el último fragmento MOV/);
  assert.match(model, /Transmisión Ray-Ban finalizada\. Cerrando MOV pendiente/);
  assert.match(model, /Task \{ await self\.finishRecording\(\) \}/);
  assert.match(model, /private func clearPreview\(\) \{\s*streamEverActive = false/);
});

test('working MOV is not published until AVAssetWriter completes successfully', () => {
  assert.match(unit, /finalName \+ "\.writing\.mov"/);
  assert.match(unit, /writer\.finishWriting/);
  assert.match(unit, /if successful && size > 0/);
  assert.match(unit, /FileManager\.default\.moveItem\(at: url, to: ready\)/);
  assert.match(unit, /continuation\.resume\(returning: \.saved\(ready,/);
  assert.match(segmented, /case \.failed\(let message\)/);
  assert.match(segmented, /if !files\.isEmpty \{/);
  assert.match(segmented, /return \.savedSegments\(files,/);
});

test('iOS Ray-Ban default avoids opening HFP/SCO and retains explicit audio opt-in', () => {
  assert.match(model, /var captureSelectedAudio = false/);
  assert.match(model, /if captureSelectedAudio \{/);
  assert.match(model, /audioRoute\.activateSelectedInput\(\)/);
  assert.match(model, /captureSelectedAudio \? clipRecorder\.arm\(\) : segmentedRecorder\.arm\(\)/);
});

test('iPhone video-only uses independent segments without changing audio capture', () => {
  assert.match(model, /let segmentedRecorder = WivraSegmentedHEVCRecorder\(\)/);
  assert.match(model, /captureSelectedAudio \? clipRecorder\.arm\(\) : segmentedRecorder\.arm\(\)/);
  assert.match(model, /let separateAudio = captureSelectedAudio/);
  assert.match(model, /if separateAudio \{[\s\S]*?recorder\.append\(frame\.sampleBuffer\)/);
  assert.match(model, /checkpointRecorder\.append\(frame\.sampleBuffer\)/);
  assert.match(model, /case \.savedSegments\(let urls, let frames, let dropped\):/);
  assert.match(model, /videoURL: first, related: urls \+ manifests/);
  assert.match(model, /WivraCaptureManifest\.write\([\s\S]*?cameraSource: "meta-dat-hevc"/);
});

test('relaunch restores finalized unindexed groups but ignores .writing files', () => {
  assert.match(store, /func recoverUnstagedCheckpoints\(\) -> Int/);
  assert.match(store, /let segmentPattern/);
  assert.match(store, /Dictionary\(grouping: candidates\)/);
  assert.match(store, /if allManifested \{ continue \}/);
  assert.match(store, /stage\(videoURL: first, related: related\)/);
  assert.match(store, /return pending\(\)\.contains \{ \$0\.files\.contains\(url\.lastPathComponent\) \}/);
  assert.match(model, /WivraPendingRecordingStore\.recoverUnstagedCheckpoints\(\)/);
  assert.match(library, /WivraPendingRecordingStore\.isPendingVideo\(candidateVideo\)/);
});

test('only user-confirmed discard deletes registered source files', () => {
  const storeSection = store.slice(store.indexOf('static func recoverUnstagedCheckpoints'),store.indexOf('private static func verifiedTicket'));
  assert.doesNotMatch(storeSection, /removeItem\(/);
  assert.match(store, /static func discardConfirmed\(/);
  assert.match(model, /func requestPendingDiscard\(\)/);
  assert.match(model, /func discardPendingRecordingConfirmed\(\)/);
});
