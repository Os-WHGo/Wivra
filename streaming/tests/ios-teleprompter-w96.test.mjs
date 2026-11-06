// W96 (Claude): iPhone camera teleprompter fed by the Director script; shown over the preview, never recorded.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('the script is sanitized (2200 chars, no control characters) and only travels with «capture»', () => {
  const o = read('streaming/ios/B0/Sources/WivraTeleprompterOverlay.swift');
  assert.match(o, /\$0 == "\\n" \|\| !CharacterSet\.controlCharacters\.contains\(\$0\)/);
  assert.match(o, /text\.count <= 2200/);
  const bridge = read('streaming/ios/B0/Sources/WivraEditorNativeBridge.swift');
  assert.match(bridge, /what == "live" \|\| what == "capture"/);
  assert.match(bridge, /if what == "capture", let script = WivraTeleprompterStore\.sanitized/);
  assert.doesNotMatch(bridge, /startRecording|case "live\.start"/);
});

test('shown as a SwiftUI overlay on the preview (AVFoundation records only the camera)', () => {
  const cam = read('streaming/ios/B0/Sources/WivraIPhoneCameraScreen.swift');
  assert.match(cam, /\.overlay\(alignment: \.top\) \{ WivraTeleprompterOverlay\(store: \.shared\) \}/);
  const o = read('streaming/ios/B0/Sources/WivraTeleprompterOverlay.swift');
  assert.doesNotMatch(o, /AVCapture|AVAssetWriter|CALayer/);
  assert.match(o, /ios\.tprompt\.not_recorded/);
});

test('the editor offers it only inside the iPhone app, for shots with text', () => {
  const t = read('app/template.html');
  assert.match(t, /if\(teleText&&window\.webkit&&window\.webkit\.messageHandlers&&window\.webkit\.messageHandlers\.wivraNative&&window\.WivraHost/);
  assert.match(t, /window\.WivraHost\.openNative\('capture',teleText\.slice\(0,2200\)\)/);
});
