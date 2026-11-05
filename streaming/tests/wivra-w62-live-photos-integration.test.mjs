// W62 stacked-source integration contract: preserves independent LIVE audio
// intent and Photos add-only safety when their branches are combined.
// These are structural guards; native Swift smokes exercise runtime behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const swift = name => readFileSync(new URL('../ios/B0/Sources/'+name, import.meta.url), 'utf8');
const smoke = name => readFileSync(new URL('./'+name, import.meta.url), 'utf8');

test('W62: write-once LIVE audio receipt is staged before recording, not replaced', () => {
  const receipt = swift('WivraLiveRecordingReceipt.swift');
  const screen = swift('WivraIPhoneLiveScreen.swift');
  assert.match(receipt, /bytes\.write\(to: temporary, options: \[\.atomic\]\)/);
  assert.match(receipt, /FileManager\.default\.linkItem\(at: temporary, to: receipt\)/);
  assert.doesNotMatch(receipt, /bytes\.write\(to: receipt, options:/);
  assert.match(receipt, /defer \{ try\? FileManager\.default\.removeItem\(at: temporary\) \}/);
  assert.match(receipt, /values\.isSymbolicLink == false, values\.isRegularFile == true/);
  const intent = screen.indexOf('WivraLiveRecordingReceipt.stage(');
  const writer = screen.indexOf('try await writer.startRecording(file, settings: settings)');
  assert.ok(intent >= 0 && writer > intent, 'stage mic choice before recorder starts');
  assert.match(smoke('WivraLiveRecordingReceiptSmoke.swift'), /expectStageBlocked\(false, video\)/);
});

test('W62: a pending Photos save blocks manual overrides while transaction is in flight', () => {
  const journal = swift('WivraPhotosSaveJournal.swift');
  const begin = journal.slice(journal.indexOf('func begin(for url: URL)'), journal.indexOf('func markConfirmed('));
  const confirm = journal.slice(journal.indexOf('func confirmManuallyPresent('), journal.indexOf('func authorizeRetryAfterManualAbsence('));
  const retry = journal.slice(journal.indexOf('func authorizeRetryAfterManualAbsence('), journal.indexOf('private func update('));
  assert.match(journal, /private var inFlightHashes: Set<String> = \[\]/);
  assert.match(begin, /try persist\(document\)[\s\S]*inFlightHashes\.insert\(hash\)/);
  assert.match(confirm, /!inFlightHashes\.contains\(hash\)/);
  assert.match(retry, /!inFlightHashes\.contains\(hash\)/);
  assert.match(journal, /Never reset a damaged journal/);
  assert.match(smoke('WivraPhotosActiveSaveSmoke.swift'), /confirmManuallyPresent|authorizeRetryAfterManualAbsence/);
});

test('W62: recovered LIVE requires original mic intent and shares the single guarded Photos actor', () => {
  const screen = swift('WivraIPhoneLiveScreen.swift');
  const bridge = swift('WivraExportNativeBridge.swift');
  const journal = swift('WivraPhotosSaveJournal.swift');
  assert.match(screen, /WivraLiveRecordingReceipt\.audioExpectation\(/);
  assert.match(screen, /requireAudio: expectation == \.required/);
  assert.match(screen, /if expectation == \.unknown \{ uncertainAudio\.insert\(file\) \}/);
  assert.match(screen, /controller\.audioUncertainVideos\.contains\(file\)/);
  assert.match(screen, /WivraPhotosSaveJournal\.shared\.reviewStatus\(for: file\)/);
  assert.match(screen, /WivraPhotosSaveJournal\.shared\.confirmManuallyPresent\(for: file\)/);
  assert.match(screen, /WivraPhotosSaveJournal\.shared\.authorizeRetryAfterManualAbsence\(for: file\)/);
  assert.match(screen, /WivraPhotosLibrary\.saveVideo\(file\)/);
  assert.match(bridge, /journal\.begin\(for: url\)/);
  assert.match(bridge, /journal\.markConfirmed\(hash: hash\)/);
  assert.match(bridge, /journal\.markUncertain\(hash: hash\)/);
  assert.match(journal, /static let shared = WivraPhotosSaveJournal\(\)/);
  assert.doesNotMatch(screen, /PHPhotoLibrary\.shared\(\)\.performChanges|PHAssetChangeRequest/);
  assert.doesNotMatch(screen, /FileManager\.default\.removeItem\(at: file\)/);
});
