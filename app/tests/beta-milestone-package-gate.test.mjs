import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = path => readFileSync(new URL('../../.github/workflows/'+path, import.meta.url), 'utf8');
const beta=workflow('wivra-complete-beta-assembly.yml');
const android=workflow('unified-android-build.yml');
const ios=workflow('meta-b0-native-build.yml');

test('beta PRs still run integration contracts, but installers need explicit milestone label',()=>{
  assert.match(beta,/  pull_request:\s+types: \[opened, synchronize, reopened, labeled\]/);
  assert.match(beta,/  workflow_dispatch:/);
  assert.match(beta,/  integrated-contracts:[\s\S]*?node --test app\/tests\/\*\.test\.mjs/);
  for (const job of ['android-beta','ios-beta']) {
    const start=beta.indexOf('  '+job+':');
    assert.ok(start>0, 'missing job '+job);
    const part=beta.slice(start,start+450);
    assert.match(part,/if: \$\{\{ github\.event_name == 'workflow_dispatch' \|\| \(github\.event\.action == 'labeled' && github\.event\.label\.name == 'wivra-package-beta'\) \}\}/);
  }
  assert.match(beta,/android-media-emulator:[\s\S]*?needs: android-beta/);
  assert.match(beta,/Package UNSIGNED IPA/);
  assert.match(beta,/assembleFullDebug/);
  assert.match(beta,/wivra-package-beta/);
});

test('normal Android source workflow compiles both variants, no APK/installation artifact',()=>{
  assert.match(android,/pull_request:[\s\S]*?'streaming\/android\/\*\*'/);
  assert.doesNotMatch(android,/^\s+- 'app\/\*\*'/m);
  assert.doesNotMatch(android,/^\s+- 'core\/\*\*'/m);
  for(const task of ['compileFullDebugKotlin','compileCaptureDebugKotlin',
    'compileFullDebugJavaWithJavac','compileCaptureDebugJavaWithJavac',
    'testFullDebugUnitTest','testCaptureDebugUnitTest'])
    assert.match(android,new RegExp(task));
  assert.doesNotMatch(android,/:app:assemble(?:Full|Capture)Debug/);
  assert.doesNotMatch(android,/actions\/upload-artifact/);
  assert.doesNotMatch(android,/adb install/);
});

test('normal iOS source workflow validates simulator and arm64, no IPA archive',()=>{
  assert.match(ios,/pull_request:[\s\S]*?'streaming\/ios\/B0\/\*\*'/);
  assert.doesNotMatch(ios,/^\s+- 'app\/\*\*'/m);
  assert.doesNotMatch(ios,/^\s+- 'core\/\*\*'/m);
  assert.match(ios,/-sdk iphonesimulator/);
  assert.match(ios,/-sdk iphoneos/);
  assert.match(ios,/CODE_SIGNING_ALLOWED=NO/);
  assert.doesNotMatch(ios,/zip -qr .*\.ipa/);
  assert.doesNotMatch(ios,/actions\/upload-artifact/);
});
