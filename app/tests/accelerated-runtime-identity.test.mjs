import test from 'node:test';
import assert from 'node:assert/strict';
import {acceleratedRuntimeIdentity as identity} from '../accelerated-runtime-identity.mjs';

const android='Mozilla/5.0 (Linux; Android 15; PrivateModel) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const linux='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const safari=iphone+' Version/26.0 Mobile/15E148 Safari/604.1';

test('observed app bridges distinguish their embedded runtimes from browser hints',()=>{
 assert.deepEqual(identity({userAgent:android,androidBridge:true}),{
  platform:'android',runtime:'android-system-webview',
  evidence:'app-bridge-observed',physicalDeviceVerified:false});
 assert.deepEqual(identity({userAgent:safari,iosBridge:true}),{
  platform:'ios',runtime:'ios-wkwebview',
  evidence:'app-bridge-observed',physicalDeviceVerified:false});
 // A customized/empty UA does not discard an observed Wivra bridge.
 assert.equal(identity({iosBridge:true}).runtime,'ios-wkwebview');
});

test('Android Chrome and Android WebView are separate unverified UA hints',()=>{
 assert.equal(identity({userAgent:android}).runtime,'android-chrome');
 const webview=android.replace('PrivateModel)','PrivateModel; wv)');
 assert.equal(identity({userAgent:webview}).runtime,'android-system-webview');
 assert.equal(identity({userAgent:webview}).evidence,'user-agent-hint');
 assert.equal(identity({userAgent:android+' SamsungBrowser/28.0'}).runtime,'unknown-android-browser');
});

test('iOS Safari is distinct from unidentified embedding and other iOS browsers',()=>{
 assert.equal(identity({userAgent:safari}).runtime,'ios-safari');
 assert.equal(identity({userAgent:iphone+' Mobile/15E148'}).runtime,'unknown-ios-context');
 assert.equal(identity({userAgent:iphone+' CriOS/141.0.0.0 Mobile/15E148 Safari/604.1'}).runtime,'ios-chrome');
 for(const token of ['FxiOS/144.0','EdgiOS/141.0','OPiOS/2.0'])
  assert.equal(identity({userAgent:iphone+' '+token+' Safari/604.1'}).runtime,'other-ios-browser');
});

test('iPad desktop UA remains a hint and does not certify Safari or WKWebView',()=>{
 const ua='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15';
 assert.equal(identity({userAgent:ua,platform:'MacIntel',maxTouchPoints:5}).runtime,'ios-safari');
 assert.equal(identity({userAgent:ua,platform:'MacIntel',maxTouchPoints:5,iosBridge:true}).runtime,'ios-wkwebview');
 assert.equal(identity({userAgent:ua}).runtime,'desktop-safari');
});

test('desktop results cannot be attributed to mobile through contradictory bridges',()=>{
 assert.equal(identity({userAgent:linux}).runtime,'desktop-chromium');
 for(const args of [
  {userAgent:linux,androidBridge:true},
  {userAgent:linux,iosBridge:true},
  {userAgent:iphone,androidBridge:true},
  {userAgent:android,iosBridge:true},
  {androidBridge:true,iosBridge:true},
  {userAgent:iphone+' Android 15'}
 ])assert.deepEqual(identity(args),{platform:'unknown',runtime:'unknown',
  evidence:'conflicting-signals',physicalDeviceVerified:false});
});

test('all identity evidence is deliberately unverified and exports no identifying input',()=>{
 for(const args of [{},{userAgent:android},{userAgent:safari},{userAgent:linux},
  {userAgent:android,androidBridge:true}]){
  const report=identity(args);
  assert.equal(report.physicalDeviceVerified,false);
  assert.deepEqual(Object.keys(report).sort(),['evidence','physicalDeviceVerified','platform','runtime']);
  assert.doesNotMatch(JSON.stringify(report),/PrivateModel|Mozilla|https?:|141\.0/);
 }
 assert.equal(identity({androidBridge:'true',iosBridge:{}}).runtime,'unknown');
 assert.equal(identity({userAgent:{toString(){throw Error('must not coerce');}},platform:null}).runtime,'unknown');
});
