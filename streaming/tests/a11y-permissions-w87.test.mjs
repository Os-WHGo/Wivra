// W87 (Claude): screen-reader cues on ChatGPT's LIVE screens + permissions step in the welcome.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const r = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('Android LIVE screens: heading, live status and a described preview', () => {
  const phone = r('../android/app/src/full/java/com/oswhgo/wivra/WivraPhoneLiveActivity.kt');
  assert.match(phone, /text = getString\(R\.string\.plive_heading\)[\s\S]{0,80}isAccessibilityHeading = true/);
  assert.match(phone, /text = getString\(R\.string\.plive_idle\)[\s\S]{0,200}ACCESSIBILITY_LIVE_REGION_POLITE/);
  assert.match(phone, /SurfaceView\(this\)\.apply \{ contentDescription = getString\(R\.string\.plive_preview_description\) \}/);
  assert.match(r('../android/app/src/full/java/com/oswhgo/wivra/WivraScreenLiveActivity.kt'), /slive_heading\)[\s\S]{0,80}isAccessibilityHeading = true/);
});

test('iPhone LIVE announces every status change to VoiceOver', () => {
  assert.match(r('../ios/B0/Sources/WivraIPhoneLiveScreen.swift'), /\.onChange\(of: controller\.status\) \{ _, text in\s+UIAccessibility\.post\(notification: \.announcement, argument: text\)/);
});

test('welcome explains each permission before the phone asks', () => {
  const tpl = r('../../app/template.html');
  for (const t of ['Permisos, solo cuando los uses', 'Cámara y micrófono', 'Fotos o Galería', 'Pantalla (Android)', 'Gafas Ray-Ban Meta']) assert.ok(tpl.includes(t), t);
  assert.match(tpl, /<div class="odots" aria-hidden="true">(<b[^>]*><\/b>){4}<\/div>/);
});
