import test from 'node:test';
import assert from 'node:assert/strict';
import {addMarker,makeProject,suggestHighlights} from '../irl-project.mjs';
test('markers preserve exact recording timecodes',()=>{
 const m=addMarker([],18.125,'buen momento',60);
 assert.deepEqual(m,[{id:'m1',second:18.125,label:'buen momento'}]);
});
test('only authorized markers and duration make candidate windows',()=>{
 const result=suggestHighlights([{id:'m1',second:2,label:'inicio'},{id:'m2',second:40,label:'final'}],50);
 assert.deepEqual(result.map(x=>[x.startSeconds,x.endSeconds]),[[0,14],[33,50]]);
 assert.equal(result[0].provenance,'manual_markers_only');
});
test('adjacent moments merge to avoid duplicate reels',()=>{
 const a=suggestHighlights([{id:'m1',second:10,label:'A'},{id:'m2',second:14,label:'B'}],60);
 assert.equal(a.length,1);assert.deepEqual(a[0].markerIds,['m1','m2']);
});
test('duration validation prevents impossible clips',()=>{
 assert.throws(()=>suggestHighlights([],0),RangeError);
 assert.throws(()=>addMarker([],6,'x',5),RangeError);
});
test('project references original but never embeds it',()=>{
 const project=makeProject({sourceType:'imported_local',filename:'clip.mp4',durationSeconds:90,mimeType:'video/mp4',markers:[{id:'m1',second:30,label:'momento'}]});
 assert.equal(project.uploaded,false);assert.equal(project.publication,false);
 assert.equal(project.analysisStatus,'manual_marker_candidates_not_ai');
 assert.equal(project.suggestions.length,1);
 assert.ok(!JSON.stringify(project).includes('data:video'));
});
