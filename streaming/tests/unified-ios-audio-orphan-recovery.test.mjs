import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const store = read('../ios/B0/Sources/WivraPendingRecordingStore.swift');
const model = read('../ios/B0/Sources/MetaB0Model.swift');
const app = read('../ios/B0/Sources/WivraMetaB0App.swift');
const catalog = read('../ios/B0/Sources/WivraNativeCaptureLibrary.swift');

test('a successfully closed CAF is recoverable even when HEVC has no video', () => {
  assert.match(store, /static func stageAudio\(_ audioURL: URL\)/);
  assert.match(store, /AVAudioFile\(forReading: audio\), caf\.length > 0/);
  assert.match(store, /static func recoverOrphanedAudio\(\) -> Int/);
  assert.match(store, /!usedByVideo\.contains\(name\)/);
  assert.match(store, /if let name = manifest\.originalAudioFile/);
  assert.match(store, /for track in manifest\.tracks/);
  assert.match(model, /case \.noFrames:[\s\S]*?offerAudioOnlyRecovery\(sound\)/);
  assert.match(model, /case \.failed\(let message\):[\s\S]*?offerAudioOnlyRecovery\(sound\)/);
  assert.match(model, /WivraPendingRecordingStore\.recoverOrphanedAudio\(\)/);
});

test('orphan CAF stays private until explicit keep, even after relaunch', () => {
  assert.match(store, /private static let keptAudioSuffix = "\.wivra\.kept\.json"/);
  assert.match(store, /if stored\.id\.hasSuffix\("\.caf"\) \{/);
  assert.match(store, /try Data\(\{?/); // keep marker atomic
  assert.match(store, /\.write\(to: kept, options: \[\.atomic\]\)/);
  assert.match(store, /folder\.appendingPathComponent\(name \+ keptAudioSuffix\)/);
  assert.match(store, /static func savedAudioOnlyURLs\(\) -> \[URL\]/);
  assert.match(store, /let claimed = Set\(pending\(\)\.flatMap/);
  assert.match(model, /func requestPendingDiscard\(\)/);
  assert.match(model, /func discardPendingRecordingConfirmed\(\)/);
});

test('review CAF uses local AVAudioPlayer and is accessible after keep via Wivra catalog', () => {
  assert.match(store, /static func previewAudioURLs\(_ entry: WivraPendingRecording\)/);
  assert.match(app, /AVAudioPlayer\(contentsOf: url\)/);
  assert.match(app, /audioPlayer\?\.stop\(\)/);
  assert.match(app, /meta_pending_caf_preview/);
  assert.match(catalog, /WivraPendingRecordingStore\.savedAudioOnlyURLs\(\)/);
  assert.match(catalog, /ShareLink\(item: url\)/);
  assert.match(catalog, /ios\.library\.share_recovered_audio/);
});

test('all 6 iOS locales include the recovered audio controls and notices', () => {
  for(const lang of ['es','en','fr','de','it','ja']) {
    const strings = read(`../ios/B0/Resources/${lang}.lproj/Localizable.strings`);
    for(const key of ['ios.record.audio_only_notice','ios.record.audio_play','ios.record.audio_pause',
       'ios.library.recovered_audio_title','ios.library.recovered_audio_note','ios.library.share_recovered_audio'])
      assert.ok(strings.includes(`"${key}" = "`),`missing ${key} in ${lang}`);
  }
});
