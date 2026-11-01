// Wivra iOS: confirmed captured media can be copied into Photos even after restart.
// Static contract complements native iOS compilation; device Photos permission QA remains separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const library = read('../ios/B0/Sources/WivraNativeCaptureLibrary.swift');
const bridge = read('../ios/B0/Sources/WivraExportNativeBridge.swift');
const plist = read('../ios/B0/Info.plist');

test('local catalog must hide undecided original recordings before offering Photos', () => {
  assert.match(library, /WivraPendingRecordingStore\.isPendingVideo\(candidateVideo\)/);
  assert.match(library, /if WivraPendingRecordingStore\.isPendingVideo\(candidateVideo\) \{\s*continue/);
  assert.match(library, /regularCaptureFile\(manifestURL, in: folder\)/);
  assert.match(library, /rawProperties\?\.isSymbolicLink != true/);
});

test('persistent capture catalog saves a preferred muxed video using the common add-only bridge', () => {
  assert.match(library, /let preferredPhotosURL = item\.alternateVideoURL \?\? video/);
  assert.match(library, /try await WivraPhotosLibrary\.saveVideo\(preferredPhotosURL\)/);
  assert.match(library, /photosSavedCaptureIDs\.insert\(item\.id\)/);
  assert.match(library, /photosSavingCaptureID != nil/);
  assert.match(library, /photosError = error\.localizedDescription/);
  assert.match(library, /accessibilityIdentifier\("wivra_capture_library_save_photos"\)/);
  assert.match(bridge, /PHPhotoLibrary\.requestAuthorization\(for: \.addOnly\)/);
  assert.match(bridge, /WivraMp4Repair\.inspect\(url\)/);
  assert.match(bridge, /PHAssetChangeRequest\.creationRequestForAssetFromVideo\(atFileURL: url\)/);
  assert.match(plist, /<key>NSPhotoLibraryAddUsageDescription<\/key>/);
  // Never delete the Wivra original as part of adding to Photos.
  const photosService = bridge.split('enum WivraPhotosLibrary')[1];
  assert.ok(photosService);
  assert.doesNotMatch(photosService, /removeItem\(|deleteAsset\(/);
});

test('new catalog action reuses existing translations in all eight iOS languages', () => {
  for (const lang of ['es', 'en', 'fr', 'pt', 'de', 'it', 'ja', 'zh']) {
    const strings = read('../ios/B0/Resources/' + lang + '.lproj/Localizable.strings');
    for (const key of ['ios.exports.save_photos','ios.exports.saved_photos','ios.exports.photos_error']) {
      assert.ok(strings.includes('"' + key + '" = "'), lang + ' missing ' + key);
    }
  }
});

test('undecided damaged video tickets cannot leak into Photos or native catalog', () => {
  const pending = read('../ios/B0/Sources/WivraPendingRecordingStore.swift');
  const fn = pending.split('static func isPendingVideo(_ videoURL: URL) -> Bool')[1]
    ?.split('static func recoverUnstagedCheckpoints')[0];
  assert.ok(fn, 'consent gate must exist');
  assert.match(fn, /if pending\(\)\.contains\(where: \{ \$0\.files\.contains\(name\) \}\) \{ return true \}/);
  assert.match(fn, /FileManager\.default\.contentsOfDirectory\(atPath: folder\.path\)/);
  assert.match(fn, /markerNames\.contains\(name \+ suffix\)/);
  assert.match(fn, /"_part0001\.mov" \+ suffix/);
  assert.match(fn, /else \{ return true \} \/\/ Fail closed/);
});
