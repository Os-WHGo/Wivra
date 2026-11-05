// W67 source contracts. Complements, never replaces, iPhone hardware testing.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = name => readFileSync(new URL('../ios/B0/Sources/' + name, import.meta.url), 'utf8');
const capture = source('WivraMultiCamCapture.swift');
const policy = source('WivraMultiCamSafetyPolicy.swift');

test('W67: async permission and restart cannot revive exited/background session', () => {
  assert.match(capture,/sessionRequest \+= 1/);
  assert.match(capture,/self\.sessionRequest == request, !self\.stopSessionAfterFinish/);
  assert.match(capture,/self\.runner\.stop\(current\) \{\}/);
  assert.match(capture,/UIApplication\.shared\.applicationState != \.active/);
  assert.match(capture,/foregroundActive: UIApplication\.shared\.applicationState == \.active/);
});
test('W67: exit cancels continuation and releases camera before long verification', () => {
  const block = capture.slice(capture.lastIndexOf('    func stop() {'));
  assert.match(block,/continueAfterFinish = false/);
  assert.match(block,/stopSessionAfterFinish = true/);
  assert.match(block,/safetyMonitor\?\.cancel\(\)/);
  assert.match(block,/if isRecording && !isFinishing \{ stopRecording\(owner: true\) \}/);
  assert.match(block,/runner\.stop\(session\) \{\}/);
  assert.match(capture,/guard !isFinishing, !stopSessionAfterFinish else \{ return \}/);
});
test('W67: disk reserve, thermal checks, bounded continuation', () => {
  assert.match(policy,/minimumFreeBytesToStart: Int64 = 512 \* 1024 \* 1024/);
  assert.match(policy,/minimumFreeBytesToContinue: Int64 = 256 \* 1024 \* 1024/);
  assert.match(capture,/guard WivraMultiCamSafetyPolicy\.canStart\(freeBytes: freeDiskBytes\(\)\)/);
  assert.match(capture,/ProcessInfo\.processInfo\.thermalState/);
  assert.match(capture,/case \.switchToSingle:/);
  assert.match(capture,/case \.stopAndPreserve:/);
  assert.match(capture,/armSafetyMonitor\(\)/);
  assert.match(capture,/let shouldRestart = continueAfterFinish &&/);
});
test('W67: secondary-only media gets a provisional recovery receipt', () => {
  assert.match(capture,/if primaryProvisional != \.empty \|\| secondaryProvisional != \.empty/);
  assert.match(capture,/WivraMultiCamTakeManifest\.write\(pendingReceipt, beside: result\.primaryURL\)/);
});
test('W67: intent written before writers receive samples', () => {
  const beginning = capture.indexOf('let intent = WivraMultiCamTakeManifest(');
  const launch = capture.indexOf('sink.start(primary: a, secondary: b, audioRequired: includesAudio)');
  assert.ok(beginning > 0 && launch > beginning);
  const first = capture.slice(beginning, launch);
  assert.match(first,/primaryStatus: \.needsReview, secondaryStatus: \.needsReview/);
  assert.match(first,/offsetSource: "awaiting-video-sample-pts"/);
  assert.match(first,/WivraMultiCamTakeManifest\.write\(intent, beside: a\)/);
  assert.match(first,/No se pudo guardar el recibo de recuperación/);
});
