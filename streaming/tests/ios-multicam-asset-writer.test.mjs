// W65: AVFoundation capture graph must be legal, recordings bounded and recoverable.
// Source contracts complement Swift 6 native compilation, not hardware acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = name => readFileSync(new URL('../ios/B0/Sources/' + name, import.meta.url), 'utf8');
const capture = source('WivraMultiCamCapture.swift');
const sink = source('WivraMultiCamSampleRecorder.swift');

test('W65: dual iPhone capture uses two VideoDataOutputs, not two MovieFileOutputs', () => {
  const dual = capture.slice(capture.indexOf('private func configureDual('),
                             capture.indexOf('private func configureSingle('));
  assert.equal((dual.match(/AVCaptureVideoDataOutput\(\)/g) || []).length, 2);
  assert.doesNotMatch(dual,/AVCaptureMovieFileOutput/);
  assert.match(dual,/s\.canAddOutput\(output\)/);
  assert.match(dual,/s\.canAddConnection\(recording\)/);
  assert.match(dual,/sampleRecorder = WivraMultiCamSampleRecorder/);
  const single = capture.slice(capture.indexOf('private func configureSingle('),
                               capture.indexOf('func toggleRecording()'));
  assert.match(single,/AVCaptureMovieFileOutput\(\)/);
});

test('W65: writer never queues unbounded camera frames; timestamp comes from video samples', () => {
  assert.match(sink,/queue = DispatchQueue\(/);
  assert.match(sink,/primary\.setSampleBufferDelegate\(self, queue: queue\)/);
  assert.match(sink,/secondary\.setSampleBufferDelegate\(self, queue: queue\)/);
  assert.match(capture,/output\.alwaysDiscardsLateVideoFrames = true/);
  assert.match(sink,/isReadyForMoreMediaData/);
  assert.match(sink,/dropped \+= 1/);
  assert.match(sink,/CMTimeGetSeconds\(CMTimeSubtract\(b, a\)\)/);
  assert.match(capture,/offsetSource: isDual \? "video-sample-pts" : "didStartRecording-callback"/);
});

test('W65: only primary writer has mic and cannot claim complete with zero requested audio', () => {
  assert.match(sink,/primary = Side\(url: primary, audioRequired: audioRequired\)/);
  assert.match(sink,/secondary = Side\(url: secondary, audioRequired: false\)/);
  assert.match(sink,/videoFrames > 0 && \(!audioRequired \|\| audioSamples > 0\)/);
  assert.match(sink,/AVFormatIDKey: kAudioFormatMPEG4AAC/);
  assert.match(capture,/sink\.start\(primary: a, secondary: b, audioRequired: includesAudio\)/);
});

test('W65: failed or empty second writer cannot be marked as a verified editor PiP', () => {
  assert.match(capture,/finishTake\(mainStatus: mainStatus, insetStatus: insetStatus/);
  assert.match(capture,/guard let b = secondaryURL, insetStatus == \.kept else \{ return nil \}/);
  assert.match(capture,/mainStatus == \.kept/);
  assert.match(capture,/WivraCaptureManifest\.write\(videoURL: a, tracks: \[\], mergedURL: nil/);
  assert.doesNotMatch(sink,/FileManager\.default\.removeItem/);
  assert.match(capture,/if mainStatus == \.empty \{ try\? FileManager\.default\.removeItem\(at: a\) \}/);
});
