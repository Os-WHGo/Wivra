import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareAcceleratedMultitrack,renderAcceleratedMultitrack} from '../accelerated-multitrack-renderer.mjs';

test('main photo is drawn on every output frame without video decoding', async () => {
  const draws=[], stamps=[];
  const old=globalThis.document;
  globalThis.document={createElement:()=>({
    getContext:()=>({
      fillRect(){},save(){},restore(){},
      drawImage(){draws.push(true);},
      set fillStyle(v){},set globalAlpha(v){}
    })
  })};
  const M={
    Input:class{},UrlSource:class{},CanvasSink:class{},AudioBufferSink:class{},
    Mp4OutputFormat:class{},WebMOutputFormat:class{},
    StreamTarget:class{constructor(stream){this.stream=stream;}},
    // Emulates Mediabunny's encoder receipt: the native gate requires the
    // active encoder configuration, not merely a registered callback.
    CanvasSource:class{
      constructor(canvas,options={}){this.canvas=canvas;this.options=options;this.fps=30;}
      async add(t,d){
        this.options.onEncoderConfig?.({codec:this.options.fullCodecString,
          width:this.canvas.width,height:this.canvas.height,
          framerate:this.fps,bitrate:this.options.bitrate,avc:{format:'avc'}});
        stamps.push([t,d]);
      }
    },
    Output:class{
      constructor({target}){this.target=target;}
      addVideoTrack(source,{frameRate}={}){source.fps=frameRate??30;}
      async start(){}
      async finalize(){
        const writer=this.target.stream.getWriter();
        await writer.write({position:0,data:new Uint8Array([1,2,3])});
        writer.releaseLock();
      }
    },
    getFirstEncodableVideoCodec:async()=> 'avc',
    canEncodeAudio:async()=>true
  };
  const project={clips:[{id:'photo',asset_id:'p',start:0,in:0,out:.5}],
    overlayClips:[],audioClips:[],texts:[],format:{aspect:'original'}};
  const media={p:{kind:'image',url:'blob:photo',w:720,h:1280}};
  try{
    const prepared=await prepareAcceleratedMultitrack({
      project,media,M,expectedAudio:false,
      imageFactory:async()=>({naturalWidth:720,naturalHeight:1280})
    });
    const result=await renderAcceleratedMultitrack({
      prepared,fps:30,writeAt:async(_position,data)=>data.length
    });
    assert.equal(result.videoFrames,15);
    assert.equal(stamps.length,15);
    assert.equal(draws.length,15);
    assert.equal(result.audioCodec,null);
    assert.equal(result.rendererReadyForProduction,false);
  }finally{globalThis.document=old;}
});
