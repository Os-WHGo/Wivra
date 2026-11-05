// Spatial oracles independent of drawFrame: source coordinates, CPU color,
// grain statistics and safe-zone glyph bounds. No device/hardware claim.
async function browserCase(){
 const M=await import('/mb/mediabunny.mjs');
 const {prepareAcceleratedMultitrack:prepare,renderAcceleratedMultitrack:render}=
  await import('/app/accelerated-multitrack-renderer.mjs');
 const {createBoundedRandomMemoryWriter}=await import('/app/accelerated-memory-export.mjs');
 const {filterRGB}=await import('/core/filters.mjs');
 const encode=bytes=>{let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);};
 const pattern=document.createElement('canvas');pattern.width=256;pattern.height=256;
 const pg=pattern.getContext('2d'),image=pg.createImageData(256,256);
 for(let y=0;y<256;y++)for(let x=0;x<256;x++){
  const p=(y*256+x)*4;image.data[p]=Math.round(32+160*x/255);
  image.data[p+1]=Math.round(40+120*y/255);
  image.data[p+2]=64+32*((Math.floor(x/32)+Math.floor(y/32))%2);image.data[p+3]=255;
 }
 pg.putImageData(image,0,0);
 const gray=document.createElement('canvas');gray.width=256;gray.height=256;
 const gg=gray.getContext('2d');gg.fillStyle='#808080';gg.fillRect(0,0,256,256);
 const urls=[pattern.toDataURL('image/png'),gray.toDataURL('image/png')];
 const media={pattern:{kind:'image',url:urls[0],w:256,h:256},gray:{kind:'image',url:urls[1],w:256,h:256},
  video:{kind:'video',url:'/first.webm',w:960,h:540,duration:4}};
 const mainFilter={brightness:.1,warmth:.2,vignette:.7};
 const insetFilter={warmth:-.3,contrast:.2,vignette:.5};
 const base={format:{aspect:'16:9',fit:'cover'},clips:[{id:'main',asset_id:'pattern',start:0,in:0,out:.2,filter:mainFilter}],
  overlayClips:[{id:'inset',asset_id:'pattern',start:0,in:0,out:.2,x:.7,y:.35,scale:.25,zoom:1.6,px:.2,py:.8,opacity:1,filter:insetFilter}],
  audioClips:[],texts:[]};
 const cases=[];
 async function run(name,project){
  const prepared=await prepare({project,media,M,platform:'qa',expectedAudio:false});
  const writer=createBoundedRandomMemoryWriter();
  const stats=await render({prepared,fps:30,writeAt:(pos,bytes)=>writer.writeAt(pos,bytes)});
  cases.push({name,stats,bytes:encode(writer.finalize())});
 }
 await run('crop',base);
 await run('caption',{format:{aspect:'9:16',fit:'cover',safe:true},
  clips:[{id:'main',asset_id:'pattern',start:0,in:0,out:.2}],overlayClips:[],audioClips:[],
  texts:[{id:'caption',text:'SAFE ZONE',start:0,end:.2,pos:'bottom',size:'l',color:'#ffffff',box:'#000000'}]});
 await run('grain',{format:{aspect:'1:1'},clips:[{id:'main',asset_id:'gray',start:0,in:0,out:.2,filter:{grain:.8}}],
  overlayClips:[],audioClips:[],texts:[]});
 // Independent coordinate mapping from the authored cover/crop geometry.
 const points=[];
 for(const [x,y]of [[100,100],[950,900],[1500,800],[1344,378],[1144,178],[1544,578]]){
  const inset=x>=1104&&x<1584&&y>=138&&y<618;
  const u=inset?(x-1104+57.6)/768:(x+.5)/1920;
  const v=inset?(y-138+230.4)/768:(y+.5+420)/1920;
  const sx=Math.min(255,Math.max(0,Math.round(u*255))),sy=Math.min(255,Math.max(0,Math.round(v*255)));
  const rgb=[Math.round(32+160*sx/255),Math.round(40+120*sy/255),64+32*((Math.floor(sx/32)+Math.floor(sy/32))%2)];
  points.push({x,y,inset,u,v,expected:filterRGB(rgb.map(c=>c/255),inset?insetFilter:mainFilter,[u,v]).map(c=>Math.round(c*255))});
 }
 // Explicit vignette-only pixel oracle at center/corner, not a global MAE.
 const source=document.createElement('canvas');source.width=256;source.height=256;
 const sg=source.getContext('2d');sg.fillStyle='#808080';sg.fillRect(0,0,256,256);
 const filtered=globalThis.fxRender(source,{vignette:1},0);
 if(!filtered)throw Error('Spatial filter unavailable');
 const read=document.createElement('canvas');read.width=256;read.height=256;
 const rg=read.getContext('2d');rg.drawImage(filtered,0,0);
 const vignette=[[128,128],[8,8],[248,248]].map(([x,y])=>({x,y,
  actual:[...rg.getImageData(x,y,1,1).data].slice(0,3),
  expected:filterRGB([128/255,128/255,128/255],{vignette:1},[(x+.5)/256,(y+.5)/256]).map(c=>Math.round(c*255))}));
 const originalFx=globalThis.fxRender;let calls=0,disposed=0,cancelled=0,finalized=0,frames=0;
 const SDK={...M,Input:class extends M.Input{dispose(){disposed++;super.dispose();}},
  CanvasSource:class extends M.CanvasSource{async add(...a){frames++;return super.add(...a);}},
  Output:class extends M.Output{async cancel(){cancelled++;return super.cancel();}async finalize(){finalized++;return super.finalize();}}};
 const p={format:{aspect:'16:9'},clips:[{id:'main',asset_id:'video',start:0,in:0,out:.2,filter:{brightness:.1}}],
  overlayClips:[{id:'inset',asset_id:'video',start:0,in:1,out:1.2,x:.7,y:.35,scale:.25,filter:{warmth:.2}}],audioClips:[],texts:[]};
 const prepared=await prepare({project:p,media,M:SDK,platform:'qa',expectedAudio:false});
 globalThis.fxRender=(...args)=>{
  calls++;const output=originalFx(...args);
  if(calls!==2)return output;
  const gl=output.getContext('webgl'),ext=gl.getExtension('WEBGL_lose_context');
  if(!ext)throw Error('WEBGL_lose_context unavailable');
  ext.loseContext();return originalFx(...args);
 };
 let error='';try{await render({prepared,fps:30,writeAt:async(pos,bytes)=>bytes.length});}
 catch(e){error=String(e);}finally{globalThis.fxRender=originalFx;}
 return {cases,points,vignette,loss:{calls,disposed,cancelled,finalized,frames,error}};
}
function verifyCase(data,{tmp,ffmpeg}){
 const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
 const output={points:[],vignette:data.vignette,loss:data.loss,cases:[]};
 const decoded={};
 for(const c of data.cases){
  const file=path.join(tmp,'spatial-'+c.name+'.'+c.stats.container);
  fs.writeFileSync(file,Buffer.from(c.bytes,'base64'));
  const frame=n=>ffmpeg(['-i',file,'-vf','select=eq(n\\,'+n+')','-vsync','0','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);
  decoded[c.name]={pixels:frame(0),frame,width:c.stats.width,height:c.stats.height};
  assert.equal(c.stats.videoFrames,6);assert.equal(c.stats.rendererReadyForProduction,false);
  output.cases.push({name:c.name,width:c.stats.width,height:c.stats.height,bytes:Buffer.from(c.bytes,'base64').length});
 }
 const crop=decoded.crop;
 for(const p of data.points){const index=(p.y*crop.width+p.x)*3,actual=[...crop.pixels.subarray(index,index+3)];
  output.points.push({...p,actual});
  for(let i=0;i<3;i++)assert.ok(Math.abs(actual[i]-p.expected[i])<12,'spatial crop/filter mismatch '+JSON.stringify({...p,actual}));
 }
 const cap=decoded.caption;let minX=Infinity,maxX=-1,minY=Infinity,maxY=-1,count=0;
 for(let y=0;y<cap.height;y++)for(let x=0;x<cap.width;x++){
  const p=(y*cap.width+x)*3;if(cap.pixels[p]>220&&cap.pixels[p+1]>220&&cap.pixels[p+2]>220){
   count++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
  }
 }
 output.caption={minX,maxX,minY,maxY,count};
 assert.ok(count>5000&&minY>1200&&maxY<=1472,'caption left vertical safe zone: '+JSON.stringify(output.caption));
 assert.ok(minX>=90&&maxX<=950&&Math.abs((minX+maxX)/2-520)<12,'caption safe-zone center changed');
 const grain=decoded.grain,a=grain.pixels,b=grain.frame(1),c=grain.frame(3);
 let sum=0,sum2=0,same=0,different=0,n=0;
 for(let y=200;y<880;y+=2)for(let x=200;x<880;x+=2){const p=(y*grain.width+x)*3,v=a[p];
  sum+=v;sum2+=v*v;same+=Math.abs(v-b[p]);different+=Math.abs(v-c[p]);n++;
 }
 output.grain={mean:sum/n,sd:Math.sqrt(sum2/n-(sum/n)**2),sameSeedMAE:same/n,newSeedMAE:different/n};
 assert.ok(Math.abs(output.grain.mean-128)<8&&output.grain.sd>7,'grain variance missing');
 assert.ok(output.grain.sameSeedMAE<3&&output.grain.newSeedMAE>5,'grain temporal seed changed');
 for(const p of data.vignette)for(let i=0;i<3;i++)assert.ok(Math.abs(p.actual[i]-p.expected[i])<=3,'vignette CPU/GPU mismatch');
 assert.ok(data.vignette[0].actual[0]>data.vignette[1].actual[0]+50);
 assert.match(data.loss.error,/GPU filter failed/);assert.equal(data.loss.calls,2);
 assert.equal(data.loss.disposed,1);assert.equal(data.loss.cancelled,1);assert.equal(data.loss.finalized,0);assert.equal(data.loss.frames,0);
 output.pass=true;return output;
}
module.exports={browserCase,verifyCase};
