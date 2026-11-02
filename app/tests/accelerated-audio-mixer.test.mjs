import test from 'node:test';
import assert from 'node:assert/strict';
import {mixAcceleratedAudioBlocks as mix} from '../accelerated-audio-mixer.mjs';

class PCM {
  constructor({length,sampleRate,numberOfChannels}){
    this.length=length;this.sampleRate=sampleRate;
    this.numberOfChannels=numberOfChannels;
    this.channels=Array.from({length:numberOfChannels},()=>new Float32Array(length));
  }
  getChannelData(i){return this.channels[i];}
}
function lane({start=0,sourceIn=0,sourceOut=1,speed=1,volume=1,
   signal=()=>.5,rate=8000,muted=false,channels=1}={}) {
  const data=new PCM({length:Math.ceil(rate*5),sampleRate:rate,
    numberOfChannels:channels});
  for(let ch=0;ch<channels;ch++)
    for(let i=0;i<data.length;i++)data.channels[ch][i]=signal(i/rate,ch);
  return {
    clip:{id:'test',asset_id:'mic',start,in:sourceIn,out:sourceOut,speed,volume,muted},
    async *buffers(a,b){
      const from=Math.max(0,Math.floor(a*rate)),
        to=Math.min(data.length,Math.ceil(b*rate));
      if(to<=from)return;
      const part=new PCM({length:to-from,sampleRate:rate,numberOfChannels:channels});
      for(let c=0;c<channels;c++)
        part.channels[c].set(data.channels[c].subarray(from,to));
      yield {timestamp:from/rate,duration:part.length/rate,buffer:part};
    }
  };
}
async function collect(args){
  const blocks=[];for await(const b of mix({AudioBufferClass:PCM,sampleRate:8000,
    blockFrames:800,...args}))blocks.push(b);
  return blocks;
}
const near=(a,b,eps=.0001)=>assert.ok(Math.abs(a-b)<=eps,
  'Expected '+a+' approximately '+b);

test('independent voice is silent before offset, then sampled at exact timeline time',async()=>{
  const blocks=await collect({totalSeconds:1,tracks:[
    lane({start:.12,sourceIn:.2,sourceOut:1.08,signal:t=>t<.2?0:.6})
  ]});
  assert.equal(blocks.length,10);
  for(const b of blocks){
    for(let i=0;i<b.frames;i++){
      const t=b.startSeconds+i/8000;
      near(b.buffer.channels[0][i],t>=.12?.6:0);
      near(b.buffer.channels[1][i],t>=.12?.6:0);
    }
  }
});

test('mixes two offset audio lanes without moving source time to 0',async()=>{
  const blocks=await collect({totalSeconds:.5,tracks:[
    lane({sourceOut:.5,signal:()=>.25}),
    lane({start:.2,sourceIn:1,sourceOut:1.3,signal:()=>.5,volume:1.4})
  ]});
  const sample=t=>{
    const ix=Math.floor(t*8000),block=Math.floor(ix/800);
    return blocks[block].buffer.channels[0][ix%800];
  };
  near(sample(.1),.25);
  near(sample(.22),.95);
  near(sample(.49),.95);
  assert.equal(blocks[0].mixedTracks,1);
  assert.equal(blocks[2].mixedTracks,2);
});

test('speed maps timeline time back into source samples with interpolation',async()=>{
  const blocks=await collect({totalSeconds:.5,tracks:[
    lane({sourceIn:1,sourceOut:2,speed:2,signal:t=>t/5})
  ]});
  near(blocks[0].buffer.channels[0][0],.2);
  near(blocks[2].buffer.channels[0][400],(1+.25*2)/5,.0002);
  near(blocks[4].buffer.channels[0][799],(1+(3999/8000)*2)/5,.0002);
});

test('mutes disabled lanes, adds silence windows, preserves stereo and clamps peaks',async()=>{
  const blocks=await collect({totalSeconds:.4,tracks:[
    lane({sourceOut:.4,signal:(t,ch)=>ch===0?.4:-.2,channels:2,volume:2}),
    lane({sourceOut:.4,signal:()=>.6,volume:1.5}),
    lane({sourceOut:.4,muted:true,signal:()=>.7})
  ]});
  near(blocks[0].buffer.channels[0][20],1);
  near(blocks[0].buffer.channels[1][20],.5);
  assert.ok(blocks.every(b=>b.mixedTracks===2));
});

test('active but missing decoded microphone samples must fail rather than mute video',async()=>{
  const broken={clip:{start:0,in:0,out:1,volume:1},
    async *buffers(){}};
  await assert.rejects(collect({totalSeconds:1,tracks:[broken]}),/decoded no samples/);
});
test('audio buffers with a missing middle reject rather than time-stretch',async()=>{
  const corrupted={clip:{start:0,in:0,out:.4,volume:1},
    async *buffers(){
      const part=new PCM({length:400,sampleRate:8000,numberOfChannels:1});
      part.channels[0].fill(.5);
      yield {timestamp:0,duration:.05,buffer:part};
    }};
  await assert.rejects(collect({totalSeconds:.4,tracks:[corrupted]}),/shorter than/);
});
test('cancellation is checked at block boundaries and during long mixes',async()=>{
  let called=0;
  await assert.rejects(collect({totalSeconds:.5,
    isCancelled:()=>++called>2,tracks:[lane({sourceOut:.5})]}),/cancelled/);
});
test('rejects unsafe track counts, sample rates and output memory bounds',async()=>{
  await assert.rejects(collect({totalSeconds:1,tracks:Array.from({length:33},()=>lane())}),/limits/);
  await assert.rejects(collect({totalSeconds:1,sampleRate:100000,tracks:[]}),/limits/);
  await assert.rejects(collect({totalSeconds:1,blockFrames:5,tracks:[]}),/limits/);
});

test('surround center-channel dialogue cannot silently disappear in a stereo mix',async()=>{
  const surround=lane({sourceOut:.3,channels:6,
    signal:(_t,ch)=>ch===2?.8:0});
  await assert.rejects(collect({
    totalSeconds:.3,tracks:[surround]
  }),/Surround input requires a validated multichannel downmix/);
});
