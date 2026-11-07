// W84 (Claude): the home «Plantillas» card opens the editor's existing templates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const tpl = readFileSync(new URL('../template.html', import.meta.url), 'utf8');

test('Plantillas card is enabled and routes to the templates of «Tus videos»', () => {
  assert.match(tpl, /<button class="hcard" id="hTemplates" type="button">/);
  assert.doesNotMatch(tpl, /<b>Plantillas<\/b><span>pronto<\/span>/);
  assert.match(tpl, /\$\('hTemplates'\)\.onclick = \(\) => \{ location\.hash = '#new-templates'; \}/);
  assert.match(tpl, /if \(h === '#new-templates'\) \{ renderVids\(\); \$\('tpBox'\)\.open = true; openSheet\('sVids'\);/);
});
