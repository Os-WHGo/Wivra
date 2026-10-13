import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectProject,validateEdit,parseInstruction,suggestedWindows} from '../agent-core.mjs';
import {changeScore} from '../agent-vision.mjs';
const state={duration:22,start:0,end:22,text:'',keepAudio:true,resolution:720,width:1080,height:1920};
test('tool plan edits the project instead of mutating source bytes',()=>{
 const parsed=parseInstruction('Recorta desde 2 hasta 8 y pon texto "Vancouver"',state);
 assert.deepEqual(parsed.proposed,[{tool:'set_trim',start:2,end:8},{tool:'set_text',text:'Vancouver'}]);
 assert.equal(parsed.next.start,2);assert.equal(parsed.next.end,8);
 assert.equal(parsed.next.text,'Vancouver');assert.equal(state.start,0);
 assert.equal(parsed.requiresApproval,true);
});
test('basic commands for audio and rendering work',()=>{
 const p=parseInstruction('Quita el audio. Exporta a 480p',state);
 assert.equal(p.next.keepAudio,false);assert.equal(p.next.resolution,480);
});
test('cannot lie about video duration, use unapproved tools or arbitrary code',()=>{
 assert.throws(()=>parseInstruction('Corta de 18 a 99',state),RangeError);
 assert.throws(()=>validateEdit(state,[{tool:'media_upload',url:'https://example.com'}]),/no autorizada/);
 assert.throws(()=>validateEdit(state,[{tool:'set_text',text:'X'.repeat(121)}]),/120/);
});
test('unknown natural language asks for clarification instead of fake AI reasoning',()=>{
 assert.throws(()=>parseInstruction('Haz los mejores reels de las calles de Vancouver',state),/no comprende/);
});
test('clips suggested from frame differences remain experimentally labeled',()=>{
 const cuts=suggestedWindows([{time:10,delta:.8},{time:3,delta:.3},{time:18,delta:.4}],22);
 assert.equal(cuts.length,3);assert.equal(cuts[0].inspectedAt,10);
 assert.equal(cuts[0].confidence,'experimental_not_semantic');
 assert.ok(cuts.every(x=>x.start>=0&&x.end<=22));
});
test('pixel-difference metric deterministic and bounded',()=>{
 assert.equal(changeScore(new Uint8Array([0,255]),new Uint8Array([255,0])),1);
 assert.equal(changeScore(new Uint8Array([0,255]),new Uint8Array([0,255])),0);
});
test('duration required; provenance never inferred from export dimensions',()=>{
 assert.throws(()=>inspectProject({duration:0}),RangeError);
 const p=inspectProject(state);assert.equal(p.width,1080);assert.equal(p.height,1920);
 assert.equal(Object.hasOwn(p,'streetName'),false);
});
