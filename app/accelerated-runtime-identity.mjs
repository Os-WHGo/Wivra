// W66: describe the context of a synthetic codec diagnostic, never certify a
// physical device or enable an export engine. Browser tokens are hints only;
// even an observed app bridge is not an authenticated device attestation.
// Raw user agents, device models and URLs must not enter the exported report.
// — Codex
export function acceleratedRuntimeIdentity({userAgent='',platform='',
 maxTouchPoints=0,androidBridge=false,iosBridge=false}={}) {
 const ua=typeof userAgent==='string'?userAgent:'';
 const navPlatform=typeof platform==='string'?platform:'';
 const ios=/iPhone|iPad|iPod/i.test(ua) ||
  (/Macintosh/i.test(ua) && (/Mobile\//i.test(ua) ||
   (navPlatform==='MacIntel' && Number.isFinite(maxTouchPoints) && maxTouchPoints>1)));
 const android=/Android/i.test(ua);
 const desktop=!ios&&!android&&/Windows NT|Macintosh|X11|CrOS|Linux x86_64/i.test(ua);
 const result=(os,runtime,evidence)=>({platform:os,runtime,evidence,
  physicalDeviceVerified:false});
 const hasAndroid=androidBridge===true,hasIOS=iosBridge===true;
 // A contradictory report must not attribute synthetic desktop results to a
 // phone, nor let one injected bridge override another observed host.
 if((hasAndroid&&hasIOS)||(ios&&android)||
    (hasAndroid&&(ios||desktop))||(hasIOS&&(android||desktop)))
  return result('unknown','unknown','conflicting-signals');
 if(hasAndroid)return result('android','android-system-webview','app-bridge-observed');
 if(hasIOS)return result('ios','ios-wkwebview','app-bridge-observed');
 if(android){
  if(/;\s*wv(?:[;)\s])/i.test(ua))
   return result('android','android-system-webview','user-agent-hint');
  if(/Chrome\//i.test(ua)&&!/EdgA\/|OPR\/|SamsungBrowser\//i.test(ua))
   return result('android','android-chrome','user-agent-hint');
  return result('android','unknown-android-browser','user-agent-hint');
 }
 if(ios){
  if(/CriOS\//i.test(ua))return result('ios','ios-chrome','user-agent-hint');
  if(/FxiOS\/|EdgiOS\/|OPiOS\//i.test(ua))
   return result('ios','other-ios-browser','user-agent-hint');
  if(/Version\/[\d.]+.*Safari\//i.test(ua))
   return result('ios','ios-safari','user-agent-hint');
  // Safari-less iOS tokens occur in WKWebView and many other embedded apps.
  // Without Wivra's observed bridge, the embedding cannot be identified.
  return result('ios','unknown-ios-context','user-agent-hint');
 }
 if(desktop){
  if(/Chrome\/|Chromium\//i.test(ua))
   return result('desktop','desktop-chromium','user-agent-hint');
  if(/Version\/[\d.]+.*Safari\//i.test(ua))
   return result('desktop','desktop-safari','user-agent-hint');
  return result('desktop','unknown-desktop-browser','user-agent-hint');
 }
 return result('unknown','unknown','unavailable');
}
