// Separate guarantee: normal production HTML must not ship the QA sidecar.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../app/dist/agentcut.html'),'utf8');
assert.doesNotMatch(html,/Wivra optional QA vendor: Mediabunny 1\.61\.6/);
assert.doesNotMatch(html,/globalThis\.WivraAcceleratedQA\s*=/);
assert.doesNotMatch(html,/const qaPipeline =/);
assert.match(html,/ACCELERATED_EXPORT_IMPLEMENTED\s*=\s*false/);
assert.match(html,/function recordProject\(/);
console.log('Normal Wivra HTML excludes accelerated QA vendor and native multipista sidecar.');
