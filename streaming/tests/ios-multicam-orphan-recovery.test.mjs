import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=name=>readFileSync(new URL('../ios/B0/Sources/'+name,import.meta.url),'utf8');
const recovery=source('WivraMultiCamRecoveryStore.swift');
const policy=source('WivraMultiCamRecoveryPolicy.swift');
const capture=source('WivraMultiCamCapture.swift');
const library=source('WivraNativeCaptureLibrary.swift');

test('W69: only app-generated MOV receipts in the private directory can be considered',()=>{
  assert.match(recovery,/WivraIPhoneMedia/);
  assert.match(recovery,/maximumReceiptBytes = 16 \* 1024/);
  assert.match(recovery,/maximumReceipts = 2048/);
  assert.match(policy,/UUID\(uuidString: id\) != nil/);
  assert.match(policy,/m\.schema == "wivra-multicam-take-v1"/);
  assert.match(policy,/m\.mode == "dual-separate"/);
  assert.match(policy,/m\.secondaryStatus != nil/);
  assert.match(recovery,/\.isSymbolicLinkKey/);
  assert.match(recovery,/file == file\.resolvingSymlinksInPath\(\)\.standardizedFileURL/);
  assert.match(recovery,/receiptURL\.lastPathComponent ==/);
});
test('W69: active camera writer and existing .wivra.json block recovery',()=>{
  assert.match(capture,/WivraMultiCamActiveCaptureRegistry\.start\(a\)/);
  assert.match(capture,/WivraMultiCamActiveCaptureRegistry\.finished\(a\)/);
  assert.match(recovery,/!WivraMultiCamActiveCaptureRegistry\.isActive\(primary\)/);
  assert.match(recovery,/!FileManager\.default\.fileExists\(atPath:/);
  assert.match(recovery,/return \.alreadyIndexed/);
});
test('W69: native reader validates both MOVs independently, off the UI actor',()=>{
  assert.match(recovery,/await WivraCaptureMediaVerifier\.verifyFile\(candidate\.primaryURL, in: folder,/);
  assert.match(recovery,/requireAudio: candidate\.intent\.audio == "primary"/);
  assert.match(recovery,/await WivraCaptureMediaVerifier\.verifyFile\(candidate\.secondaryURL, in: folder\)/);
  assert.match(recovery,/mainBefore == stamp\(candidate\.primaryURL, in: folder\)/);
  assert.match(recovery,/secondaryBefore == stamp\(candidate\.secondaryURL, in: folder\)/);
  assert.match(library,/Task\.detached\(priority: \.utility\)/);
});
test('W69: no secondary PiP without verified real sample PTS',()=>{
  assert.match(policy,/secondaryVerified, offsetSource == "video-sample-pts"/);
  assert.match(policy,/abs\(offsetMs\) <= 10_000/);
  assert.match(recovery,/let mayPair = WivraMultiCamRecoveryPolicy\.mayPair/);
  assert.match(recovery,/guard proof\.main else \{/);
  assert.match(recovery,/return proof\.secondary \? \.secondaryOnly : \.unverified/);
  assert.match(recovery,/cameraSource: "iphone-avfoundation", multicam: secondary/);
  assert.doesNotMatch(recovery,/WivraPhotosLibrary/);
});
test('W69: catalog includes explicit recovery UI and original MOV sharing, not auto-PHOTOS',()=>{
  assert.match(library,/recoverableMultiCam = WivraMultiCamRecoveryStore\.scan\(\)/);
  assert.match(library,/WivraMultiCamRecoveryStore\.publish\(take, proof: proof\)/);
  assert.match(library,/ShareLink\(item: take\.primaryURL\)/);
  assert.match(library,/ShareLink\(item: take\.secondaryURL\)/);
  assert.match(library,/recoveringMultiCamID != nil/);
});
