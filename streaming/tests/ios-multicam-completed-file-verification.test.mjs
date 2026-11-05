// W66 source/acceptance contracts: don't certify a recorded iPhone pair
// merely because AVAssetWriter returned success or the MOV has bytes.
// Real device timing and thermal still require an owner-authorized beta.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = name => readFileSync(new URL('../ios/B0/Sources/' + name, import.meta.url), 'utf8');
const capture = source('WivraMultiCamCapture.swift');
const verifier = source('WivraCaptureMediaVerifier.swift');
const sink = source('WivraMultiCamSampleRecorder.swift');

test('W66: full-track and boundary-media verifier is reused for both MOV files', () => {
  assert.match(capture,/WivraCaptureMediaVerifier\.verifyFile\(\s*result\.primaryURL, in: root, requireAudio: audioRequired\)/);
  assert.match(capture,/WivraCaptureMediaVerifier\.verifyFile\(\s*result\.secondaryURL, in: root, requireAudio: false\)/);
  assert.match(capture,/if result\.primaryComplete \{/);
  assert.match(capture,/if result\.secondaryComplete \{/);
  assert.match(verifier,/let tracks = try await asset\.loadTracks\(withMediaType: \.video\)/);
  assert.match(verifier,/let audioTracks = try await asset\.loadTracks\(withMediaType: \.audio\)/);
  assert.match(verifier,/guard !requireAudio \|\| !audioTracks\.isEmpty/);
  assert.match(verifier,/AVAssetReaderTrackOutput\(track: track, outputSettings: nil\)/);
  assert.match(verifier,/await generator\.image\(at:/);
});

test('W66: provisional receipt is written before slow verification and cannot certify either file', () => {
  const provisional = capture.indexOf('let pendingReceipt = WivraMultiCamTakeManifest(');
  const check = capture.indexOf('Task.detached(priority: .utility)');
  assert.ok(provisional >= 0 && provisional < check);
  const part = capture.slice(provisional,check);
  assert.match(part,/primaryStatus: primaryProvisional/);
  assert.match(part,/secondaryStatus: secondaryProvisional/);
  assert.match(capture,/finishedWithoutError: false/);
  assert.match(part,/WivraMultiCamTakeManifest\.write\(pendingReceipt, beside: result\.primaryURL\)/);
  assert.doesNotMatch(part,/WivraCaptureManifest\.write/);
});

test('W66: main actor is not blocked by walking long recordings and checks identity after verifier', () => {
  assert.match(capture,/Task\.detached\(priority: \.utility\)/);
  assert.match(capture,/await MainActor\.run \{ \[weak self\] in/);
  assert.match(capture,/guard let self, self\.isFinishing,\s*self\.primaryURL == result\.primaryURL,\s*self\.secondaryURL == result\.secondaryURL/);
  assert.match(capture,/finishedWithoutError: mainVerified/);
  assert.match(capture,/finishedWithoutError: secondaryVerified/);
  assert.match(sink,/videoFrames > 0 && \(!audioRequired \|\| audioSamples > 0\)/);
});

test('W66: corrupt, incomplete or missing secondary cannot enter editor as verified PiP', () => {
  assert.match(capture,/if mainStatus == \.kept \{/);
  assert.match(capture,/guard let b = secondaryURL, insetStatus == \.kept else \{ return nil \}/);
  assert.match(capture,/WivraCaptureManifest\.write\(videoURL: a, tracks: \[\], mergedURL: nil/);
  assert.match(capture,/if let b = secondaryURL, insetStatus == \.empty \{/);
  assert.match(capture,/if mainStatus == \.empty \{ try\? FileManager\.default\.removeItem\(at: a\) \}/);
});
