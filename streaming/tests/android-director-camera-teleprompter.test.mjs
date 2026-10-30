import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const base='../android/app/src/main/';
const host=read(base+'java/com/oswhgo/wivra/MainActivity.java');
const camera=read(base+'java/com/oswhgo/wivra/WivraPhoneCameraActivity.kt');
const plan=read('../../app/template.html');
const gradle=read('../android/app/build.gradle');

test('Director and native camera refer to same persisted local shot plan',()=>{
  assert.match(plan,/const SHOOT_STORAGE_KEY='agentcut-shoot-checklist-v1'/);
  assert.match(plan,/localStorage\.setItem\(SHOOT_STORAGE_KEY,JSON\.stringify\(shootPlan\)\)/);
  assert.match(plan,/shootPlan\.shots/);
  assert.match(host,/const plan=typeof shootPlan==='object'\?shootPlan:null/);
  assert.doesNotMatch(host,/localStorage\.getItem\(/);
  assert.match(host,/agentcut-shoot-plan-v0\.1/);
  assert.match(host,/s\.state==='todo'\|\|s\.state==='retry'/);
  assert.match(host,/s\.script\.slice\(0,2200\)/);
  assert.match(host,/launchPhoneCameraFromDirector\(\)/);
  assert.match(host,/phone\.setOnClickListener\(v -> launchPhoneCameraFromDirector\(\)\)/);
});
test('User chooses a pending take or plain camera, never silent implicit capture',()=>{
  assert.match(host,/options\[0\] = getString\(R\.string\.phone_camera_without_script\)/);
  assert.match(host,/new AlertDialog\.Builder\(this\)/);
  assert.match(host,/setItems\(options,/);
  assert.match(host,/EXTRA_SHOT_SCRIPT/);
  assert.match(host,/putExtra\(WivraPhoneCameraActivity\.EXTRA_SHOT_SCRIPT, script\)/);
  assert.match(camera,/getStringExtra\(EXTRA_SHOT_SCRIPT\)/);
  assert.match(camera,/takeIf \{ it\.length <= 2200 \}/);
  assert.match(host,/startActivity\(launch\)/);
});
test('Native bridge reads ONLY packaged offline editor after user tap',()=>{
  assert.match(host,/file:\/\/\/android_asset\/agentcut\.html"\.equals\(editor\.getUrl\(\)\)/);
  assert.match(host,/editor\.evaluateJavascript\(readOnly, encoded ->/);
  assert.match(host,/new org\.json\.JSONTokener\(encoded\)\.nextValue\(\)/);
  assert.doesNotMatch(host,/addJavascriptInterface\(/);
  assert.doesNotMatch(host,/http(s)?:\/\/.*evaluateJavascript/);
  assert.doesNotMatch(gradle,/play-services-ads|billingclient/i);
});
test('Script scroll UI is ONLY a native overlay on CameraX PreviewView, not encoded',()=>{
  assert.match(camera,/FrameLayout\(this\)/);
  assert.match(camera,/cameraFrame\.addView\(viewfinder,/);
  assert.match(camera,/cameraFrame\.addView\(teleScroll,/);
  assert.match(camera,/PreviewView\.ImplementationMode\.COMPATIBLE/);
  assert.match(camera,/EXTRA_SHOT_SCRIPT/);
  assert.match(camera,/setBackgroundColor\(Color\.argb\(190, 0, 0, 0\)\)/);
  assert.match(camera,/tpWpm|teleWpm/);
  assert.match(camera,/teleHandler\.postDelayed\(this, 40L\)/);
  assert.match(camera,/teleHandler\.removeCallbacks\(teleTick\)/);
  assert.match(camera,/override fun onPause\(\)/);
  assert.match(camera,/override fun onDestroy\(\)/);
  assert.doesNotMatch(camera,/setContentDescription\(script\)/);
  assert.doesNotMatch(camera,/addView\(teleText,.*VideoCapture/s);
});
test('No hardware manipulation or irreversible changes to Director project',()=>{
  assert.doesNotMatch(host,/localStorage\.setItem/);
  assert.doesNotMatch(host,/localStorage\.removeItem/);
  assert.doesNotMatch(host,/addJavascriptInterface\(/);
  assert.doesNotMatch(camera,/publish.*teleText|saveSidecarTiming.*teleText/);
  assert.match(camera,/CameraSelector\.DEFAULT_BACK_CAMERA/);
  assert.match(camera,/WivraPhoneMediaStore\.createPrivateVideo\(this\)/);
});
test('Native Director labels exist in all six app languages',()=>{
  for(const loc of ['values','values-en','values-fr','values-de','values-it','values-ja']){
    const text=read('../android/app/src/main/res/'+loc+'/strings.xml');
    for(const k of ['phone_camera_choose_shot','phone_camera_without_script',
     'phone_camera_unnamed_shot','teleprompter_accessible','teleprompter_start',
     'teleprompter_pause','teleprompter_slower','teleprompter_faster',
     'teleprompter_smaller','teleprompter_bigger','teleprompter_hide','teleprompter_wpm']){
      assert.match(text,new RegExp('<string name="'+k+'">[^<]+<\\/string>'));
    }
  }
});
