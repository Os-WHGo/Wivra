import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const store = read('../ios/B0/Sources/WivraPendingRecordingStore.swift');
const app = read('../ios/B0/Sources/WivraMetaB0App.swift');

test('pending preview validates ticket and stays inside Wivra recordings', () => {
  assert.match(store, /static func previewVideoURLs\(_ entry: WivraPendingRecording\)/);
  assert.match(store, /try verifiedTicket\(entry\)/);
  assert.match(store, /try checkedURL\(folder\.appendingPathComponent\(name\), in: folder\)/);
  assert.match(store, /!name\.hasSuffix\("\.writing\.mov"\)/);
  assert.match(store, /size\.int64Value > 0/);
  const review = store.slice(store.indexOf('static func previewVideoURLs('),store.indexOf('/** Save means keep'));
  assert.doesNotMatch(review, /removeItem|moveItem|copyItem|write\(/);
});

test('review allows user to choose each segment and never imports into Claude editor', () => {
  assert.match(app, /import AVKit/);
  assert.match(app, /Button\("ios\.record\.review_video"\)/);
  assert.match(app, /WivraPendingRecordingReviewScreen\(entry: entry\)/);
  assert.match(app, /VideoPlayer\(player: player\)/);
  assert.match(app, /WivraPendingRecordingStore\.previewVideoURLs\(entry\)/);
  assert.match(app, /Button\("ios\.record\.preview_previous"\)/);
  assert.match(app, /Button\("ios\.record\.preview_next"\)/);
  assert.match(app, /model\.refreshPendingRecordingChoice\(\)/);
  const player = app.slice(app.indexOf('private struct WivraPendingRecordingReviewScreen'));
  assert.doesNotMatch(player, /WivraEmbeddedEditorScreen|removeItem|discardConfirmed|live\.start/);
});

test('preview labels are localized in all six iOS languages', () => {
  for(const locale of ['es','en','fr','de','it','ja']) {
    const text = read(`../ios/B0/Resources/${locale}.lproj/Localizable.strings`);
    for(const key of ['review_video','preview_title','preview_unavailable','preview_part','preview_close','preview_disclaimer','preview_previous','preview_next'])
      assert.match(text,new RegExp(`"ios\\.record\\.${key}" = `));
  }
});
