// Animated GIFs in the accelerated multitrack renderer use the editor's decoded
// frames and the same frame selection as the stable exporter (gifFrameAt of
// source time), with one canvas per simultaneous layer. — Claude
import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAcceleratedMultitrack,renderAcceleratedMultitrack,validDecodedGif}
 from '../accelerated-multitrack-renderer.mjs';
import {gifFrameAt} from '../gif.mjs';

const w=4,h=2;
const frame=(tag)=>{const rgba=new Uint8ClampedArray(w*h*4);rgba.tag=tag;return rgba;};
// 0.1 s red, 0.2 s green, 0.1 s blue: loops every 0.4 s.
const gif={w,h,frames:[{delay:.1,rgba:frame('R')},{delay:.2,rgba:frame('G')},{delay:.1,rgba:frame('B')}]};

function environment(){
 const drawn=[];
 const created=[];
 globalThis.ImageData=class{constructor(data,width,height){this.data=data;this.width=width;this.height=height;}};
 globalThis.document={createElement:()=>{
  const canvas={width:0,height:0,shown:null};
  canvas.getContext=()=>({
   putImageData(img){canvas.shown=img.data.tag;},
   fillRect(){},save(){},restore(){},translate(){},scale(){},rotate(){},beginPath(){},
   closePath(){},clip(){},arc(){},rect(){},moveTo(){},lineTo(){},ellipse(){},fill(){},stroke(){},
   quadraticCurveTo(){},bezierCurveTo(){},roundRect(){},
   drawImage(el){drawn.push(el.shown??'video');},
   set fillStyle(v){},set globalAlpha(v){},set strokeStyle(v){},set lineWidth(v){},
   set filter(v){},set globalCompositeOperation(v){}
  });
  created.push(canvas);return canvas;
 }};
 return {drawn,created};
}
const M=()=>({
 Input:class{},UrlSource:class{},CanvasSink:class{},AudioBufferSink:class{},
 Mp4OutputFormat:class{},WebMOutputFormat:class{},
 StreamTarget:class{constructor(stream){this.stream=stream;}},
 CanvasSource:class{
  constructor(canvas,options={}){this.canvas=canvas;this.options=options;this.fps=30;}
  async add(){this.options.onEncoderConfig?.({codec:this.options.fullCodecString,
   width:this.canvas.width,height:this.canvas.height,framerate:this.fps,
   bitrate:this.options.bitrate,avc:{format:'avc'}});}
 },
 Output:class{
  constructor({target}){this.target=target;}
  addVideoTrack(source,{frameRate}={}){source.fps=frameRate??30;}
  async start(){}
  async finalize(){const writer=this.target.stream.getWriter();
   await writer.write({position:0,data:new Uint8Array([1,2,3])});writer.releaseLock();}
 },
 getFirstEncodableVideoCodec:async()=> 'avc',canEncodeAudio:async()=>true
});

test('decoded GIF validation follows decodeGif output and rejects partial data',()=>{
 assert.equal(validDecodedGif(gif),true);
 assert.equal(validDecodedGif(null),false);
 assert.equal(validDecodedGif({...gif,frames:[]}),false);
 assert.equal(validDecodedGif({...gif,w:0}),false);
 assert.equal(validDecodedGif({...gif,frames:[{delay:.1,rgba:new Uint8ClampedArray(3)}]}),false);
 assert.equal(validDecodedGif({...gif,frames:[{delay:0,rgba:frame('x')}]}),false);
 assert.equal(validDecodedGif({...gif,frames:[{delay:NaN,rgba:frame('x')}]}),false);
});

test('main-line GIF and an offset GIF overlay show the frame for their own source time',async()=>{
 const oldDoc=globalThis.document,oldImage=globalThis.ImageData;
 const {drawn}=environment();
 const project={clips:[{id:'main',asset_id:'g',start:0,in:0,out:.8}],
  overlayClips:[{id:'sticker',asset_id:'g',start:0,in:.1,out:.9,track:1,x:.7,y:.3,scale:.3}],
  audioClips:[],texts:[],format:{aspect:'original'}};
 const media={g:{kind:'image',url:'blob:gif',w,h,gif,mime:'image/gif'}};
 try{
  const prepared=await prepareAcceleratedMultitrack({project,media,M:M(),expectedAudio:false,
   imageFactory:async()=>{throw Error('a GIF must not be decoded as a still image');}});
  const fps=20;
  const result=await renderAcceleratedMultitrack({prepared,fps,writeAt:async(_p,d)=>d.length});
  assert.equal(result.videoFrames,16);
  const expected=[];
  for(let k=0;k<16;k++){
   const t=k/fps;
   expected.push(['R','G','B'][gifFrameAt(gif,t)],['R','G','B'][gifFrameAt(gif,.1+t)]);
  }
  // Each output frame draws the main picture, then the overlay.
  const gifDraws=drawn.filter(x=>x!=='video'&&x!=null);
  assert.deepEqual(gifDraws,expected);
  assert.ok(new Set(gifDraws).size===3,'all three GIF frames appear');
 }finally{globalThis.document=oldDoc;globalThis.ImageData=oldImage;}
});

test('GIF-looking media without decoded frames is still rejected, never exported as a still',async()=>{
 const project={clips:[{id:'main',asset_id:'g',start:0,in:0,out:.5}],overlayClips:[],
  audioClips:[],texts:[],format:{aspect:'original'}};
 for(const g of [{kind:'image',url:'u',w,h,mime:'image/gif'},
   {kind:'image',url:'u',w,h,animated:true},
   {kind:'image',url:'u',w,h,gif:{...gif,frames:[]}}])
  await assert.rejects(prepareAcceleratedMultitrack({project,media:{g},M:M(),expectedAudio:false}),
   /animated GIF source requires frame-accurate decoder/);
});
