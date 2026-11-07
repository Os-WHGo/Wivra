// W100 (Claude, owner decision 1A): iPhone screen recording through a ReplayKit
// Broadcast Upload Extension, LOCAL ONLY. Source contracts; the real capture
// (other apps, protected content, memory budget) needs a physical iPhone.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = p => readFileSync(new URL('../../'+p, import.meta.url), 'utf8');
const b0 = 'streaming/ios/B0/';
const handler = read(b0+'ScreenRecordExtension/WivraScreenRecordHandler.swift');
const plist = read(b0+'ScreenRecordExtension/Info.plist');
const extEnt = read(b0+'ScreenRecordExtension/WivraScreenRecord.entitlements');
const appEnt = read(b0+'WivraMetaB0.entitlements');
const shared = read(b0+'Shared/WivraScreenRecordShared.swift');
// W108: the file writing moved from the extension to a shared writer (checked on macOS); same rules.
const writer = read(b0+'Shared/WivraScreenRecordWriter.swift');
const inbox = read(b0+'Sources/WivraScreenRecordInbox.swift');
const screen = read(b0+'Sources/WivraScreenRecordScreen.swift');
const app = read(b0+'Sources/WivraMetaB0App.swift');
const home = read(b0+'Sources/WivraHomeScreen.swift');
const spec = read(b0+'project.yml');

test('a ReplayKit upload extension embedded in the app, sharing only one App Group', () => {
  assert.match(plist, /<string>com\.apple\.broadcast-services-upload<\/string>/);
  assert.match(plist, /\$\(PRODUCT_MODULE_NAME\)\.WivraScreenRecordHandler/);
  assert.match(plist, /RPBroadcastProcessModeSampleBuffer/);
  for (const e of [extEnt, appEnt]) {
    assert.match(e, /com\.apple\.security\.application-groups/);
    assert.equal((e.match(/<string>/g) || []).length, 1);
    assert.match(e, /<string>group\.com\.oswhgo\.WivraMetaB0<\/string>/);
  }
  assert.match(shared, /static let appGroup = "group\.com\.oswhgo\.WivraMetaB0"/);
  assert.match(spec, /WivraScreenRecord:\s+type: app-extension/);
  assert.match(spec, /- target: WivraScreenRecord/);
  assert.match(spec, /PRODUCT_BUNDLE_IDENTIFIER: com\.oswhgo\.WivraMetaB0\.ScreenRecord/);
  assert.match(screen, /picker\.preferredExtension = "com\.oswhgo\.WivraMetaB0\.ScreenRecord"/);
});

test('nothing is uploaded: files are written locally and the network is never used', () => {
  for (const src of [handler, writer, inbox, screen, shared]) {
    assert.doesNotMatch(src, /URLSession|URLRequest|http:|https:|RTMP|HaishinKit|NWConnection|upload\(/);
  }
  assert.match(writer, /AVAssetWriter\(outputURL: videoURL, fileType: \.mov\)/);
  assert.match(writer, /fileType: \.m4a/);
  assert.match(handler, /writer = WivraScreenRecordWriter\(folder: dir, id: id\)/);
});

test('iOS starts and stops it; the microphone is the person\'s choice in the iOS sheet', () => {
  assert.match(screen, /RPSystemBroadcastPickerView/);
  assert.match(screen, /picker\.showsMicrophoneButton = true/);
  assert.doesNotMatch(screen + app + home, /startCapture|startRecording\(|RPScreenRecorder\.shared\(\)\.start/);
  assert.match(app, /case \.screenRecord: showingScreenRecord = true/);
  assert.match(home, /row\(\.screenRecord, "record\.circle", "ios\.home\.screen_record", "ios\.home\.screen_record_sub"\)/);
});

test('small memory: frames go straight to the encoder or are dropped, never queued', () => {
  assert.match(writer, /input\.expectsMediaDataInRealTime = true/);
  assert.match(writer, /if input\.isReadyForMoreMediaData \{ input\.append\(sample\) \}/);
  for (const src of [handler, writer]) assert.doesNotMatch(src, /\[CMSampleBuffer\]|CIContext|UIImage|append\(contentsOf/);
});

test('every stop keeps what was recorded; an abrupt end is still recoverable', () => {
  assert.match(writer, /writer\.movieFragmentInterval = CMTime\(seconds: Self\.fragmentSeconds/);
  assert.match(writer, /static let fragmentSeconds = 2\.0/);
  assert.match(handler, /override func broadcastFinished\(\) \{\s*queue\.sync \{\s*ended = true\s*writer\?\.close\(reason: "stopped"\)/);
  assert.match(writer, /writer\.finishWriting \{ done\.signal\(\) \}/);
  assert.match(handler, /Shared\.mustStop\(freeBytes:/);
  assert.match(writer, /session\.finished = videoClean/);
  assert.match(handler, /DispatchQueue\.main\.async \{ \[weak self\] in self\?\.finishBroadcastWithError\(error\) \}/);
  // A recording still being written is never listed; an interrupted one is offered, marked as such.
  assert.match(inbox, /if !session\.finished && now\.timeIntervalSince\(lastWrite\) < Shared\.staleSeconds \{ continue \}/);
  assert.match(inbox, /interrupted: !session\.finished/);
});

test('the person decides: checked before moving, nothing overwritten, delete after confirmation', () => {
  assert.match(inbox, /await WivraCaptureMediaVerifier\.verifyFile\(\s*item\.folder\.appendingPathComponent\(item\.session\.videoFile\), in: item\.folder\)/);
  assert.match(inbox, /WivraCaptureMediaVerifier\.verifyAudioFile\(/);
  assert.match(inbox, /!fm\.fileExists\(atPath: destination\.appendingPathComponent\(\$0\)\.path\)/);
  assert.match(inbox, /cameraSource: "ios-replaykit-screen", writeOnce: true/);
  assert.match(inbox, /"WivraIPhoneMedia"/);
  assert.match(inbox, /Put back what was moved/);
  assert.match(screen, /confirmationDialog\("ios\.srec\.delete_confirm"/);
  assert.match(inbox, /Shared\.safeName\(session\.videoFile\)/);
  assert.match(shared, /name\.hasPrefix\("Wivra_Screen_"\)/);
});

test('mic and app sound become separate editor tracks with measured offsets (never invented)', () => {
  assert.match(inbox, /"audio-1", "voice_primary", "ios-replaykit-mic"/);
  assert.match(inbox, /"audio-2", "other", "ios-replaykit-app"/);
  assert.match(shared, /guard let a = audio, let v = video, a\.isFinite, v\.isFinite/);
});

test('the extension messages exist in the eight languages', () => {
  for (const lang of ['es','en','pt','fr','de','it','ja','zh']) {
    assert.match(shared, new RegExp('"'+lang+'": \\[\\.noStorage: "[^"]+", \\.lowSpace: "[^"]+", \\.writeFailed: "[^"]+"\\]'));
  }
});
