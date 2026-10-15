import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = file => readFileSync(new URL('../ios/B0/' + file, import.meta.url), 'utf8');

test('B1H keeps native iPhone and Meta cameras as separate capture sources', () => {
    const app = read('Sources/WivraMetaB0App.swift');
    assert.match(app, /WivraIPhoneCameraScreen\(\)/);
    assert.match(app, /if tab == \.iPhone \{ model\.endSession\(\) \}/);
    assert.match(app, /MetaB0Screen\(model: model\)/);
    const ui = read('Sources/WivraIPhoneCameraScreen.swift');
    assert.match(ui, /\.onDisappear \{ camera\.stop\(\) \}/);
});

test('B1H configures AVFoundation photo and movie capture on one session', () => {
    const camera = read('Sources/WivraIPhoneCamera.swift');
    assert.match(camera, /let photoOutput = AVCapturePhotoOutput\(\)/);
    assert.match(camera, /let movieOutput = AVCaptureMovieFileOutput\(\)/);
    assert.match(camera, /session\.addOutput\(photoOutput\)/);
    assert.match(camera, /session\.addOutput\(movieOutput\)/);
    assert.match(camera, /photoOutput\.capturePhoto\(/);
    assert.match(camera, /movieOutput\.startRecording/);
    assert.doesNotMatch(camera, /\.startRecording.*RTMP|RTMPS/);
});

test('B1H offers iPhone Auto Pro controls only when hardware supports them', () => {
    const camera = read('Sources/WivraIPhoneCamera.swift');
    const ui = read('Sources/WivraIPhoneCameraScreen.swift');
    assert.match(camera, /device\.isExposureModeSupported\(\.custom\)/);
    assert.match(camera, /device\.isLockingFocusWithCustomLensPositionSupported/);
    assert.match(camera, /setExposureModeCustom/);
    assert.match(camera, /setFocusModeLocked/);
    assert.match(ui, /iphone_auto_pro/);
    assert.match(ui, /iphone_iso/);
    assert.match(ui, /iphone_shutter/);
    assert.match(ui, /iphone_focus/);
});

test('B1H requests camera and microphone privacy consent and conservatively stops in background', () => {
    const camera = read('Sources/WivraIPhoneCamera.swift');
    const ui = read('Sources/WivraIPhoneCameraScreen.swift');
    const plist = read('Info.plist');
    assert.match(plist, /NSCameraUsageDescription/);
    assert.match(plist, /NSMicrophoneUsageDescription/);
    assert.match(camera, /requestAccess\(for: \.video\)/);
    assert.match(camera, /requestAccess\(for: \.audio\)/);
    assert.match(ui, /UIApplication\.didEnterBackgroundNotification/);
});

test('B1H preserves original media and uses existing local photo looks for copies', () => {
    const camera = read('Sources/WivraIPhoneCamera.swift');
    assert.match(camera, /WivraIPhoneMedia/);
    assert.match(camera, /bytes\.write\(to: url, options: \.atomic\)/);
    assert.match(camera, /WivraPhotoLooks\.renderJPEG/);
    assert.match(camera, /lastFilteredURL = url/);
    const ui = read('Sources/WivraIPhoneCameraScreen.swift');
    assert.match(ui, /Compartir JPEG original/);
    assert.match(ui, /Compartir MOV original/);
});
