import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Photos add-only save writes a durable fingerprint intent before performChanges',()=>{
 const bridge=read('ios/B0/Sources/WivraExportNativeBridge.swift');
 const begin=bridge.indexOf('journal.begin(for: url)');
 const perform=bridge.indexOf('PHPhotoLibrary.shared().performChanges');
 const confirmed=bridge.indexOf('journal.markConfirmed(hash: hash)');
 const uncertain=bridge.indexOf('journal.markUncertain(hash: hash)');
 assert.ok(begin>=0&&perform>begin&&confirmed>perform&&uncertain>confirmed,
  'Photos transaction must be journaled before commit and settled afterward');
 assert.match(bridge,/case \.alreadyConfirmed:/);
 assert.match(bridge,/case \.requiresManualReview:/);
});

test('all native and recovered export save surfaces share the same Photos journal path',()=>{
 const v1=read('ios/B0/Sources/WivraExportNativeBridge.swift');
 const v2=read('ios/B0/Sources/WivraAcceleratedExportNativeBridge.swift');
 const ui=read('ios/B0/Sources/WivraMetaB0App.swift');
 assert.match(v1,/WivraPhotosLibrary\.saveVideo\(url\)/);
 assert.match(v2,/WivraPhotosLibrary\.saveVideo\(saved\.url\)/);
 assert.match(ui,/WivraPhotosLibrary\.saveVideo\(video\.url\)/);
});

test('journal hashes exact bytes, atomically persists and fails closed for uncertain or corrupt history',()=>{
 const journal=read('ios/B0/Sources/WivraPhotosSaveJournal.swift');
 assert.match(journal,/SHA256\(\)/);
 assert.match(journal,/data\.write\(to: fileURL, options: \.atomic\)/);
 assert.match(journal,/case pending, confirmed, uncertain/);
 assert.match(journal,/requiresManualReview/);
 assert.match(journal,/corruptJournal/);
 assert.match(journal,/Never reset a damaged journal/);
});

test('export recovery UI exposes explicit manual resolution and guarded retry only after absence confirmation',()=>{
 const journal=read('ios/B0/Sources/WivraPhotosSaveJournal.swift');
 const ui=read('ios/B0/Sources/WivraMetaB0App.swift');
 assert.ok(journal.includes('func reviewStatus(for url: URL)'));
 assert.ok(journal.includes('func confirmManuallyPresent(for url: URL)'));
 assert.ok(journal.includes('func authorizeRetryAfterManualAbsence(for url: URL)'));
 assert.ok(journal.includes('entry.state != .confirmed'));
 assert.ok(ui.includes('Ya aparece en Fotos'));
 assert.ok(ui.includes('No aparece, permitir reintento'));
 assert.ok(ui.includes('Confirma que buscaste este video en Fotos y no aparece'));
 assert.ok(ui.includes('confirmManuallyPresent(for: video.url)'));
 assert.ok(ui.includes('authorizeRetryAfterManualAbsence(for: video.url)'));
});

test('iPhone LIVE uses existing Photos journal and blocks duplicate attempts pending manual review',()=>{
 const ui=read('ios/B0/Sources/WivraIPhoneLiveScreen.swift');
 const journal=read('ios/B0/Sources/WivraPhotosSaveJournal.swift');
 assert.match(ui,/WivraPhotosSaveJournal\.shared\.reviewStatus\(for: file\)/);
 assert.match(ui,/photosReview\[file\] == \.noRecord/);
 assert.match(ui,/photosReview\[file\] == \.needsManualReview/);
 assert.match(ui,/try await WivraPhotosLibrary\.saveVideo\(file\)/);
 assert.match(ui,/try await WivraPhotosSaveJournal\.shared\.confirmManuallyPresent\(for: file\)/);
 assert.match(ui,/try await WivraPhotosSaveJournal\.shared\.authorizeRetryAfterManualAbsence\(for: file\)/);
 assert.match(ui,/Button\("Ya aparece en Fotos"\)/);
 assert.match(ui,/Button\("No aparece, permitir reintento", role: \.destructive\)/);
 assert.match(ui,/Comprueba primero que este video no existe en Fotos/);
 assert.match(ui,/\.task\(id: file\) \{ await refreshPhotosReview\(for: file\) \}/);
 assert.match(ui,/photoMessage = "Guardado no confirmado\./);
 assert.match(journal,/case requiresManualReview/);
 assert.doesNotMatch(ui,/PHPhotoLibrary\.shared\(\)\.performChanges|PHAssetChangeRequest|PHPhotoLibrary\.shared\(\)\.fetchAssets/);
});

test('recovered LIVE clips require verified microphone intent before offering Photos save',()=>{
 const ui=read('ios/B0/Sources/WivraIPhoneLiveScreen.swift');
 assert.match(ui,/WivraLiveRecordingReceipt\.audioExpectation\(/);
 assert.match(ui,/requireAudio: expectation == \.required/);
 assert.match(ui,/if expectation == \.unknown \{ uncertainAudio\.insert\(file\) \}/);
 assert.match(ui,/if controller\.audioUncertainVideos\.contains\(file\) \{/);
 assert.match(ui,/Audio no confirmado: grabación anterior o registro incompleto/);
 assert.match(ui,/else \{\s*photosControls\(for: file\)/);
 assert.match(ui,/ShareLink\(item: file\)/);
 assert.doesNotMatch(ui,/FileManager\.default\.removeItem\(at: file\)/);
});
