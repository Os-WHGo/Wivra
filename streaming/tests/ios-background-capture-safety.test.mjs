import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const app = read('../ios/B0/Sources/WivraMetaB0App.swift');

test('iPhone never represents experimental lock-screen DAT capture as guaranteed or enabled by default', () => {
  assert.match(app, /experimentalBackgroundMetaCapture = false/);
  assert.match(app, /if !\(experimentalBackgroundMetaCapture && model\.recordingArmed\)/);
  assert.match(app, /model\.endSession\(\)/);
  assert.match(app, /if model\.recordingArmed && !experimentalBackgroundMetaCapture/);
  assert.match(app, /meta_background_capture_off_warning/);
  assert.match(app, /if experimentalBackgroundMetaCapture \{/);
  assert.match(app, /meta_background_capture_limit_warning/);
});

test('all eight iOS languages disclose that locking can interrupt Meta camera streams', () => {
  const keys = ['ios.app.background_capture_toggle',
    'ios.app.background_capture_off_warning',
    'ios.app.background_capture_experimental_warning'];
  for (const key of keys) assert.ok(app.includes('"' + key + '"'));
  for (const lang of ['es', 'en', 'fr', 'pt', 'de', 'it', 'ja', 'zh']) {
    const strings = read('../ios/B0/Resources/' + lang + '.lproj/Localizable.strings');
    for (const key of keys) assert.ok(strings.includes('"' + key + '" = "'), lang + ' missing ' + key);
  }
});


test('selected microphone capture declares audio background mode alongside Meta camera transports', () => {
  const plist = read('../ios/B0/Info.plist');
  const route = read('../ios/B0/Sources/WivraAudioRoute.swift');
  const model = read('../ios/B0/Sources/MetaB0Model.swift');
  const bg = plist.split('<key>UIBackgroundModes</key>')[1]?.split('</array>')[0];
  assert.ok(bg, 'iOS background mode list not declared');
  for (const mode of ['audio', 'processing', 'bluetooth-central', 'bluetooth-peripheral', 'external-accessory'])
    assert.ok(bg.includes('<string>' + mode + '</string>'), 'iOS background mode missing: ' + mode);
  assert.match(route, /setCategory\(\.playAndRecord, mode: \.videoRecording/);
  assert.match(route, /setActive\(true\)/);
  assert.match(model, /var captureSelectedAudio = false/, 'microphone capture must remain opt-in');
});


test('iOS capture requires recent actual DAT video frames, never a device model claim or stale preview', () => {
  const model = read('../ios/B0/Sources/MetaB0Model.swift');
  assert.match(model, /private var lastFrameUptime: CFTimeInterval\?/);
  assert.match(model, /private var hasFreshDATFrames: Bool/);
  assert.match(model, /streamState == \.streaming/);
  assert.match(model, /CACurrentMediaTime\(\) - lastFrameUptime <= 4/);
  assert.match(model, /receiveCompressedHEVC && hasFreshDATFrames && !recordingFinishing/);
  assert.match(model, /hasFreshDATFrames && !photoCaptureInFlight/);
  assert.match(model, /lastFrameUptime = nil/);
  assert.match(app, /model\.cameraSignalDiagnostic/);
  assert.match(app, /Display\/gestos: no habilitados en esta beta/);
});

test('recording Stop remains enabled when DAT frames stall or stream is paused', () => {
  const recordControls = app.split('Button(model.recordingArmed ? "Detener grabación" : "Grabar HEVC")')[1]
    ?.split('.accessibilityIdentifier("meta_b1_record")')[0];
  assert.ok(recordControls, 'single recording control must be present');
  assert.match(recordControls, /if model\.recordingArmed \{/);
  assert.match(recordControls, /await model\.finishRecording\(\)/);
  // Fresh DAT frames gate a new recording; they must NOT gate Stop/recovery.
  assert.match(recordControls, /\.disabled\(model\.recordingArmed \? model\.recordingFinishing : !model\.canRecord\)/);
  assert.doesNotMatch(recordControls, /\.disabled\(!model\.canRecord\)/);
});


test('Meta preview reevaluates stale DAT frame readiness using a visible SwiftUI timeline', () => {
  const preview = app.split('struct MetaB0Screen: View')[1]?.split('private struct WivraPendingDecisionPrompts')[0];
  assert.ok(preview, 'Meta preview screen must exist');
  assert.match(preview, /TimelineView\(\.periodic\(from: \.now, by: 1\)\)/);
  assert.match(preview, /let _ = tick\.date/);
  assert.match(preview, /model\.cameraSignalDiagnostic/);
  assert.match(preview, /\.disabled\(model\.recordingArmed \? model\.recordingFinishing : !model\.canRecord\)/);
  assert.doesNotMatch(preview, /Timer\.scheduledTimer|DispatchQueue\.main\.asyncAfter/);
});

test('confirmed Meta videos offer a direct add-only Photos action, preferring muxed audio', () => {
  const preview = app.split('struct MetaB0Screen: View')[1]?.split('private struct WivraPendingDecisionPrompts')[0];
  const pending = preview.indexOf('if model.isCurrentRecordingPending {');
  const eligible = preview.indexOf('} else {', pending);
  const photoAction = preview.indexOf('.accessibilityIdentifier("meta_b1_save_photos")', eligible);
  assert.ok(pending >= 0 && eligible > pending && photoAction > eligible,
    'Photos save must remain behind confirmed Keep decision');
  assert.match(preview, /let photosURL = model\.lastCombinedVideoURL \?\? url/);
  assert.match(preview, /let originalFallbackURL = model\.lastCombinedVideoURL == nil \? nil : url/);
  assert.match(preview, /try await WivraPhotosLibrary\.savePreferredVideo\(/);
  assert.match(preview, /fallback: originalFallbackURL/);
  assert.match(preview, /captureSavedOriginalOnlyURL = originalOnly \? photosURL : nil/);
  assert.match(preview, /Text\("ios\.library\.photos_original_only"\)/);
  assert.match(preview, /captureSavedToPhotosURL == photosURL/);
  const bridge = read('../ios/B0/Sources/WivraExportNativeBridge.swift');
  const plist = read('../ios/B0/Info.plist');
  assert.match(plist, /<key>NSPhotoLibraryAddUsageDescription<\/key>/);
  assert.match(bridge, /PHPhotoLibrary\.requestAuthorization\(for: \.addOnly\)/);
  assert.match(bridge, /PHAssetChangeRequest\.creationRequestForAssetFromVideo\(atFileURL: url\)/);
  assert.match(bridge, /WivraMp4Repair\.inspect\(url\)/);
});


test('multipart Ray-Ban capture offers Photos only for a verified joined MOV', () => {
  const model = read('../ios/B0/Sources/MetaB0Model.swift');
  assert.match(model, /var lastRecordedSegmentCount = 0/);
  assert.match(model, /lastRecordedSegmentCount = urls\.count/);
  assert.match(model, /case \.saved\(let url, let frames, let dropped\):[\s\S]*?lastRecordedSegmentCount = 1/);
  const preview = app.split('struct MetaB0Screen: View')[1]?.split('private struct WivraPendingDecisionPrompts')[0];
  assert.ok(preview, 'Meta preview screen must exist');
  const start = preview.indexOf('if model.lastRecordedSegmentCount > 1');
  const after = preview.indexOf('ShareLink(item: url)', start);
  assert.ok(start >= 0 && after > start, 'multiple-part branch must distinguish original');
  const multi = preview.slice(start, after + 200);
  assert.match(multi, /if model\.lastJoinedVideoURL == nil/);
  assert.match(multi, /ios\.capture\.segments_not_combined/);
  assert.match(multi, /ios\.capture\.segments_in_library_instruction/);
  assert.match(multi, /if let completed = model\.lastJoinedVideoURL/);
  assert.match(multi, /try await WivraPhotosLibrary\.saveVideo\(completed\)/);
  assert.match(multi, /meta_b1_save_joined_photos/);
  assert.match(multi, /ios\.capture\.share_first_segment/);
  assert.doesNotMatch(multi, /WivraPhotosLibrary\.saveVideo\(url\)/);
});

test('all eight iOS locales distinguish multipart original from a complete exported movie', () => {
  for (const lang of ['es', 'en', 'fr', 'pt', 'de', 'it', 'ja', 'zh']) {
    const strings = read('../ios/B0/Resources/' + lang + '.lproj/Localizable.strings');
    for (const key of ['ios.capture.segments_not_combined',
        'ios.capture.segments_in_library_instruction','ios.capture.share_first_segment']) {
      assert.ok(strings.includes('"' + key + '" = "'), lang + ' missing ' + key);
    }
    const segmentedWarning = strings.split('"ios.capture.segments_not_combined" = "')[1]?.split('";')[0];
    assert.ok(segmentedWarning?.includes('%d'), lang + ' needs an integer segment count');
  }
});

test('Meta DAT iOS profile choices expose 504p30 motion without mislabeling requested as observed video quality', () => {
  const model = read('../ios/B0/Sources/MetaB0Model.swift');
  for (const key of ['balanced', 'motion', 'detail', 'economy']) {
    assert.ok(app.includes('.tag("' + key + '")'), key + ' profile missing');
    assert.match(model, new RegExp('"' + key + '"'));
  }
  assert.match(model, /resolution: economy \? \.low : detail \? \.high : \.medium/);
  assert.match(model, /frameRate: \(economy \|\| detail\) \? 15 : motion \? 30 : 24/);
  assert.match(app, /model\.requestedDatProfileDescription/);
  assert.match(app, /La calidad recibida depende del enlace Meta/);
});

test('Meta DAT measures real compressed HEVC payload separately from SDK request and RTMP bitrate', () => {
  const model = read('../ios/B0/Sources/MetaB0Model.swift');
  assert.match(model, /CMSampleBufferGetTotalSampleSize\(frame\.sampleBuffer\)/);
  assert.match(model, /compressedBytes: payloadBytes/);
  assert.match(model, /measuredCompressedMbps = Double\(compressedBytesThisSecond\) \* 8/);
  assert.match(model, /measuredCompressedMbps = 0/);
  assert.match(app, /HEVC recibido: %.2f Mbps/);
  assert.match(app, /no es tasa de subida LIVE/);
});
