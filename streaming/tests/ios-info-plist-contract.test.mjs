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


test('preserved iOS plist declares bundle identity and executable build-setting substitutions', () => {
  const plist = read('../ios/B0/Info.plist');
  for (const [key, value] of [
    ['CFBundleIdentifier', '$(PRODUCT_BUNDLE_IDENTIFIER)'],
    ['CFBundleExecutable', '$(EXECUTABLE_NAME)'],
    ['CFBundlePackageType', 'APPL'],
    ['CFBundleName', '$(PRODUCT_NAME)'],
    ['CFBundleVersion', '1'],
    ['CFBundleShortVersionString', '0.1.0'],
  ]) {
    assert.ok(plist.includes('<key>' + key + '</key><string>' + value + '</string>'),
      'bundle identity missing or not connected to Xcode build settings: ' + key);
  }
});

test('beta assembly verifies compiled app AND final IPA executable and privacy keys', () => {
  const workflow = read('../../.github/workflows/wivra-complete-beta-assembly.yml');
  assert.ok(workflow.includes('Payload/WivraMetaB0.app/$executable'), 'IPA executable missing');
  for (const key of ['CFBundleIdentifier', 'CFBundleExecutable', 'CFBundlePackageType',
    'CFBundleShortVersionString', 'NSCameraUsageDescription', 'NSMicrophoneUsageDescription',
    'NSPhotoLibraryAddUsageDescription', 'MWDAT:AppLinkURLScheme']) {
    assert.ok(workflow.includes(key), 'beta gate missing: ' + key);
  }
  assert.ok(workflow.includes('Verify privacy and Meta permissions INSIDE published unsigned IPA'));
});
