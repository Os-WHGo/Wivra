import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../ios/B0/Resources/', import.meta.url));
const languages = ['es','en','fr','de','it','ja'];
function dictionary(lang) {
  const src = readFileSync(join(root, lang + '.lproj', 'Localizable.strings'), 'utf8');
  const entries = [...src.matchAll(/^"([^"]+)" = "((?:[^"\\]|\\.)*)";$/gm)];
  const map = new Map(entries.map(m => [m[1],m[2]]));
  assert.equal(entries.length,map.size,lang + ' has no duplicate keys');
  return map;
}
test('All six iOS localizations carry identical non-empty native keys and placeholders', () => {
  const baseline = dictionary('es');
  assert.ok(baseline.size >= 24);
  const args = s => (s.match(/%(?:[1-9]\$)?[ds@]/g) || []).sort().join(',');
  for (const lang of languages.slice(1)) {
    const translated = dictionary(lang);
    assert.deepEqual([...translated.keys()].sort(), [...baseline.keys()].sort(),lang + ' missing native keys');
    for (const [key,value] of translated) {
      assert.ok(value.trim(),lang + ' empty: ' + key);
      assert.equal(args(value),args(baseline.get(key)),lang + ' invalid placeholders: ' + key);
    }
  }
});
test('Native iOS screens use localized resources without changing Claude editor',()=>{
  const ios = fileURLToPath(new URL('../ios/B0/Sources/', import.meta.url));
  const swiftPaths = ['WivraEmbeddedEditorScreen.swift','WivraNativeCaptureLibrary.swift','WivraMetaB0App.swift','WivraPhoneNetworkStatus.swift'];
  const code = swiftPaths.map(f=>readFileSync(join(ios,f),'utf8')).join('\n');
  const declared = dictionary('es');
  const refs = new Set([...code.matchAll(/ios\.(?:picker|editor|app|library|record|network)\.[a-z_]+/g)].map(m=>m[0]));
  assert.equal(refs.size,declared.size);
  for(const key of refs) assert.ok(declared.has(key),'missing locale key: '+key);
  assert.match(code,/NSLocalizedString\("ios\.picker\.title"/);
  assert.match(code,/NSLocalizedString\("ios\.library\.day"/);
  const spec = readFileSync(new URL('../ios/B0/project.yml',import.meta.url),'utf8');
  assert.match(spec,/- path: Resources\s+buildPhase: resources/);
  assert.match(code,/Bundle\.main\.url\(forResource: "agentcut", withExtension: "html"\)/);
});
