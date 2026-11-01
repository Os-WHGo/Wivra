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
  assert.match(library, /try await WivraPhotosLibrary\.savePreferredVideo\(/);
  assert.match(library, /fallback: item\.alternateVideoURL == nil \? nil : video/);
  assert.match(library, /photosSavedOriginalOnly\.insert\(item\.id\)/);
  assert.match(library, /Text\("ios\.library\.photos_original_only"\)/);
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
    for (const key of ['ios.exports.save_photos','ios.exports.saved_photos','ios.exports.photos_error','ios.library.photos_original_only']) {
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
  assert.match(fn, /return hasUndecidedTicket\(forVideo: name, markerNames: Set\(entries\)\)/);
  assert.match(fn, /else \{ return true \}/);
  const matcher = pending.split('private static func hasUndecidedTicket(')[1]
    ?.split('static func isPendingVideo')[0];
  assert.ok(matcher, 'raw ticket matcher must exist');
  assert.match(matcher, /markerNames\.contains\(name \+ suffix\)/);
  assert.match(matcher, /ticket\.hasPrefix\(groupPrefix\), ticket\.hasSuffix\(ticketEnding\)/);
  assert.match(matcher, /index\.count == 4 && index\.allSatisfy/);
  assert.match(pending, /!hasUndecidedTicket\(forVideo: first\.lastPathComponent, markerNames: markerNames\)/);
});

test('Photos fallback checks mux validity before doing a single add-only save', () => {
  const method = bridge.split('static func savePreferredVideo(')[1]
    ?.split('static func saveVideo(_ url: URL)')[0];
  assert.ok(method, 'Photos fallback helper must exist');
  assert.match(method, /WivraMp4Repair\.inspect\(preferred\)/);
  assert.match(method, /media\.video && media\.durationMs > 0/);
  assert.match(method, /try await saveVideo\(preferred\)/);
  assert.match(method, /try await saveVideo\(fallback\)/);
  assert.match(method, /return true/);
  assert.doesNotMatch(method, /catch\s*\{|PHPhotoLibrary\.requestAuthorization/);
  // No retry if Photos itself rejects the permission or change transaction.
  assert.match(bridge, /PHPhotoLibrary\.requestAuthorization\(for: \.addOnly\)/);
  assert.match(bridge, /PHAssetChangeRequest\.creationRequestForAssetFromVideo\(atFileURL: url\)/);
});


test('audio-only recovery and kept catalog both respect malformed consent tickets', () => {
  const store = read('../ios/B0/Sources/WivraPendingRecordingStore.swift');
  const recovery = store.split('static func recoverOrphanedAudio() -> Int {')[1]
    ?.split('static func savedAudioOnlyURLs() -> [URL] {')[0];
  const saved = store.split('static func savedAudioOnlyURLs() -> [URL] {')[1]
    ?.split('static func pending() -> [WivraPendingRecording]')[0];
  assert.ok(recovery && saved, 'audio recovery functions must exist');
  for (const section of [recovery, saved]) {
    assert.match(section, /let rawMarkers = Set\(urls\.map\(\\\.lastPathComponent\)\)/);
    assert.match(section, /!rawMarkers\.contains\(name \+ suffix\)/);
    assert.match(section, /!claimed\.contains\(name\)/);
  }
  assert.match(recovery, /!usedByVideo\.contains\(name\)/);
  assert.match(recovery, /\(try\? stageAudio\(url\)\) != nil/);
  assert.match(saved, /name \+ keptAudioSuffix/);
  // A kept marker alone is not an authorization if a pending JSON marker remains.
  assert.ok(saved.indexOf('!rawMarkers.contains(name + suffix)') <
    saved.indexOf('name + keptAudioSuffix'));
});


test('persistent library labels segmented MOVs as partial files with part number', () => {
  assert.match(library, /var segmentNumber: Int\?/);
  assert.match(library, /name\.range\(of: #"_part\[0-9\]\{4\}\\\.mov\$"#/);
  assert.match(library, /Int\(String\(name\.dropLast\("\.mov"\.count\)\.suffix\(4\)\)\)/);
  assert.match(library, /if let segmentNumber = item\.segmentNumber/);
  assert.match(library, /NSLocalizedString\("ios\.capture\.individual_segment"/);
  assert.match(library, /wivra_library_segment_number/);
  for (const lang of ['es', 'en', 'fr', 'pt', 'de', 'it', 'ja', 'zh']) {
    const strings = read('../ios/B0/Resources/' + lang + '.lproj/Localizable.strings');
    const line = strings.split('"ios.capture.individual_segment" = "')[1]?.split('";')[0];
    assert.ok(line?.includes('%d'), lang + ' must identify the segment number');
  }
});



test('multipart Meta MOVs stay private: only one-piece takes or completed joined MOV may enter Photos', () => {
  const guard = library.split('private func maySaveToPhotos(')[1]
    ?.split('private func retryJoin(')[0];
  assert.ok(guard, 'Photos eligibility must be explicit and user-visible');
  assert.match(guard, /guard let segment = item\.segmentNumber else \{ return true \}/);
  assert.match(guard, /guard segment == 1/);
  assert.match(guard, /let group = groupKey\(for: video\)/);
  assert.match(guard, /let parts = confirmedPartGroups\[group\]/);
  assert.match(guard, /parts\.count == 1/);
  assert.match(guard, /!joinedPartGroups\.contains\(group\)/);
  assert.match(guard, /else \{ return false \}/);

  const view = library.split('ShareLink(item: video)')[1]?.split('} else {\n')[0];
  assert.ok(view, 'native library video row must be present');
  assert.match(view, /if maySaveToPhotos\(item, video: video\) \{/);
  assert.match(view, /try await WivraPhotosLibrary\.savePreferredVideo\(/);
  assert.match(view, /else if item\.segmentNumber != nil/);
  assert.match(view, /ios\.capture\.parts_private_gallery/);
  assert.match(view, /wivra_library_parts_private_notice/);
  assert.match(view, /ios\.capture\.share_segment_only/);
  assert.match(library, /joinedPartGroups = joined/);
  assert.match(library, /lastPathComponent\.hasSuffix\("_complete\.mov"\)/);
});

test('all native locales warn that multipart take segments must not fill the photo gallery', () => {
  for (const lang of ['es','en','fr','pt','de','it','ja','zh']) {
    const strings = read('../ios/B0/Resources/' + lang + '.lproj/Localizable.strings');
    for (const key of ['ios.capture.parts_private_gallery', 'ios.capture.share_segment_only']) {
      assert.ok(strings.includes('"' + key + '" = "'), lang + ' missing '+key);
    }
  }
});
