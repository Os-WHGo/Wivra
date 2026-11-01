// Automated iOS Meta HEVC-only join: source/consent contracts, not hardware QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');
const joiner = read('../ios/B0/Sources/WivraSegmentedCaptureJoiner.swift');
const model = read('../ios/B0/Sources/MetaB0Model.swift');
const app = read('../ios/B0/Sources/WivraMetaB0App.swift');

test('HEVC auto-join only accepts contiguous session parts with regular local files', () => {
  assert.match(joiner, /maximumParts = 1440/);
  assert.match(joiner, /Wivra_Meta_\[a-z0-9\]\+_part0001/);
  assert.match(joiner, /String\(format: "%04d", index \+ 1\)/);
  assert.match(joiner, /url\.standardizedFileURL\.deletingLastPathComponent\(\) == folder/);
  assert.match(joiner, /values\?\.isRegularFile == true/);
  assert.match(joiner, /values\?\.isSymbolicLink != true/);
  assert.match(joiner, /sourceBytes\.addingReportingOverflow/);
  assert.match(joiner, /WivraCaptureStorageGuard\.minimumStartBytes/);
  assert.match(joiner, /WivraCaptureStorageGuard\.availableBytes\(\)/);
});

test('join keeps sources and publishes derived MOV only after full duration/replay validation', () => {
  assert.match(joiner, /AVMutableComposition\(\)/);
  assert.match(joiner, /insertTimeRange\(/);
  assert.match(joiner, /AVAssetExportPresetPassthrough/);
  assert.match(joiner, /WivraMp4Repair\.inspect\(temporary\)/);
  assert.match(joiner, /abs\(Double\(media\.durationMs\) - expectedMs\)/);
  assert.match(joiner, /fm\.moveItem\(at: temporary, to: destination\)/);
  assert.match(joiner, /WivraCaptureManifest\.write\(/);
  assert.match(joiner, /destination = folder\.appendingPathComponent\(prefix \+ "_complete\.mov"\)/);
  // Only incomplete derived '_joining.mov' may be removed, not original "_partNNNN.mov".
  assert.doesNotMatch(joiner, /removeItem\(at: url\)|removeItem\(at: source\)|removeItem\(at: ordered/);
  assert.match(joiner, /removeItem\(at: temporary\)/);
});

test('user Keep decision is completed before background join starts', () => {
  const keep = model.split('func keepPendingRecording() async {')[1]?.split('func requestPendingDiscard()')[0];
  assert.ok(keep, 'pending consent coordinator required');
  const confirmed = keep.indexOf('try await WivraPendingRecordingStore.keep(entry)');
  const join = keep.indexOf('WivraSegmentedCaptureJoiner.joinConfirmed(partURLs)');
  assert.ok(confirmed >= 0 && join > confirmed, 'joining must follow explicit Keep');
  assert.match(keep, /if partNames\.count > 1 && !joiningSegments/);
  assert.match(keep, /self\.lastRecordedURL == expectedFirst/);
  assert.match(model, /var lastJoinedVideoURL: URL\?/);
  assert.match(keep, /self\.lastJoinedVideoURL = joined/);
});

test('Photos saves only verified combined output or one original file, never first of many', () => {
  const screen = app.split('struct MetaB0Screen: View')[1]?.split('private struct WivraPendingDecisionPrompts')[0];
  assert.ok(screen);
  assert.match(screen, /if model\.lastRecordedSegmentCount > 1/);
  assert.match(screen, /if let completed = model\.lastJoinedVideoURL/);
  assert.match(screen, /try await WivraPhotosLibrary\.saveVideo\(completed\)/);
  assert.match(screen, /meta_b1_save_joined_photos/);
  assert.match(screen, /if model\.lastJoinedVideoURL == nil/);
  assert.match(screen, /ios\.capture\.join_success/);
  assert.match(screen, /ios\.capture\.share_first_segment/);
});

test('joining and one-final-video messages exist in all eight iOS locales', () => {
  const keys = [
    'ios.capture.joining','ios.capture.join_success',
    'ios.capture.join_failed','ios.capture.joined_share',
    'ios.capture.joined_photos','ios.capture.joined_saved'
  ];
  for(const lang of ['es','en','fr','pt','de','it','ja','zh']){
    const strings=read('../ios/B0/Resources/'+lang+'.lproj/Localizable.strings');
    for(const key of keys){
      assert.ok(strings.includes('"'+key+'" = "'), lang+' missing '+key);
    }
  }
});
