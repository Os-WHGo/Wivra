// Regression: XcodeGen target.info.path rewrites manually maintained Info.plist
// and silently drops camera/microphone/Photos/Meta SDK permissions in the IPA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('XcodeGen uses checked-in Info.plist as-is, never regenerating it', () => {
  const yaml = read('../ios/B0/project.yml');
  assert.match(yaml, /^\\s*GENERATE_INFOPLIST_FILE:\\s*["']?NO["']?\\s*$/m);
  assert.match(yaml, /^\\s*INFOPLIST_FILE:\\s*Info\\.plist\\s*$/m);
  assert.doesNotMatch(yaml, /^\\s*info:\\s*\\n\\s*path:\\s*Info\\.plist/m);
});

test('iOS source plist declares every required native hardware and Photos capability', () => {
  const plist = read('../ios/B0/Info.plist');
  for (const key of [
    'CFBundleDisplayName', 'CFBundleURLTypes', 'NSCameraUsageDescription',
    'NSMicrophoneUsageDescription', 'NSPhotoLibraryAddUsageDescription',
    'NSBluetoothAlwaysUsageDescription', 'NSLocalNetworkUsageDescription',
    'UIBackgroundModes', 'MWDAT'
  ]) assert.ok(plist.includes('<key>' + key + '</key>'), 'missing iOS plist permission: '+key);
  for (const key of ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription',
    'NSPhotoLibraryAddUsageDescription', 'NSBluetoothAlwaysUsageDescription']) {
    const escaped = key.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
    assert.match(plist, new RegExp('<key>' + escaped + '</key>\\\\s*<string>[^<]+</string>'));
  }
});
