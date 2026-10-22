// The generated editor is checked into GitHub by a dedicated audit action.
// Native/build checks run in parallel, so they MUST generate the bundle from
// the exact commit being tested rather than depend on the audit action's push.
// These checks prevent stale-editor APKs/IPAs and spurious red beta pipelines.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = (name) => readFileSync(new URL('../../.github/workflows/' + name, import.meta.url),'utf8');
const beta = workflow('wivra-complete-beta-assembly.yml');
const section = (start, end) => {
  const a = beta.indexOf('\n  ' + start + ':');
  const b = end ? beta.indexOf('\n  ' + end + ':', a + 1) : beta.length;
  assert.ok(a > -1, start + ' job must exist');
  if(end) assert.ok(b > a, end + ' job must follow ' + start);
  return beta.slice(a, b);
};

test('beta native jobs package source-generated editor independently, not a stale HTML asset',()=>{
  const contracts = section('integrated-contracts','android-beta');
  const android = section('android-beta','ios-beta');
  const ios = section('ios-beta','android-media-emulator');
  for(const [name,s] of [['contracts',contracts],['android',android],['ios',ios]]) {
    assert.match(s,/node app\/build\.mjs/,name);
    assert.match(s,/test -s app\/dist\/agentcut\.html/,name);
    assert.doesNotMatch(s,/git diff --exit-code -- app\/dist\/agentcut\.html/,name);
  }
  assert.match(android,/gradle -p streaming\/android :app:assembleDebug/, 'real Android APK build');
  assert.match(ios,/xcodebuild -project WivraMetaB0\.xcodeproj/, 'real iOS IPA build');
});

test('standalone iOS, Android and chat/director jobs rebuild from the tested source',()=>{
  for(const name of ['meta-b0-native-build.yml','unified-android-build.yml',
    'chat-first-ui-test.yml','in-app-director-tests.yml']){
    const s=workflow(name);
    assert.match(s,/node app\/build\.mjs/,name);
    assert.doesNotMatch(s,/git diff --exit-code -- app\/dist\/agentcut\.html/,name);
  }
});

test('Creative Director and Local Visual Evidence validate fresh HTML without a parallel audit race',()=>{
  for (const name of ['creative-director-tests.yml','local-visual-evidence-tests.yml']) {
    const s=workflow(name);
    assert.match(s,/node app\/build\.mjs/,name);
    assert.match(s,/test -s app\/dist\/agentcut\.html/,name);
    assert.doesNotMatch(s,/git diff --exit-code -- app\/dist\/agentcut\.html/,name);
  }
});

test('the single writer audit still commits deterministic generated HTML to branch',()=>{
  const s=workflow('wivra-audit-rebuild-editor.yml');
  assert.match(s,/node app\/build\.mjs/);
  assert.match(s,/git diff --quiet -- app\/dist\/agentcut\.html/);
  assert.match(s,/git add -- app\/dist\/agentcut\.html/);
  assert.match(s,/git push origin HEAD:refs\/heads\/chatgpt\/wivra-unified-owner-20261016/);
});

test('App Tests consume a freshly generated HTML artifact before checking UI contracts',()=>{
  const s=workflow('app-tests.yml');
  const build=s.indexOf('node app/build.mjs'),tests=s.indexOf('node --test app/tests/*.test.mjs');
  assert.ok(build>=0&&tests>build);
});
