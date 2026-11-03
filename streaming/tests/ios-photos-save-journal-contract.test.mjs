const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
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
