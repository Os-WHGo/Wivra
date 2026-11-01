import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const base = '../android/app/src/';
const activity = readFileSync(new URL(base + 'full/java/com/oswhgo/wivra/WivraPhoneLiveActivity.kt', import.meta.url), 'utf8');
const fullGradle = readFileSync(new URL('../android/app/build.gradle', import.meta.url), 'utf8');
const captureManifest = readFileSync(new URL(base + 'main/AndroidManifest.xml', import.meta.url), 'utf8');

test('LIVE microphone choices are read from Android inputs, not from invented device brands', () => {
  assert.match(activity, /audioManager\.getDevices\(AudioManager\.GET_DEVICES_INPUTS\)/);
  assert.match(activity, /\.filter \{ it\.isSource \}/);
  assert.match(activity, /TYPE_BUILTIN_MIC/);
  assert.match(activity, /TYPE_WIRED_HEADSET/);
  assert.match(activity, /TYPE_USB_HEADSET/);
  assert.match(activity, /TYPE_BLUETOOTH_SCO/);
  assert.match(activity, /TYPE_BLE_HEADSET/);
  assert.match(activity, /setSingleChoiceItems\(options, selectedIndex\)/);
  assert.match(activity, /selectedDevice\(choice: ChosenInput\): AudioDeviceInfo\?/);
  assert.match(activity, /if \(withAudio && selectedInput != null &&/);
  assert.match(activity, /if \(chosen != null && input == null\) \{/);
  assert.doesNotMatch(activity, /Meta\s*(?:audio|mic|microphone)\s*is\s*(?:ready|verified)/i);
});

test('RootEncoder microphone receives selected AudioDeviceInfo after prepareAudio, without opening a diagnostic recorder', () => {
  const begin = activity.indexOf('val pending: File? = try {');
  const prepare = activity.indexOf('publisher.prepareAudio(44_100, false, 64_000)', begin);
  const assign = activity.indexOf('microphone.setPreferredDevice(input)', begin);
  const reserve = activity.indexOf('WivraPhoneMediaStore.createPrivateVideo(applicationContext)', begin);
  const publish = activity.indexOf('publisher.startStream(address)', begin);
  assert.ok(begin >= 0 && begin < prepare && prepare < assign && assign < reserve && reserve < publish);
  assert.match(activity, /publisher\.changeAudioSource\(\s*if \(withAudio\) microphone else NoAudioSource\(\)/);
  assert.match(activity, /if \(input != null && !microphone\.setPreferredDevice\(input\)\) \{/);
  assert.doesNotMatch(activity, /AudioRecord\.Builder|startRecording\(\)/);
  assert.match(activity, /micOption\.isChecked &&\s*checkSelfPermission\(Manifest\.permission\.RECORD_AUDIO\)/);
});

test('explicit LIVE input loss stops transmission and leaves MP4 review policy intact', () => {
  const callback = activity.split('private val audioDeviceCallback = object : AudioDeviceCallback() {')[1]
    ?.split('private fun discoverInputs()')[0] ?? '';
  assert.match(callback, /removedDevices\.none \{ it\.id == expected\.id && it\.type == expected\.type \}/);
  assert.match(callback, /if \(initiatedByUser && !stopping && liveInput == expected\)/);
  assert.match(callback, /stopAndReview\(\)/);
  assert.match(callback, /R\.string\.live_audio_disconnected/);
  assert.match(activity, /registerAudioDeviceCallback\(audioDeviceCallback, Handler\(Looper\.getMainLooper\(\)\)\)/);
  assert.match(activity, /unregisterAudioDeviceCallback\(audioDeviceCallback\)/);
  assert.match(activity, /liveInput = null/);
  assert.match(activity, /WivraPhoneMediaStore\.publish/);
  assert.match(activity, /verifiedMp4\(file\)/);
});

test('microphone selector is FULL-only, local and disclosed in eight languages', () => {
  assert.match(fullGradle, /fullImplementation 'com\.github\.pedroSG94\.RootEncoder:library:2\.8\.1'/);
  assert.doesNotMatch(captureManifest, /WivraPhoneLiveActivity/);
  assert.doesNotMatch(activity, /SharedPreferences|putExtra\(\s*["'](?:audio|mic)|\bLog\.\w+\(.*(?:device\.id|selectedInput)/);
  for (const lang of ['values', 'values-en', 'values-fr', 'values-pt', 'values-de', 'values-it', 'values-ja', 'values-zh']) {
    const xml = readFileSync(new URL(base + 'main/res/' + lang + '/strings.xml', import.meta.url), 'utf8');
    for (const key of ['live_audio_select_button', 'live_audio_auto', 'live_audio_select_title',
      'live_audio_usb', 'live_audio_bluetooth', 'live_audio_disconnected',
      'live_audio_unavailable', 'live_audio_preference_only']) {
      assert.match(xml, new RegExp('<string name="' + key + '">'), lang + ' missing ' + key);
    }
  }
});
