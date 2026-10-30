import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

const root=fileURLToPath(new URL('../android/app/src/main/res/',import.meta.url));
const locales=['values','values-en','values-fr','values-de','values-it','values-ja','values-pt','values-zh'];
const parse=(name)=>{
 const xml=readFileSync(join(root,name,'strings.xml'),'utf8');
 assert.match(xml,/<resources>[\s\S]*<\/resources>/);
 const matches=[...xml.matchAll(/<string name="([a-z0-9_]+)">([\s\S]*?)<\/string>/g)];
 const keys=new Map(matches.map(m=>[m[1],m[2]]));
 assert.equal(keys.size,matches.length,'no duplicate keys: '+name);
 return keys;
};
test('Android has complete launch locale dictionaries with identical keys',()=>{
 const baseline=parse('values');
 assert.ok(baseline.size>=30);
 for(const locale of locales.slice(1)){
   const translated=parse(locale);
   assert.deepEqual([...translated.keys()].sort(),[...baseline.keys()].sort(),'keys missing: '+locale);
   for(const [key,value] of translated){
     assert.ok(value.trim().length>0,'blank '+locale+' '+key);
     const args=s=>(s.match(/%[1-9]\$[sd]/g)||[]).sort().join(',');
     assert.equal(args(value),args(baseline.get(key)),'placeholder mismatch: '+locale+' '+key);
   }
 }
});
test('Native Android UI uses resources rather than mixing Spanish in other locales',()=>{
 const file=readFileSync(new URL('../android/app/src/main/java/com/oswhgo/wivra/WivraMetaPreviewActivity.kt',import.meta.url),'utf8');
 const names=new Set([...file.matchAll(/R\.string\.([a-z0-9_]+)/g)].map(x=>x[1]));
 const baseline=parse('values');
 for(const name of names) assert.ok(baseline.has(name),'undefined resource '+name);
 assert.ok(names.size>=30);
 assert.match(file,/getString\(R\.string\.frames_status, frames, frame\.width, frame\.height\)/);
 assert.doesNotMatch(file,/show\(".*(?:gafas|permiso|conexi[oó]n|c[aá]mara).*"\)/i);
});

test('WAV pairing, chooser and Ray-Ban accessibility localized across eight dictionaries',()=>{
  const baseline=parse('values');
  for(const locale of locales){
    const dict=parse(locale);
    for(const key of ['picker_phone_capture_bundle','picker_capture_title','connect_glasses_accessibility','phone_camera_source_bluetooth','teleprompter_start']){
      assert.ok(dict.has(key),'Missing '+key+' in '+locale);
    }
    assert.match(dict.get('picker_phone_capture_bundle'),/%1\$s/);
    assert.equal(dict.size,baseline.size);
  }
  const main=readFileSync(new URL('../android/app/src/main/java/com/oswhgo/wivra/MainActivity.java',import.meta.url),'utf8');
  assert.match(main,/R\.string\.picker_phone_capture_bundle/);
  assert.match(main,/R\.string\.picker_capture_title/);
  assert.match(main,/getString\(R\.string\.connect_glasses_accessibility\)/);
  assert.doesNotMatch(main,/glasses\.setContentDescription\("Conectar gafas/);
});
