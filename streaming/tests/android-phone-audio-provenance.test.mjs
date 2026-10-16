import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const native = '../android/app/src/main/java/com/oswhgo/wivra/';
const source = name => readFileSync(new URL(native + name, import.meta.url), 'utf8');
const recorder = source('WivraPhoneWavRecorder.kt');
const store = source('WivraPhoneMediaStore.kt');
const camera = source('WivraPhoneCameraActivity.kt');

test('WAV provenance comes from AudioRecord actual route, not a user-selected label', () => {
  assert.match(recorder, /val routed = record\.routedDevice/);
  assert.match(recorder, /firstRouteType = routed\?\.type/);
  assert.match(recorder, /firstRouteId = routed\?\.id/);
  assert.match(recorder, /routed\?\.id != firstRouteId/);
  assert.match(recorder, /routeChanged = true/);
  assert.match(recorder, /if \(routeChanged\) "android-mixed-input"/);
  assert.match(recorder, /else audioSource\(firstRouteType\)/);
  assert.match(recorder, /val audioInputSource: String/);
  assert.match(recorder, /preferredDevice\.id/);
});

test('manifest distinguishes built-in, wired, USB, Bluetooth, unknown and mixed sources', () => {
  for (const type of [
    'TYPE_BUILTIN_MIC', 'TYPE_WIRED_HEADSET',
    'TYPE_USB_DEVICE', 'TYPE_USB_HEADSET', 'TYPE_USB_ACCESSORY',
    'TYPE_BLUETOOTH_SCO', 'TYPE_BLE_HEADSET'
  ]) assert.ok(recorder.includes(type), type);
  for (const label of [
    'android-phone-mic', 'android-wired-mic', 'android-usb-mic',
    'android-bluetooth-mic', 'android-mixed-input', 'android-input-unknown'
  ]) {
    assert.ok(recorder.includes(label), label);
    assert.ok(store.includes(label), label);
  }
  assert.match(store, /val source = observedInputSource\.takeIf/);
  assert.match(store, /put\("source", source\)/);
  assert.doesNotMatch(store, /put\("source", "android-phone-mic"\)/);
  assert.match(camera, /result\.audioInputSource/);
  assert.match(store, /schemaVersion", 2/);
});

test('route metadata never stores Bluetooth identifiers, paired names or unverified Ray-Ban claims', () => {
  assert.doesNotMatch(store, /put\("device(?:Id|Name|Address|Mac)"/i);
  assert.doesNotMatch(recorder, /BluetoothAdapter|BluetoothDevice|\.getAddress\(/);
  assert.doesNotMatch(store, /ray-ban-mic|meta-dat-mic/);
  assert.match(store, /"android-input-unknown"/);
  assert.match(recorder, /if \(preferredDevice != null/);
  assert.match(recorder, /failure = "Selected microphone was not the active input"/);
});
