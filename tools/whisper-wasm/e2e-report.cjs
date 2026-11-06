#!/usr/bin/env node
// W86 (Claude): print the e2e driver result (JSON file) for a person and exit 1 unless it passed.
// Usage: node e2e-report.cjs <result.json> <label> [require: consent,cancel]
'use strict';
const fs = require('node:fs');
const [, , file, label, needs = ''] = process.argv;
let r; try { r = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.log(`not ok - ${label}: no result (${e.message})`); process.exit(1); }
const need = needs.split(',').filter(Boolean), get = (n) => (r.steps || []).find((s) => s.name === n);
const checks = [[r.ok === true, 'recognized with network blocked, words found, no overlaps']];
if (need.includes('consent')) checks.push([!!(get('download-end') && get('download-end').consentAsked && get('download-end').saved), 'consent asked, pack downloaded, verified and saved']);
if (need.includes('cancel')) checks.push([!!(get('cancel') && get('cancel').textsAdded === 0 && get('cancel').workerGone), 'cancel added nothing and stopped the engine']);
console.log(`${label} — ${r.ua || ''}`);
if (r.error) console.log('  error: ' + r.error.split('\n')[0]);
for (const s of r.steps || []) { const { name, texts, ...rest } = s; console.log(`  ${name} ${JSON.stringify(rest)}`); for (const t of texts || []) console.log(`    [${t.start.toFixed(2)}–${t.end.toFixed(2)}] ${t.text}`); }
if (!r.ok) console.log('  last messages: ' + JSON.stringify((r.says || []).slice(-4)));
for (const [good, what] of checks) console.log(`${good ? 'ok' : 'not ok'} - ${label}: ${what}`);
process.exit(checks.every((c) => c[0]) ? 0 : 1);
