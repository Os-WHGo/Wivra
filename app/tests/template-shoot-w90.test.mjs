// W90 (Claude): «Grabar para esta plantilla» — template slots become the Director's shot list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shootPlanFromTemplate, tplRawSeconds, TPL_CATALOG } from '../templates.mjs';
import { updateShot, progress } from '../../core/shoot-checklist.mjs';
import { loadI18n } from '../i18n-parse.mjs';

test('slot templates: one shot per slot, in order, asking for a little more than the slot keeps', () => {
  const b = shootPlanFromTemplate('burst');
  assert.equal(b.schema, 'agentcut-shoot-plan-v0.1'); assert.equal(b.templateId, 'burst'); assert.equal(b.shots.length, 6);
  assert.deepEqual(b.shots.map((s) => s.id), ['shot-1', 'shot-2', 'shot-3', 'shot-4', 'shot-5', 'shot-6']);
  assert.equal(b.shots[0].durationSeconds, tplRawSeconds(1.5)); assert.equal(b.shots[0].finalSeconds, 1.5);
  assert.match(b.shots[0].direction, /quedan 1,5 s: graba unos 4 s/);
  const ba = shootPlanFromTemplate('beforeafter'); assert.match(ba.shots[0].direction, /^«Antes»/); assert.match(ba.shots[1].direction, /^«Después»/);
  const t3 = shootPlanFromTemplate('top3'); assert.match(t3.shots[2].direction, /^«N\.º 1»/);
  assert.equal(shootPlanFromTemplate('screenface').shots.length, 2); assert.equal(shootPlanFromTemplate('collage').shots.length, 3);
  for (const id of ['reel', 'story', 'square', 'wide', 'memory', 'nope']) assert.equal(shootPlanFromTemplate(id), null, id);
});

test('the Director can use the generated list (mark shots, progress)', () => {
  let p = shootPlanFromTemplate('top3');
  p = updateShot(p, 'shot-1', { state: 'done' }); p = updateShot(p, 'shot-2', { state: 'skipped' });
  const pr = progress(p); assert.equal(pr.done, 1); assert.equal(pr.total, 3);
});

test('every text of the guide and its buttons exists in the 7 other languages', () => {
  const data = loadI18n(), keys = new Set();
  const tr = (k) => { keys.add(k); return k; };
  for (const t of TPL_CATALOG) shootPlanFromTemplate(t.id, tr);
  const tpl = readFileSync(new URL('../template.html', import.meta.url), 'utf8');
  for (const m of tpl.slice(tpl.indexOf("$('tpShoot').onclick"), tpl.indexOf("$('tpList').addEventListener")).matchAll(/aiT\('((?:[^'\\]|\\.)+)'/g)) keys.add(m[1]);
  for (const k of ['Para la plantilla «{1}»: graba en este orden.', 'Aplicar la plantilla «{1}»', '🎬 Grabar para esta plantilla']) keys.add(k);
  for (const lang of ['en', 'pt', 'fr', 'de', 'ja', 'zh', 'it']) for (const k of keys) assert.ok(data[lang][k], `${lang}: ${k}`);
});

test('every template name, description and label is translated (W84 gap closed)', () => {
  const data = loadI18n();
  for (const t of TPL_CATALOG) for (const k of [t.name, t.desc, ...(t.labels || [])])
    for (const lang of ['en', 'pt', 'fr', 'de', 'ja', 'zh', 'it']) assert.ok(data[lang][k], `${lang}: ${k}`);
});
