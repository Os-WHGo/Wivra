// Gen2 iOS storage guard: static contracts, complemented by iOS CI compilation
// and an independent low-disk simulation with physical Ray-Ban hardware.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const guard = read('../ios/B0/Sources/WivraCaptureStorageGuard.swift');
const model = read('../ios/B0/Sources/MetaB0Model.swift');
const app = read('../ios/B0/Sources/WivraMetaB0App.swift');
const privacy = read('../ios/B0/Resources/PrivacyInfo.xcprivacy');
const project = read('../ios/B0/project.yml');

test('iOS reads important-usage storage locally with declared Apple privacy reasons', () => {
  assert.match(guard, /volumeAvailableCapacityForImportantUsageKey/);
  assert.match(guard, /values\.volumeAvailableCapacityForImportantUsage/);
  assert.match(privacy, /NSPrivacyAccessedAPICategoryDiskSpace/);
  assert.match(privacy, /<string>85F4\.1<\/string>/);
  assert.match(privacy, /<string>E174\.1<\/string>/);
  assert.match(project, /- path: Resources\s+buildPhase: resources/);
  assert.doesNotMatch(guard, /URLSession|fetch\(|upload\(|http[s]?:/);
});

test('recording preflight runs before resetting previous takes or arming AVAssetWriter', () => {
  assert.match(guard, /minimumStartBytes: Int64 = 512 \* 1024 \* 1024/);
  assert.match(guard, /minimumContinueBytes: Int64 = 256 \* 1024 \* 1024/);
  assert.match(guard, /availableBytes\.map \{ \$0 >= minimumStartBytes \} \?\? true/);
  assert.match(guard, /availableBytes\.map \{ \$0 < minimumContinueBytes \} \?\? false/);
  const begin = model.split('func beginRecording() {')[1]?.split('private func startStorageWatchdog')[0];
  assert.ok(begin, 'beginRecording must exist');
  const preflight = begin.indexOf('WivraCaptureStorageGuard.mayStart(');
  const reset = begin.indexOf('lastRecordedURL = nil');
  const arm = begin.indexOf('segmentedRecorder.arm()');
  assert.ok(preflight >= 0 && preflight < reset && reset < arm,
    'preflight must protect old take and run before arming the writer');
  assert.match(begin, /startStorageWatchdog\(\)/);
});

test('low-storage watchdog stops the LOCAL recorder without deleting recordings', () => {
  const watcher = model.split('private func startStorageWatchdog() {')[1]
    ?.split('func finishRecording() async {')[0];
  assert.ok(watcher, 'separate capture watchdog required');
  assert.match(watcher, /Task\.sleep\(for: \.seconds\(10\)\)/);
  assert.match(watcher, /WivraCaptureStorageGuard\.shouldStopToProtectFiles/);
  assert.match(watcher, /storageStoppedCapture = true/);
  assert.match(watcher, /await self\.finishRecording\(\)/);
  assert.doesNotMatch(watcher, /removeItem|delete|discardConfirmed/);
  const finalizer = model.split('func finishRecording() async {')[1];
  assert.match(finalizer, /storageWatchdog\?\.cancel\(\)/);
  assert.match(app, /meta_b1_storage_auto_stop/);
});

test('measured compressed HEVC rate creates only an explicitly approximate duration', () => {
  assert.match(guard, /hevcMbps\.isFinite, hevcMbps > 0/);
  assert.match(guard, /Double\(free - minimumStartBytes\)/);
  assert.match(guard, /hevcMbps \* 1_000_000/);
  assert.match(app, /model\.storageDiagnostic/);
  assert.match(app, /meta_b1_storage_estimate/);
  assert.match(app, /ios\.capture\.storage_export_reserve/);
  assert.doesNotMatch(guard, /guarantee|unlimited duration/);
});

test('all eight iOS locales have consistent on-device warnings and placeholder types', () => {
  const keys = [
    'ios.capture.storage_available',
    'ios.capture.storage_unknown',
    'ios.capture.storage_insufficient_start',
    'ios.capture.storage_minutes_estimate',
    'ios.capture.storage_export_reserve',
    'ios.capture.storage_stopped'
  ];
  for (const lang of ['es', 'en', 'fr', 'pt', 'de', 'it', 'ja', 'zh']) {
    const strings = read('../ios/B0/Resources/' + lang + '.lproj/Localizable.strings');
    const get = k => strings.split('"' + k + '" = "')[1]?.split('";')[0];
    for (const k of keys) assert.ok(get(k), lang + ' missing ' + k);
    assert.ok(get(keys[0]).includes('%@'), lang + ' available bytes must be localizable');
    assert.ok(get(keys[3]).includes('%d'), lang + ' estimate must use integer minutes');
  }
});
