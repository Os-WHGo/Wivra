// W82 (Claude): the app is called "Wivra" on both phones and has an original icon.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const r = p => readFileSync(new URL(p, import.meta.url));

test('iPhone: display name Wivra and an opaque 1024 px app icon', () => {
  assert.match(r('../ios/B0/Info.plist').toString(), /<key>CFBundleDisplayName<\/key><string>Wivra<\/string>/);
  assert.match(r('../ios/B0/project.yml').toString(), /ASSETCATALOG_COMPILER_APPICON_NAME: AppIcon/);
  const png = r('../ios/B0/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png');
  assert.equal(png.readUInt32BE(16), 1024); assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(png[25], 2, 'RGB without alpha (App Store rejects transparent icons)');
  assert.match(r('../ios/B0/Resources/Assets.xcassets/AppIcon.appiconset/Contents.json').toString(), /"size" : "1024x1024"/);
});

test('Android: label Wivra and an adaptive icon drawn from the W logo', () => {
  const m = r('../android/app/src/main/AndroidManifest.xml').toString();
  assert.match(m, /android:label="Wivra"\s+android:icon="@mipmap\/ic_launcher" android:roundIcon="@mipmap\/ic_launcher"/);
  const icon = r('../android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml').toString();
  assert.match(icon, /<foreground android:drawable="@drawable\/ic_launcher_foreground" \/>/);
  assert.match(r('../android/app/src/main/res/drawable/ic_launcher_foreground.xml').toString(), /M33,40 L42,70 L54,48 L66,70 L75,40/);
});
