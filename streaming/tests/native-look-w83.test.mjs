// W83 (Claude): mockup look for the native capture and LIVE screens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const r = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const A = '../android/app/src/';

test('Android: one Wivra button style; check boxes untouched; primary action highlighted', () => {
  const ui = r(A + 'main/java/com/oswhgo/wivra/WivraUi.kt');
  assert.match(ui, /if \(view is Button && view !is CompoundButton\) secondary\(view\)/);
  assert.doesNotMatch(ui, /setText\(|text = |setOnClickListener|isEnabled =/, 'looks only');
  for (const [f, primary] of [['full/java/com/oswhgo/wivra/WivraPhoneLiveActivity.kt', 'startButton'],
    ['full/java/com/oswhgo/wivra/WivraScreenLiveActivity.kt', 'startButton'],
    ['main/java/com/oswhgo/wivra/WivraPhoneCameraActivity.kt', 'recordingButton'],
    ['main/java/com/oswhgo/wivra/WivraDualCameraActivity.kt', 'recordButton']])
    assert.match(r(A + f), new RegExp('WivraUi\\.primary\\(' + primary + '\\)'), f);
});

test('iPhone LIVE: preview first, EN VIVO badge only when on air, gradient primary actions', () => {
  const live = r('../ios/B0/Sources/WivraIPhoneLiveScreen.swift');
  assert.ok(live.indexOf('MTHKViewRepresentable(previewSource: controller)') < live.indexOf('ios.plive.section_camera'));
  assert.match(live, /controller\.onAir \? "ios\.plive\.on_air_badge" : "ios\.plive\.preview_badge"/);
  assert.match(live, /Button\(wivraLiveText\("ios\.plive\.confirm_button"\)\)[\s\S]{0,200}\.buttonStyle\(WivraPrimaryButtonStyle\(\)\)/);
});

test('iPhone capture tabs: the shortcut bar sits on each tab, not over the TabView', () => {
  const app = r('../ios/B0/Sources/WivraMetaB0App.swift');
  assert.equal((app.match(/\.safeAreaInset\(edge: \.top\) \{ captureTopBar \}/g) || []).length, 2);
  assert.doesNotMatch(app, /\}\s*\n\s*\.safeAreaInset\(edge: \.top\) \{\s*\n\s*VStack/);
});
