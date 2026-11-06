#!/usr/bin/env node
// W107 (Claude): checks the long-mode result written by long-driver.js. Exit 1 when it does not pass.
'use strict';
const fs = require('node:fs');
const [, , file, title] = process.argv;
let r; try { r = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.log(`not ok - ${title}: no result (${e.message})`); process.exit(1); }
console.log(`${title}: ${r.ok ? '' : 'FAILED ' + (r.error || '')}${r.duration ? r.duration.toFixed(0) + ' s project in ' + (r.ms / 1000).toFixed(0) + ' s, ' : ''}${r.run ? r.run.windows + ' windows, ' + r.run.silent + ' silent' : ''}`);
for (const t of r.texts || []) console.log(`  [${t.start.toFixed(1)}–${t.end.toFixed(1)}] ${t.text}`);
const hit = (r.texts || []).find((t) => /volc/i.test(t.text));
const checks = [[r.ok, 'run finished'], [r.native, 'native piece reader present'], [r.duration > 600, 'longer than the 10-minute single-decode limit'],
  [!r.askedAgain, 'the chooser permission was enough'], [!!hit && Math.abs(hit.start - 631) < 12, `«volcán» near 631 s${hit ? ` (at ${hit.start.toFixed(1)} s)` : ' (missing)'}`]];
for (const [good, what] of checks) console.log(`${good ? 'ok' : 'not ok'} - ${what}`);
process.exit(checks.every((c) => c[0]) ? 0 : 1);
