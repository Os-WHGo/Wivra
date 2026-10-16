// Chat-first AI UX smoke check. Tests HTML contract and distinct offline/cloud dispatch;
// this does NOT claim real Safari/voice API/provider tests. — ChatGPT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const template = readFileSync(new URL('../template.html', import.meta.url), 'utf8');
const dist = readFileSync(new URL('../dist/agentcut.html', import.meta.url), 'utf8');
for (const [name, s] of [['template', template], ['bundle', dist]]) {
  test(`${name}: UI IA exposes chat, voice, connected settings and apply/reject`, () => {
    for (const id of ['sAI','aiLog','ask','aiMic','aiMode','aiAsk','aiSettings','aiProv','aiKey','aiProp','aiApply','aiDiscard']) {
      assert.ok(s.includes(`id="${id}"`), `Missing ${id}`);
    }
    const section=s.slice(s.indexOf('id="sAI"'),s.indexOf('id="sDirector"'));
    assert.match(section,/Básico · gratis y sin conexión/);
    assert.match(section,/IA conectada · opcional/);
    assert.ok(section.indexOf('id="ask"') < section.indexOf('id="aiSettings"'), 'User instruction appears before keys/provider');
    assert.ok(section.indexOf('id="aiAsk"') < section.indexOf('id="aiSettings"'), 'Primary action visible before settings');
  });
  test(`${name}: uses existing validated editor ops for local mode, explicit connected route`, () => {
    assert.match(s, /const local = localBasicCommand\(request, session\.project\)/);
    assert.match(s, /'local' \? \(\(\) => \{ const local = localBasicCommand/);
    assert.match(s, /: await askModel\(\{ base:/);
    assert.match(s, /const trial = planEdit\(session\.project, r\.ops, \{ ripple: false \}\)/);
    assert.match(s, /aiPending = \{ ops: r\.ops, revision: session\.project\.revision \}/);
  });
}
