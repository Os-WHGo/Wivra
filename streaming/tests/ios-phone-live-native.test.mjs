import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app = readFileSync(new URL('../ios/B0/Sources/WivraMetaB0App.swift', import.meta.url),'utf8');
const source = readFileSync(new URL('../ios/B0/Sources/WivraIOSPhoneLiveScreen.swift', import.meta.url),'utf8');
const project = readFileSync(new URL('../ios/B0/project.yml', import.meta.url),'utf8');
const parser = readFileSync(new URL('../ios/B0/Sources/WivraIOSLiveEndpoint.swift', import.meta.url),'utf8');

test('iOS native LIVE uses exact HaishinKit version and RTMP product, not a new Wivra server', () => {
  assert.match(project, /HaishinKit:\s+url: https:\/\/github.com\/HaishinKit\/HaishinKit\.swift\s+exactVersion: 2\.2\.5/);
  assert.match(project, /product: RTMPHaishinKit/);
  assert.match(project, /product: HaishinKit/);
  assert.match(source, /import RTMPHaishinKit/);
  assert.match(source, /let newMixer = MediaMixer\(\)/);
  assert.match(source, /let newConnection = RTMPConnection\(\)/);
  assert.match(source, /let newStream = RTMPStream\(connection: newConnection\)/);
  assert.match(source, /try await newMixer\.attachVideo\(camera\)/);
  assert.match(source, /await newMixer\.addOutput\(newStream\)/);
  assert.match(source, /try await newConnection\.connect\(target\.serverURL\)/);
  assert.match(source, /try await newStream\.publish\(target\.streamKey\)/);
  assert.doesNotMatch(source, /WebSocket|customRelay|backend\.wivra|RTMP\s*stub/);
});

test('iPhone LIVE explicitly confirms public publishing and requests microphone only when enabled', () => {
  assert.match(app, /showingIPhoneLive = true/);
  assert.match(app, /WivraIOSPhoneLiveScreen\(\)/);
  assert.match(app, /\.disabled\(!model\.isReleasedForCameraHandoff \|\|/);
  assert.match(app, /!iPhoneCamera\.isReleasedForCameraHandoff/);
  assert.match(source, /SecureField\("URL completa:/);
  assert.match(source, /Confirmar emisión pública/);
  assert.match(source, /Button\("Iniciar LIVE"\)/);
  assert.match(source, /Button\("Cancelar", role: \.cancel\)/);
  assert.match(source, /guard await AVCaptureDevice\.requestAccess\(for: \.video\)/);
  assert.match(source, /if includeMicrophone \{\s*guard await AVCaptureDevice\.requestAccess\(for: \.audio\)/);
  assert.match(source, /if includeMicrophone \{\s*try await newMixer\.attachAudio/);
  assert.match(source, /endpoint = "" \/\/ Stream key never kept after publish request/);
  const executable = source.split("\n").filter(line => !line.trimStart().startsWith("//")).join("\n");
  assert.doesNotMatch(executable, /UserDefaults|Keychain|NSLog|print\(|error\.localizedDescription/);
  assert.match(parser, /parts\.query == nil, parts\.fragment == nil/);
});

test('leaving foreground closes RTMP and avoids claiming the provider verified the stream', () => {
  assert.match(source, /UIApplication\.didEnterBackgroundNotification/);
  assert.match(source, /\.onDisappear \{[\s\S]*?await publisher\.stop\(\)/);
  assert.match(source, /await oldStream\?\.close\(\)/);
  assert.match(source, /await oldConnection\?\.close\(\)/);
  assert.match(source, /try\? await oldMixer\.attachVideo\(nil\)/);
  assert.match(source, /generation == current/);
  assert.match(source, /No se ha confirmado recepción remota/);
  assert.match(source, /Verifica imagen, audio y VOD en la plataforma/);
  assert.match(source, /no crea MP4 local/);
  assert.doesNotMatch(source, /WivraSegmentedHEVCRecorder|startBackgroundCapture|isBroadcastReady\s*=\s*true/);
});

test('iOS LIVE offers front or back AVCaptureDevice before publishing and never hot-switches on air', () => {
  assert.match(source, /var useFrontCamera = false/);
  assert.match(source, /let position: AVCaptureDevice\.Position = useFrontCamera \? \.front : \.back/);
  assert.match(source, /AVCaptureDevice\.default\(\.builtInWideAngleCamera,[\s\S]*?position: position/);
  assert.match(source, /Toggle\("Usar cámara frontal", isOn: \$publisher\.useFrontCamera\)/);
  assert.match(source, /\.disabled\(publisher\.isBusy \|\| publisher\.isBroadcastRequested\)/);
  assert.match(source, /ios_live_front_camera_option/);
  assert.doesNotMatch(source, /switchCamera\(|swapCamera\(|attachMultiCamera/);
});
