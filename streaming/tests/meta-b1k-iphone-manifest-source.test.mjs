import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => readFileSync(new URL('../ios/B0/Sources/' + name, import.meta.url), 'utf8');
const writer = read('WivraCaptureManifest.swift');
const camera = read('WivraIPhoneCamera.swift');
const ui = read('WivraIPhoneCameraScreen.swift');
const spec = JSON.parse(readFileSync(new URL('../contracts/wivra-manifest-v2.schema.json', import.meta.url), 'utf8'));

test('B1K preserves the Meta canonical writer and accepts an explicit iPhone source', () => {
  assert.match(writer, /cameraSource: String = "meta-dat-hevc"/);
  assert.match(writer, /cameraSource: cameraSource/);
  assert.match(writer, /schemaVersion: 2/);
  assert.equal(spec.properties.cameraSource.type, 'string');
  assert.equal(spec.properties.schemaVersion.const, 2);
});

test('B1K emits JSON only after a non-empty iPhone MOV succeeds', () => {
  assert.match(camera, /lastCaptureManifestURL = try WivraCaptureManifest\.write\(/);
  assert.match(camera, /videoURL: url, tracks: \[\], mergedURL: nil,/);
  assert.match(camera, /cameraSource: "iphone-avfoundation"/);
  assert.match(camera, /lastCaptureManifestURL = nil\s+pendingMovieURL = url\s+movieOutput\.startRecording/);
  const finish = camera.split('private func finishVideo(url: URL, error: String?) {')[1]?.split('\n    func stop()')[0];
  assert.ok(finish, 'expected finalization function');
  assert.ok(finish.indexOf('lastCaptureManifestURL = try WivraCaptureManifest.write(') <
            finish.indexOf('isFinishing = false'),
            'source must not be released for handoff while JSON is being written');
  assert.match(finish, /lastMovieURL = url/);
  assert.match(finish, /catch \{\s+lastCaptureManifestURL = nil/);
  assert.match(finish, /closeAfterVideo/);
});

test('B1K does not invent an iPhone sidecar or claim native editor import', () => {
  assert.match(camera, /tracks \[\] means no/);
  assert.match(ui, /iphone_share_capture_manifest/);
  assert.match(ui, /El editor aún no importa automáticamente estas capturas/);
  assert.match(ui, /ShareLink\(item: manifest\)/);
});

test.todo('DEVICE: iPhone MOV with microphone confirmed via media inspection and JSON tracks=[]');
test.todo('DEVICE: interrupted recording still keeps usable MOV even if JSON write fails');
test.todo('E2E: import verified MOV plus .wivra.json into the unified editor without duplicate embedded audio');
