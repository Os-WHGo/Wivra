import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const store = src('../ios/B0/Sources/WivraPendingRecordingStore.swift');
const model = src('../ios/B0/Sources/MetaB0Model.swift');
const ui = src('../ios/B0/Sources/WivraMetaB0App.swift');
const library = src('../ios/B0/Sources/WivraNativeCaptureLibrary.swift');

test('HEVC video and real audio/manifest outputs are staged before publishing to editor', () => {
  assert.match(model, /WivraPendingRecordingStore\.stage\(/);
  assert.match(model, /videoURL: url/);
  assert.match(model, /related: \[lastSeparateAudioURL, lastCombinedVideoURL, manifestURL\]/);
  const stage = model.indexOf('WivraPendingRecordingStore.stage(');
  const manifest = model.indexOf('WivraCaptureManifest.write(', stage);
  assert.ok(stage !== -1 && manifest > stage);
  assert.match(store, /Data\(contentsOf: marker\)/);
  assert.match(store, /options: \[\.atomic\]/);
  assert.match(library, /WivraPendingRecordingStore\.isPendingVideo\(candidateVideo\)/);
});

test('closing the choice never deletes a recording, and destructive deletion requires another confirmation', () => {
  assert.match(model, /func decidePendingLater\(\)/);
  assert.match(model, /func requestPendingDiscard\(\)/);
  assert.match(model, /func discardPendingRecordingConfirmed\(\)/);
  assert.match(ui, /\.confirmationDialog\(\s*"ios\.record\.pending_title"/);
  assert.match(ui, /\.alert\(\s*"ios\.record\.delete_confirm_title"/);
  assert.match(ui, /Button\("ios\.record\.dont_save", role: \.destructive\)/);
  assert.match(ui, /Button\("ios\.record\.delete_confirm", role: \.destructive\)/);
  assert.match(model, /WivraPendingRecordingStore\.discardConfirmed\(entry\)/);
  assert.match(store, /static func discardConfirmed\(/);
  assert.doesNotMatch(model.match(/func decidePendingLater\(\)[\s\S]*?\n    }/)?.[0] ?? '', /removeItem|discardConfirmed/);
});

test('keep removes only pending metadata and never deletes originals', () => {
  const fromKeep = store.slice(store.indexOf('static func keep('), store.indexOf('static func discardConfirmed'));
  assert.match(fromKeep, /FileManager\.default\.removeItem\(at: marker\)/);
  assert.doesNotMatch(fromKeep, /removeItem\(at:.*folder\.appendingPathComponent/);
  assert.match(store, /static func pending\(\) -> \[WivraPendingRecording\]/);
  assert.match(model, /func refreshPendingRecordingChoice\(\)/);
  assert.match(ui, /model\.refreshPendingRecordingChoice\(\)/);
});

test('native UI never shares a recording awaiting a decision', () => {
  assert.match(ui, /if model\.isCurrentRecordingPending/);
  assert.match(ui, /\} else \{\s*if let audioURL = model\.lastSeparateAudioURL/);
  assert.match(model, /var isCurrentRecordingPending: Bool/);
});

test('six supported iOS locales describe user consent and loss prevention', () => {
  const keys = [
    'pending_title', 'pending_description', 'keep', 'dont_save', 'later',
    'delete_confirm_title', 'delete_confirm_description', 'delete_confirm',
    'pending_notice', 'review_pending'
  ];
  for (const locale of ['es','en','fr','de','it','ja']) {
    const strings = src(`../ios/B0/Resources/${locale}.lproj/Localizable.strings`);
    for (const key of keys) assert.match(strings, new RegExp(`"ios\\.record\\.${key}"\\s*=`));
  }
});
