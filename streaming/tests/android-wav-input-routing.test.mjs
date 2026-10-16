import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const root='../android/app/src/main/';
const source=read(root+'java/com/oswhgo/wivra/WivraPhoneAudioInputs.kt');
const capture=read(root+'java/com/oswhgo/wivra/WivraPhoneCameraActivity.kt');
const recorder=read(root+'java/com/oswhgo/wivra/WivraPhoneWavRecorder.kt');
const manifest=read(root+'AndroidManifest.xml');

test('native audio input list is actual Android OS source devices only',()=>{
  assert.match(source,/AudioManager\.GET_DEVICES_INPUTS/);
  assert.match(source,/manager\.getDevices\(/);
  assert.match(source,/it\.isSource && supported\(it\.type\)/);
  assert.match(source,/TYPE_BUILTIN_MIC/);
  assert.match(source,/TYPE_WIRED_HEADSET/);
  assert.match(source,/TYPE_USB_DEVICE/);
  assert.match(source,/TYPE_USB_HEADSET/);
  assert.match(source,/TYPE_BLUETOOTH_SCO/);
  assert.match(source,/TYPE_BLE_HEADSET/);
  assert.match(source,/hasBluetoothPermission\(context\)/);
  assert.match(source,/includeBluetooth \|\| !bluetooth\(it\.type\)/);
  assert.match(source,/catch \(_: SecurityException\)/);
  assert.doesNotMatch(source,/getScanResults|startDiscovery|BluetoothLeScanner|http[s]?:\/\//);
});

test('Bluetooth CONNECT permission is opt-in, requested only from chooser',()=>{
  assert.match(manifest,/android\.permission\.BLUETOOTH_CONNECT/);
  assert.match(source,/ContextCompat\.checkSelfPermission/);
  assert.match(capture,/bluetoothPermission = registerForActivityResult/);
  assert.match(capture,/choice <= sources\.size/);
  assert.match(capture,/bluetoothPermission\.launch\(Manifest\.permission\.BLUETOOTH_CONNECT\)/);
  assert.match(capture,/R\.string\.phone_camera_source_enable_bluetooth/);
  assert.doesNotMatch(capture,/onCreate[\s\S]{0,150}bluetoothPermission\.launch/);
});

test('source routing available only in WAV mode, blocked while filming',()=>{
  assert.match(capture,/private var selectedAudioInputId: Int\? = null/);
  assert.match(capture,/audioSourceButton = button\(R\.string\.phone_camera_source_choose\)/);
  assert.match(capture,/micMode == 2 &&[\s\S]{0,100}activeRecording == null/);
  assert.match(capture,/if \(micMode != 2 \|\| activeRecording != null \|\| recordingFinishing\)/);
  assert.match(capture,/WivraPhoneAudioInputs\.available\(this\)/);
  assert.match(capture,/WivraPhoneAudioInputs\.resolve\(this, id\)/);
  assert.match(capture,/selectedAudioInputId = chosen\.id/);
  assert.match(capture,/WivraPhoneWavRecorder\([\s\S]{0,160}chosen/);
  assert.match(capture,/if \(micMode == 1\) pending\.withAudioEnabled\(\) else pending/);
});

test('selected route must truly be active, otherwise private WAV fails closed',()=>{
  assert.match(recorder,/AudioDeviceInfo\? = null/);
  assert.match(recorder,/record\.setPreferredDevice\(preferredDevice\)/);
  assert.match(recorder,/record\.routedDevice/);
  assert.match(recorder,/routed == null \|\| routed\.id != preferredDevice\.id/);
  assert.match(recorder,/Selected microphone was not the active input/);
  assert.match(capture,/wavFailed = !result\.usable/);
  assert.match(capture,/R\.string\.phone_camera_wav_failed/);
  assert.doesNotMatch(recorder,/AudioTrack|SpeechRecognizer|upload|BillingClient|Retrofit/);
});

test('input chooser accessible in all six native locales',()=>{
  for(const loc of ['values','values-en','values-fr','values-de','values-it','values-ja']){
    const resource=read('../android/app/src/main/res/'+loc+'/strings.xml');
    for(const key of ['phone_camera_source_choose','phone_camera_source_auto',
      'phone_camera_source_selected','phone_camera_source_wav_only',
      'phone_camera_source_enable_bluetooth','phone_camera_source_bluetooth_denied',
      'phone_camera_source_built_in','phone_camera_source_wired',
      'phone_camera_source_usb','phone_camera_source_bluetooth']){
      assert.match(resource,new RegExp('<string name="'+key+'">[^<]*<\\/string>'));
    }
  }
});
