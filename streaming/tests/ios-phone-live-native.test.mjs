import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const files = rel => readFileSync(new URL('../ios/B0/'+rel, import.meta.url), 'utf8');
const source = files('Sources/WivraIPhoneLiveScreen.swift');
const app = files('Sources/WivraMetaB0App.swift');
const project = files('project.yml');
const parser = files('Sources/WivraIOSLiveEndpoint.swift');

test('single native iPhone LIVE entry requires exclusive camera ownership',()=>{
  assert.match(project,/HaishinKit:\s+url: https:\/\/github\.com\/HaishinKit\/HaishinKit\.swift\s+exactVersion: 2\.2\.5/);
  assert.match(project,/product: RTMPHaishinKit/);
  assert.match(source,/let capture = MediaMixer\(\)/);
  assert.match(source,/RTMPConnection\(\)/);
  assert.match(source,/RTMPStream\(connection: liveConnection\)/);
  assert.match(source,/try await capture\.attachVideo\(camera\)/);
  assert.match(source,/await capture\.startRunning\(\)/);
  assert.match(app,/showingPhoneLive = true/);
  assert.match(app,/\.disabled\(!model\.isReleasedForCameraHandoff \|\|/);
  assert.match(app,/!iPhoneCamera\.isReleasedForCameraHandoff/);
  assert.match(app,/WivraIPhoneLiveScreen\(\)/);
  assert.doesNotMatch(app,/WivraIOSPhoneLiveScreen|showingIPhoneLive/);
  assert.match(source,/MTHKViewRepresentable\(previewSource: controller\)/);
  assert.match(source,/await mixer\.addOutput\(view\)/);
  assert.doesNotMatch(source,/MWDATCamera|MetaB0Model|startBackgroundCapture/);
});

test('RTMP endpoint and public consent are validated before attempting publish, with no secret persistence',()=>{
  assert.match(source,/WivraIOSLiveEndpoint\.parse\(rawEndpoint\)/);
  assert.match(source,/\.confirmationDialog\(/);
  assert.match(source,/Button\("INICIAR LIVE"\)/);
  assert.match(source,/destination = ""/);
  assert.match(source,/SecureField\("rtmps:\/\/servidor\/live\/clave"/);
  assert.match(source,/try await liveConnection\.connect\(endpoint\.serverURL\)/);
  assert.match(source,/try await liveStream\.publish\(endpoint\.streamKey\)/);
  assert.match(source,/generation == current, phase == \.connecting/);
  assert.match(source,/generation = UUID\(\) \/\/ Invalidate all pending/);
  assert.doesNotMatch(source,/UserDefaults|Keychain|NSLog|print\(|error\.localizedDescription|URLSession|Text\(destination\)/);
  assert.match(parser,/parts\.query == nil, parts\.fragment == nil/);
});

test('optional iPhone mic and local video-only MP4 have distinct privacy and validity gates',()=>{
  assert.match(source,/let allowed = await AVCaptureDevice\.requestAccess\(for: \.video\)/);
  assert.match(source,/guard allowed else/);
  assert.match(source,/let allowedAudio = await AVCaptureDevice\.requestAccess\(for: \.audio\)/);
  assert.match(source,/try await capture\.attachAudio\(AVCaptureDevice\.default\(for: \.audio\)\)/);
  assert.match(source,/let writer = StreamRecorder\(\)/);
  assert.match(source,/await writer\.setMovieFragmentInterval\(10\.0\)/);
  assert.match(source,/StreamRecorder\.defaultSettings\.filter \{ \$0\.key == \.video \}/);
  assert.match(source,/try await writer\.startRecording\(file, settings: settings\)/);
  assert.ok(source.indexOf('try await writer.startRecording(file, settings: settings)') < source.indexOf('try await liveConnection.connect(endpoint.serverURL)'));
  assert.match(source,/WivraCaptureMediaVerifier\.verifyFile\(result, in: folder\)/);
  assert.match(source,/unverifiedVideoURL = result/);
  assert.match(source,/ShareLink\(item: file\)/);
  assert.match(source,/try await WivraPhotosLibrary\.saveVideo\(file\)/);
  assert.match(source,/no se publicará automáticamente/i);
});

test('leaving foreground closes stream and stops native camera; real VOD still requires external verification',()=>{
  assert.match(source,/UIApplication\.didEnterBackgroundNotification/);
  assert.match(source,/\.onDisappear \{ Task \{ await controller\.stop\(\) \} \}/);
  assert.match(source,/try\? await localStream\.close\(\)/);
  assert.match(source,/try\? await localConnection\.close\(\)/);
  assert.match(source,/localMixer\.stopRunning\(\)/);
  assert.match(source,/Button\("DETENER LIVE"\)/);
  assert.match(source,/VOD remoto/);
});
