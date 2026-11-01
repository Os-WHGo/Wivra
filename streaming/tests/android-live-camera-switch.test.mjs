// Wivra FULL Android LIVE camera selector: actual RootEncoder Camera2Source path.
// UI source switching is not simultaneous multi-camera capture or physical QA.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const live=readFileSync(new URL('../android/app/src/full/java/com/oswhgo/wivra/WivraPhoneLiveActivity.kt',import.meta.url),'utf8');

test('LIVE creates one real Camera2Source instance for switch and RTMP',()=>{
  assert.match(live,/private var cameraVideoSource: Camera2Source\? = null/);
  assert.match(live,/val source = Camera2Source\(applicationContext\)/);
  assert.match(live,/RtmpStream\(\s*applicationContext, this,\s*source, NoAudioSource\(\)/);
  assert.match(live,/cameraVideoSource = source/);
  assert.match(live,/cameraVideoSource = null/);
  assert.match(live,/source\.switchCamera\(\)/);
  assert.match(live,/CameraHelper\.Facing\.FRONT/);
});
test('camera flip is an explicit user action with guarded SDK failure',()=>{
  assert.match(live,/flipCameraButton = Button\(this\)\.apply \{[\s\S]*?setOnClickListener \{ togglePhoneCamera\(\) \}/);
  const fn=live.split('private fun togglePhoneCamera() {')[1]?.split('private fun preparePreview()')[0];
  assert.ok(fn);
  assert.match(fn,/!prepared \|\| stopping \|\| mediaBusy \|\| isFinishing \|\| isDestroyed/);
  assert.match(fn,/val source = cameraVideoSource \?: return/);
  assert.match(fn,/try \{[\s\S]*?source\.switchCamera\(\)/);
  assert.match(fn,/catch \(_:\s*Exception\)/);
  assert.match(fn,/Comprueba la vista previa antes de transmitir/);
});
test('switch UI is locked while encoder prepares or app shuts down',()=>{
  assert.match(live,/flipCameraButton\.isEnabled = false/);
  assert.match(live,/flipCameraButton\.isEnabled = true/);
  assert.match(live,/flipCameraButton\.isEnabled = prepared && !isFinishing &&[\s\S]*?!mediaBusy && !stopping/);
});
