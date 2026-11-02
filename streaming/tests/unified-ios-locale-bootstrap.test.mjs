import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const swift = readFileSync(
  new URL('../ios/B0/Sources/WivraEditorLocaleBootstrap.swift', import.meta.url), 'utf8');
const host = readFileSync(
  new URL('../ios/B0/Sources/WivraEmbeddedEditorScreen.swift', import.meta.url), 'utf8');
const editor = readFileSync(
  new URL('../../app/template.html', import.meta.url), 'utf8');

const source = swift.match(/let source = """([\s\S]*?)"""/)?.[1];
assert.ok(source, 'read exact Swift-injected document-start script');
function simulate({current=null,code='fr',protocol='file:',pathname='/wivra/agentcut.html',throwStorage=false}={}) {
  let value=current, writes=0;
  const localStorage={
    getItem(key) {
      assert.equal(key,'wivra.lang');
      if(throwStorage) throw Error('storage unavailable');
      return value;
    },
    setItem(key,next) {
      assert.equal(key,'wivra.lang');
      if(throwStorage) throw Error('storage unavailable');
      writes++;
      value=next;
    }
  };
  runInNewContext(source.replaceAll('\\(code)', code),
    {location:{protocol,pathname},localStorage});
  return {value,writes};
}

test('a new editor receives iOS native locale before first language selection',()=>{
  assert.deepEqual(simulate(),{value:'fr',writes:1});
  assert.deepEqual(simulate({code:'ja'}),{value:'ja',writes:1});
  assert.match(swift,/injectionTime: \.atDocumentStart/);
  assert.match(swift,/forMainFrameOnly: true/);
  assert.match(host,/WivraEditorLocaleBootstrap\.makeFirstLaunchScript\(\)/);
  const init=host.indexOf('WivraEditorLocaleBootstrap.makeFirstLaunchScript()');
  const bridge=host.indexOf('WivraEditorNativeBridge(), contentWorld: .page');
  assert.ok(init>=0 && bridge>init,'native locale seed is installed before editor loads');
  assert.match(editor,/localStorage\.getItem\('wivra.lang'\)/);
});

test('an existing Editor selection always wins, including its extra languages',()=>{
  for(const lang of ['es','en','de','pt','zh','it','ja','fr','other']) {
    assert.deepEqual(simulate({current:lang,code:'en'}),{value:lang,writes:0});
  }
});

test('no writes outside packaged editor or when file-origin storage is denied',()=>{
  assert.deepEqual(simulate({protocol:'https:'}),{value:null,writes:0});
  assert.deepEqual(simulate({pathname:'/wivra/another.html'}),{value:null,writes:0});
  assert.deepEqual(simulate({throwStorage:true}),{value:null,writes:0});
  assert.match(swift,/"es", "en", "fr", "de", "it", "ja"/);
  assert.match(swift,/bundle\.preferredLocalizations\.first/);
});

test('native locale bootstrap does not modify the editor or send data remotely',()=>{
  assert.doesNotMatch(swift,/evaluateJavaScript/);
  assert.doesNotMatch(swift,/URLSession|fetch\(/);
  assert.match(swift,/localStorage\.getItem\(key\) !== null/);
  assert.match(swift,/localStorage\.setItem\(key/);
  assert.match(editor,/function i18nApply\(lang\)/);
});
