import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text = p => readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const native=text('streaming/android/app/src/main/java/com/oswhgo/wivra/MainActivity.java');
const html=text('app/template.html');
const core=text('core/shoot-checklist.mjs');
const build=text('app/build.mjs');

test('a single Ray-Ban recording can be represented by ordered multiple real assets',()=>{
 assert.match(core,/assetIds/);
 assert.match(core,/ids\.length>40/);
 assert.match(core,/new Set\(ids\)\.size!==ids\.length/);
 assert.match(core,/next\.assetId=changes\.assetIds\?\.\[0\]/);
 assert.match(html,/id="directorParts"[^>]*multiple/);
 assert.match(html,/validateRayBanParts\(selected\)/);
 assert.match(html,/added\.length!==group\.files\.length/);
 assert.match(html,/assetIds:added\.map\(a=>a\.id\)/);
 assert.match(html,/restoreDirectorAssetLinks\(s,known,availableIds\)/);
 assert.match(html,/Object\.entries\(saved\.blobs\|\|\{\}\)/);
 assert.match(build,/'\.\/director-parts\.mjs'/);
});

test('Ray-Ban published multi-part suggestion rejects mixed sessions and missing part numbers',()=>{
 assert.match(native,/uniqueNewRayBanParts\(java\.util\.Set<String> before\)/);
 assert.match(native,/added\.size\(\) < 2 \|\| added\.size\(\) >= 12/);
 assert.match(native,/String sessionId = null/);
 assert.match(native,/sessionId\.equals\(match\.group\(1\)\)/);
 assert.match(native,/for \(int actual : ordered\.keySet\(\)\) if \(actual != expected\+\+\) return null/);
 assert.match(native,/suggestedDirectorParts = grouped/);
 assert.match(native,/offerSavedRayBanParts\(params, callback/);
 assert.match(native,/params\.getMode\(\) != WebChromeClient\.FileChooserParams\.MODE_OPEN_MULTIPLE/);
 assert.match(native,/java\.util\.Arrays\.equals\(candidates, suggestedDirectorParts\)/);
 assert.match(native,/callback\.onReceiveValue\(candidates\)/);
 assert.match(native,/else launchSystemPicker\(params\)/);
 assert.doesNotMatch(native,/addJavascriptInterface\(/);
});

test('partial Ray-Ban metadata failure rolls back staged batch before timeline insertion',()=>{
 assert.match(html,/async function importSelectedFiles\(files\)/);
 assert.match(html,/const requireAll = files === directorMultipartBatch/);
 assert.match(html,/if \(requireAll && \(failed\.length \|\| added\.length!==files\.length\)\)/);
 assert.match(html,/directorMultipartBatch=group\.files/);
 assert.match(html,/await importSelectedFiles\(group\.files\)/);
 assert.match(html,/finally \{\s*cleanupUncommitted\(\);\s*loading = false/);
});
