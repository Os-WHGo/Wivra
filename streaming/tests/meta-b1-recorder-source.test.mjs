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
 assert.match(view,/Detener grabación/);
 assert.match(view,/WivraPendingDecisionPrompts/);
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

test('B1F photo mode captures an SDK still, not the preview image, and saves JPEG locally',()=>{
 const model=read('Sources/MetaB0Model.swift'),view=read('Sources/WivraMetaB0App.swift');
 assert.match(model,/stream\.photoDataPublisher\.listen/);
 assert.match(model,/stream\.capturePhoto\(format: \.jpeg\)/);
 assert.match(model,/if !stream\.capturePhoto/);
 assert.match(model,/camera != nil && streamState == \.streaming && framesReceived > 0/);
 assert.match(model,/UIImage\(data: bytes\)/);
 assert.match(model,/appendingPathComponent\("WivraPhotos", isDirectory: true\)/);
 assert.match(model,/bytes\.write\(to: url, options: \.atomic\)/);
 assert.match(model,/if photoCaptureInFlight \{/);
 assert.match(view,/Fotografía desde las gafas/);
 assert.match(view,/model\.capturePhoto\(\)/);
 assert.match(view,/ShareLink\(item: url\)/);
 assert.match(view,/wivra_photo_shutter/);
});
test('B1F optional viewfinder grid does not claim manual sensor controls',()=>{
 const view=read('Sources/WivraMetaB0App.swift');
 assert.match(view,/Cuadrícula de tercios \(solo encuadre\)/);
 assert.match(view,/photoGridEnabled/);
 assert.match(view,/ISO, obturador y enfoque manual de las gafas no están expuestos/);
});

test('B1G photo shutter is available during active HEVC recording when SDK accepts it',()=>{
 const model=read('Sources/MetaB0Model.swift');
 const view=read('Sources/WivraMetaB0App.swift');
 assert.match(model,/func capturePhoto\(\)/);
 assert.match(model,/stream\.capturePhoto\(format: \.jpeg\)/);
 const section=model.slice(model.indexOf('var canCapturePhoto: Bool'),model.indexOf('var isCompressedMode'));
 assert.doesNotMatch(section,/!receiveCompressedHEVC/);
 assert.doesNotMatch(section,/!recordingArmed/);
 assert.match(section,/!recordingFinishing/);
 assert.match(view,/En HEVC se puede solicitar una foto mientras se graba/);
 assert.match(view,/wivra_photo_shutter/);
});
test('B1G local Core Image looks export an independent JPEG copy',()=>{
 const model=read('Sources/MetaB0Model.swift');
 const view=read('Sources/WivraMetaB0App.swift');
 const looks=read('Sources/WivraPhotoLooks.swift');
 for(const preset of ['warmFilm','monochrome','vintage','grainy','nightSoft'])
   assert.ok(looks.includes('case '+preset));
 for(const filter of ['CISepiaTone','CIColorControls','CIVignette',
                      'CIRandomGenerator','CINoiseReduction'])
   assert.ok(looks.includes(filter));
 assert.match(looks,/if look == \.original \|\| strength == 0 \{ return sourceBytes \}/);
 assert.match(model,/let bytes = try Data\(contentsOf: originalURL\)/);
 assert.match(model,/lastEditedPhotoURL = url/);
 assert.match(model,/lastCapturedPhotoURL = url/);
 assert.match(view,/wivra_photo_look_export/);
 assert.match(view,/Guardar copia con filtro/);
 assert.match(view,/ISO, obturador y enfoque manual de las gafas no están expuestos/);
});
