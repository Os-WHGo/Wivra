// Regression: XcodeGen target.info.path rewrites manually maintained Info.plist
// and silently drops camera/microphone/Photos/Meta SDK permissions in the IPA.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('XcodeGen uses checked-in Info.plist as-is, never regenerating it', () => {
  const lines = read('../ios/B0/project.yml').split('\n').map(line => line.trim());
  assert.ok(lines.includes('GENERATE_INFOPLIST_FILE: "NO"'));
  assert.ok(lines.includes('INFOPLIST_FILE: Info.plist'));
  assert.ok(!lines.includes('info:'), 'XcodeGen info.path would overwrite the checked-in file');
});

test('iOS source plist declares every required native hardware and Photos capability', () => {
  const plist = read('../ios/B0/Info.plist');
  for (const key of [
    'CFBundleDisplayName', 'CFBundleURLTypes', 'NSCameraUsageDescription',
    'NSMicrophoneUsageDescription', 'NSPhotoLibraryAddUsageDescription',
    'NSBluetoothAlwaysUsageDescription', 'NSLocalNetworkUsageDescription',
    'UIBackgroundModes', 'MWDAT'
  ]) assert.ok(plist.includes('<key>' + key + '</key>'), 'missing iOS plist permission: ' + key);
  for (const key of ['NSCameraUsageDescription', 'NSMicrophoneUsageDescription',
    'NSPhotoLibraryAddUsageDescription', 'NSBluetoothAlwaysUsageDescription']) {
    const after = plist.split('<key>' + key + '</key>')[1];
    assert.ok(after && after.trimStart().startsWith('<string>') && !after.trimStart().startsWith('<string></string>'),
      'missing non-empty usage description for ' + key);
  }
});
