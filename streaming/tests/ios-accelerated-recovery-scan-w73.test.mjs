import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// W73 source regression; real H.264/AAC native verification is exercised
// separately by WivraAcceleratedRecoverySmoke.swift on macOS CI.
const native=readFileSync(new URL('../ios/B0/Sources/WivraAcceleratedExportStore.swift',
  import.meta.url),'utf8');
const smoke=readFileSync(new URL('./WivraAcceleratedRecoverySmoke.swift',
  import.meta.url),'utf8');

test('W73: only generated UUID private MP4 candidates count toward bounded scan',()=>{
  assert.match(native,/private static func isGeneratedRecoveredName/);
  assert.match(native,/name\.count == prefix\.count \+ 36 \+ 4/);
  assert.match(native,/UUID\(uuidString:/);
  assert.match(native,/let candidates = urls\.compactMap/);
  assert.match(native,/Self\.isGeneratedRecoveredName\(url\.lastPathComponent\)/);
  assert.match(native,/Self\.recoveryStamp\(url, in: root\)/);
  assert.match(native,/\.sorted \{/);
  assert.match(native,/\.prefix\(200\)/);
  assert.doesNotMatch(native,/for url in urls\.prefix\(200\)/);
  assert.match(smoke,/for index in 0\.\.<240/);
  assert.match(smoke,/for index in 0\.\.<30/);
});

test('W73: reject symlinks, traversals, empty and oversized files',()=>{
  assert.match(native,/file\.deletingLastPathComponent\(\) == root/);
  assert.match(native,/file == file\.resolvingSymlinksInPath\(\)\.standardizedFileURL/);
  assert.match(native,/values\.isRegularFile == true, values\.isSymbolicLink == false/);
  assert.match(native,/let bytes = values\.fileSize, bytes > 0/);
  assert.match(native,/Int64\(bytes\) <= WivraRandomAccessExportSession\.maxOutputBytes/);
  assert.match(native,/let modified = values\.contentModificationDate/);
});

test('W73: changing file cannot be published after stale AVFoundation inspection',()=>{
  assert.match(native,/let initialStamp = candidate\.stamp/);
  assert.match(native,/WivraMp4Repair\.inspect\(url\)/);
  assert.match(native,/Self\.compatibleNativeCodecs\(url, expectAudio: metadata\.audio\)/);
  const rechecks=native.match(/Self\.recoveryStamp\(url, in: root\) == initialStamp/g)??[];
  assert.equal(rechecks.length,2,'Require one freshness check after AVFoundation and one after SHA-256');
  assert.match(native,/actualBytes == Int64\(initialStamp\.bytes\)/);
  assert.match(native,/digest\.update\(data: bytes\)/);
  assert.match(native,/let sha = digest\.finalize\(\)/);
});

test('W73: recovery remains read-only and does not assert physical acceptance',()=>{
  const recovery=native.split('func recovered() async -> [Completed] {')[1]
    ?.split('\n    func saved(token:')[0];
  assert.ok(recovery);
  assert.doesNotMatch(recovery,/removeItem|moveItem|copyItem|createFile|write\(to:|savePhotos/);
  assert.match(recovery,/return result/);
  assert.match(smoke,/WivraMp4Repair\.inspect\(verified\)/);
  assert.match(smoke,/verifiedOnDevice|AVFoundation-verified|macOS PASS/);
});
