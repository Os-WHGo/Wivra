import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const swift=readFileSync(new URL('../ios/B0/Sources/WivraEmbeddedEditorScreen.swift',import.meta.url),'utf8');
const bridge=readFileSync(new URL('../ios/B0/Sources/WivraEditorNativeBridge.swift',import.meta.url),'utf8');
const app=readFileSync(new URL('../ios/B0/Sources/WivraMetaB0App.swift',import.meta.url),'utf8');
const spec=readFileSync(new URL('../ios/B0/project.yml',import.meta.url),'utf8');
const html=readFileSync(new URL('../../app/dist/agentcut.html',import.meta.url),'utf8');
const pack=readFileSync(new URL('../../app/packs/catalog.json',import.meta.url),'utf8');

test('native app ships Claude editor from original source without duplicate editor implementation',()=>{
 assert.match(app,/WivraEmbeddedEditorScreen/);
 assert.match(app,/showingUnifiedEditor/);
 assert.match(app,/isReleasedForCameraHandoff/);
 assert.match(spec,/path: \.\.\/\.\.\/\.\.\/app\/dist\/agentcut\.html/);
 assert.match(spec,/path: \.\.\/\.\.\/\.\.\/app\/packs/);
 assert.match(swift,/Bundle\.main\.url\(forResource: "agentcut", withExtension: "html"\)/);
 assert.match(swift,/loadFileURL\(html, allowingReadAccessTo:/);
 assert.match(html,/id="sAI"/);
 assert.equal(JSON.parse(pack).schema,'wivra-packs');
});
test('read-only bridge exposes safe metadata and explicitly denies paths, raw media and LIVE',()=>{
 assert.match(bridge,/case "host\.capabilities"/);
 assert.match(bridge,/case "library\.list"/);
 assert.match(bridge,/method = body\["method"\]/);
 assert.match(bridge,/message\.frameInfo\.isMainFrame/);
 assert.match(bridge,/message\.frameInfo\.request\.url\?\.isFileURL == true/);
 assert.match(bridge,/nativeMediaImport": "not_available"/);
 assert.match(bridge,/live": "not_verified"/);
 assert.match(bridge,/captureId/);
 assert.doesNotMatch(bridge,/replyHandler\(\s*\[\s*"filePath"/);
 assert.doesNotMatch(bridge,/case "live\.start"/);
 assert.match(swift,/url\.isFileURL \? \.allow : \.cancel/);
});
