// Runtime source readiness must be observed before publishing a LIVE stream.
// This is a native Kotlin gate, not a claim of physically verified video frames.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const live=readFileSync(new URL('../android/app/src/full/java/com/oswhgo/wivra/WivraPhoneLiveActivity.kt',import.meta.url),'utf8');

test('public LIVE requires current camera permission, active preview and valid surface',()=>{
  const gate=live.split('private fun cameraReadyForLive(): Boolean {')[1]?.split('private fun preparePreview()')[0];
  assert.ok(gate,'native camera readiness gate must exist');
  assert.match(gate,/val publisher = stream \?: return false/);
  assert.match(gate,/checkSelfPermission\(Manifest\.permission\.CAMERA\) == PackageManager\.PERMISSION_GRANTED/);
  assert.match(gate,/preview\.holder\.surface\.isValid && publisher\.isOnPreview/);
  assert.match(gate,/return prepared && !stopping && !isFinishing/);
  assert.doesNotMatch(gate,/isStreaming\s*=\s*true|CameraFacing\.FRONT/);
});

test('every public start stage rechecks live camera evidence, even after consent dialog',()=>{
  const request=live.split('private fun requestLive() {')[1]?.split('private fun confirmLive()')[0];
  const confirm=live.split('private fun confirmLive() {')[1]?.split('private fun startLive(')[0];
  const start=live.split('private fun startLive(')[1]?.split('private fun controlsIdle()')[0];
  assert.ok(request&&confirm&&start);
  assert.match(request,/if \(!cameraReadyForLive\(\)\) \{/);
  assert.match(confirm,/if \(!cameraReadyForLive\(\)\) \{/);
  assert.match(start,/if \(!cameraReadyForLive\(\) \|\| initiatedByUser\)/);
  const cameraCheck=start.indexOf('if (!cameraReadyForLive()');
  const openMedia=start.indexOf('WivraPhoneMediaStore.createPrivateVideo');
  const publish=start.indexOf('publisher.startStream(address)');
  assert.ok(cameraCheck>=0&&openMedia>cameraCheck&&publish>openMedia,
    'no MP4 or RTMP attempt before active camera readiness is confirmed');
  assert.match(confirm,/setTitle\(R\.string\.plive_confirm_title\)/);
  assert.match(confirm,/setPositiveButton\(R\.string\.plive_start\)/);
});

test('surface lifecycle prevents stale preview from presenting camera as ready',()=>{
  const created=live.split('override fun surfaceCreated(')[1]?.split('override fun surfaceChanged(')[0];
  const destroyed=live.split('override fun surfaceDestroyed(')[1]?.split('if \(checkSelfPermission')[0];
  assert.ok(created&&destroyed);
  assert.match(created,/startButton\.isEnabled = cameraReadyForLive\(\)/);
  assert.match(destroyed,/startButton\.isEnabled = false/);
  assert.match(live,/startButton\.isEnabled = cameraReadyForLive\(\) && !mediaBusy/);
  assert.match(live,/R\.string\.plive_preview_waiting/);
  assert.match(live,/R\.string\.plive_camera_not_ready/);
});

test('readiness gate does not disable screen capture or leak RTMP credentials',()=>{
  assert.match(live,/flipCameraButton/);
  assert.match(live,/private fun togglePhoneCamera\(\)/);
  assert.doesNotMatch(live,/Log\.(?:v|d|i|w|e)\([^)]*(?:address|endpointInput)/);
  const shell=readFileSync(new URL('../android/app/src/main/java/com/oswhgo/wivra/MainActivity.java',import.meta.url),'utf8');
  assert.match(shell,/WivraScreenLiveActivity/);
});
