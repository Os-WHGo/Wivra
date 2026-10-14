import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(f)=>readFileSync(new URL('../ios/B0/'+f,import.meta.url),'utf8');

test('B1A creates HEVC video-only writer, based on real compressed DAT frames',()=>{
 const model=read('Sources/MetaB0Model.swift'),record=read('Sources/WivraHEVCRecorder.swift');
 assert.match(model,/videoCodec: receiveCompressedHEVC \? \.hvc1 : \.raw/);
 assert.match(model,/recorder\.append\(frame\.sampleBuffer\)/);
 assert.match(record,/AVAssetWriter\(outputURL:/);
 assert.match(record,/outputSettings: nil, sourceFormatHint: format/);
 assert.match(record,/CMSampleBufferCreateCopyWithNewTiming/);
});
test('B1A waits for keyframe and rebases timestamps before HEVC passthrough',()=>{
 const src=read('Sources/WivraHEVCRecorder.swift');
 assert.match(src,/guard Self\.isHEVCKeyframe\(buffer\)/);
 assert.match(src,/CMBlockBufferCopyDataBytes/);
 assert.match(src,/originalPTS/);
 assert.match(src,/previousDTS/);
 assert.match(src,/kCMSampleAttachmentKey_NotSync/);
});
test('B1A does not claim saved media before writer completes and file exists',()=>{
 const src=read('Sources/WivraHEVCRecorder.swift'),model=read('Sources/MetaB0Model.swift');
 assert.match(src,/writer\.finishWriting/);
 assert.match(src,/attributesOfItem\(atPath: url\.path\)/);
 assert.match(model,/case \.saved\(/);
 assert.match(src,/enum WivraRecordingResult/);
});
test('B1A video-only mode remains selectable after B1D source selector, without LIVE',()=>{
 const view=read('Sources/WivraMetaB0App.swift');
 assert.match(view,/Grabar HEVC/);
 assert.match(view,/Detener y guardar MOV/);
 assert.match(view,/ShareLink\(item: url\)/);
 assert.match(view,/captureSelectedAudio/);
 assert.match(view,/REC · solo video/);
 assert.doesNotMatch(view,/Iniciar LIVE|RTMPS funcionando/);
});
test('B0 RAW preview is still available independently of compressed recording',()=>{
 const model=read('Sources/MetaB0Model.swift'),view=read('Sources/WivraMetaB0App.swift');
 assert.match(model,/\.hvc1 : \.raw/);
 assert.match(view,/B0 · Vista previa/);
 assert.match(view,/B1A · Grabar HEVC/);
 assert.match(model,/if !receiveCompressedHEVC && image == nil/);
});
