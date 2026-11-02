import test from 'node:test';
import assert from 'node:assert/strict';
import {mixAcceleratedAudioBlocks as mix,
 ACCELERATED_AUDIO_MAX_BUFFER_SECONDS,
 ACCELERATED_AUDIO_MAX_DECODED_WINDOW_BYTES} from '../accelerated-audio-mixer.mjs';

class PCM {
 constructor({length,sampleRate,numberOfChannels}) {
  this.length=length;this.sampleRate=sampleRate;
  this.numberOfChannels=numberOfChannels;
  this.data=Array.from({length:numberOfChannels},()=>new Float32Array(length));
 }
 getChannelData(i){return this.data[i];}
}
async function consume(tracks) {
 for await (const block of mix({tracks,totalSeconds:.1,sampleRate:8000,
  blockFrames:800,AudioBufferClass:PCM})) void block;
}
const clip=()=>({start:0,in:0,out:.1,volume:1});

test('decoder refuses excessive individual PCM allocations before mixing a single sample',async()=>{
 assert.equal(ACCELERATED_AUDIO_MAX_BUFFER_SECONDS,4);
 const source=new PCM({length:40001,sampleRate:8000,numberOfChannels:2});
 const lane={clip:clip(),async *buffers(){yield {timestamp:0,buffer:source};}};
 await assert.rejects(consume([lane]),/buffer exceeds safe window/);
});

test('decoder refuses aggregate PCM volume across otherwise valid independent tracks',async()=>{
 assert.equal(ACCELERATED_AUDIO_MAX_DECODED_WINDOW_BYTES,16*1024*1024);
 const source=new PCM({length:96000*3,sampleRate:96000,numberOfChannels:2});
 source.getChannelData(0).fill(.05);
 source.getChannelData(1).fill(.05);
 const tracks=Array.from({length:8},()=>({
  clip:clip(),
  async *buffers(){yield {timestamp:0,buffer:source};}
 }));
 await assert.rejects(consume(tracks),/window exceeds memory budget/);
});

test('window-local ducking preserves music whenever narration is far outside the output block',async()=>{
 const music=new PCM({length:800,sampleRate:8000,numberOfChannels:1});
 music.getChannelData(0).fill(.4);
 const lane={clip:clip(),async *buffers(){yield {timestamp:0,buffer:music};}};
 const remote=Array.from({length:30},(_,i)=>({
  clip:{start:1+i,in:0,out:.1,role:'voice_primary',ducking:1,volume:1},
  async *buffers(){throw Error('Remote voice must not decode');}
 }));
 const output=[];
 for await (const block of mix({tracks:[lane,...remote],totalSeconds:.1,
  sampleRate:8000,blockFrames:800,AudioBufferClass:PCM}))
  output.push(block.buffer.getChannelData(0)[400]);
 assert.equal(output.length,1);
 assert.ok(Math.abs(output[0]-.4)<1e-5);
});
