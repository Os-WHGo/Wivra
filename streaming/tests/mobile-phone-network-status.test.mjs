import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p, import.meta.url),'utf8');

const swift=read('../ios/B0/Sources/WivraPhoneNetworkStatus.swift');
const swiftApp=read('../ios/B0/Sources/WivraMetaB0App.swift');
const android=read('../android/app/src/main/java/com/oswhgo/wivra/WivraMetaPreviewActivity.kt');
const androidManifest=read('../android/app/src/main/AndroidManifest.xml');

test('iPhone observes only active system path, never claims Meta camera link is Wi-Fi',()=>{
  assert.match(swift,/NWPathMonitor\(\)/);
  assert.match(swift,/path\.status == \.satisfied/);
  assert.match(swift,/path\.usesInterfaceType\(\.wifi\)/);
  assert.match(swift,/path\.usesInterfaceType\(\.cellular\)/);
  assert.match(swift,/path\.isExpensive/);
  assert.match(swift,/path\.isConstrained/);
  assert.doesNotMatch(swift,/URLSession|https:\/\/|setPreferredInterface|requestTransportSwitch/);
  assert.match(swiftApp, /@State private var phoneNetwork = WivraPhoneNetworkStatus\(\)/);
  assert.match(swiftApp, /wivra_phone_network_route/);
  assert.match(swiftApp, /phoneNetwork\.start\(\)/);
  assert.match(swiftApp, /ios\.network\.disclaimer/);
});

test('Android observes active network via permission and callback safely while resumed',()=>{
  assert.match(androidManifest, /android\.permission\.ACCESS_NETWORK_STATE/);
  assert.match(android, /ConnectivityManager\.NetworkCallback\(\)/);
  assert.match(android, /registerDefaultNetworkCallback\(networkObserver\)/);
  assert.match(android, /unregisterNetworkCallback\(networkObserver\)/);
  assert.match(android, /connectivityManager\.activeNetwork/);
  assert.match(android, /NetworkCapabilities\.TRANSPORT_WIFI/);
  assert.match(android, /NetworkCapabilities\.TRANSPORT_CELLULAR/);
  assert.match(android, /NetworkCapabilities\.TRANSPORT_VPN/);
  assert.match(android, /NetworkCapabilities\.NET_CAPABILITY_VALIDATED/);
  assert.match(android, /mobile_network_disclaimer/);
  assert.doesNotMatch(android, /WifiManager|WifiInfo|TelephonyManager|requestNetwork\(/);
});

test('neither OS silently switches DAT or starts a publisher on phone route change',()=>{
  for(const src of [swift,android]){
    assert.doesNotMatch(src, /RTMPS|startLive\(|phoneUplinkGB|measuredUploadMbps/);
  }
});

test('localized network diagnostics exist on both OSes in all six languages',()=>{
  const ios=['unknown','offline','wifi','cellular','ethernet','other','route',
    'no_verified_uplink','constrained','expensive','disclaimer'];
  const droid=['offline','wifi','cellular','ethernet','vpn','other',
    'system_validated','unverified','summary','disclaimer','checking','unavailable'];
  for (const lang of ['es','en','fr','de','it','ja']){
    const iosData=read(`../ios/B0/Resources/${lang}.lproj/Localizable.strings`);
    const dir=lang==='es'?'values':`values-${lang}`;
    const droidData=read(`../android/app/src/main/res/${dir}/strings.xml`);
    for(const k of ios) assert.ok(iosData.includes(`"ios.network.${k}" = "`),
      `Missing ios.network.${k} in ${lang}`);
    for(const k of droid) assert.ok(droidData.includes(`name="mobile_network_${k}"`),
      `Missing mobile_network_${k} in ${dir}`);
    assert.match(iosData, /"ios\.network\.route" = "[^"]*%@/);
    assert.match(droidData,/name="mobile_network_summary">[^<]*%1\$s[^<]*%2\$s/);
  }
});
