// MU V4 (owner decision): the normal HTML carries the accelerated route, but INERT: Mediabunny is embedded
// compressed + pinned and is run only on explicit use; the default export engine stays MediaRecorder.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../app/dist/agentcut.html'),'utf8');
assert.doesNotMatch(html,/Wivra optional QA vendor: Mediabunny 1\.61\.6/);      // no eager vendor
assert.match(html,/<script type="text\/plain" id="mbEngine" data-notr data-version="1\.61\.6">/);
assert.doesNotMatch(html,/var Mediabunny=\(/);                                     // not run at startup
assert.match(html,/globalThis\.WivraAcceleratedQA = Object\.freeze\(api\)/);
assert.match(html,/M:await loadMediabunny\(\)/);
assert.match(html,/ACCELERATED_EXPORT_IMPLEMENTED\s*=\s*false/);
assert.match(html,/function recordProject\(/);
console.log('Normal Wivra HTML: accelerated route present but inert; MediaRecorder remains the default.');
