// Decoder-output validation for the synthetic diagnostic only. This does not
// change the exact encoder-configuration preflight or production enablement.
// RFC 6184 §8.1, profile-level-id and profile patterns (Constrained Baseline):
// https://www.rfc-editor.org/rfc/rfc6184#section-8.1
// ITU-T H.264 Annex A, Tables A-1/A-2: frame size, MB/s and profile bitrate.
// https://www.itu.int/rec/T-REC-H.264
// — Codex

// [level_idc, MaxFS, MaxMBPS, baseline/main MaxBR in kbit/s]. Level 1b is
// deliberately absent: its signalling depends on constraint_set3_flag.
const diagnosticAvcLevels = new Map([
  [10,[99,1485,64]], [11,[396,3000,192]],
  [12,[396,6000,384]], [13,[396,11880,768]],
  [20,[396,11880,2000]], [21,[792,19800,4000]],
  [22,[1620,20250,4000]], [30,[1620,40500,10000]],
  [31,[3600,108000,14000]], [32,[5120,216000,20000]],
  [40,[8192,245760,20000]], [41,[8192,245760,50000]],
  [42,[8704,522240,50000]], [50,[22080,589824,135000]],
  [51,[36864,983040,240000]], [52,[36864,2073600,240000]]
]);

function diagnosticAvcProfile(codec) {
  if(typeof codec!=='string'||!/^avc1\.[0-9a-f]{6}$/i.test(codec))return null;
  const profile=parseInt(codec.slice(5,7),16);
  const constraints=parseInt(codec.slice(7,9),16);
  const level=parseInt(codec.slice(9,11),16);
  if(!diagnosticAvcLevels.has(level))return null;
  // Restricted to the families actually requested by mobileCodecConfig.
  // The low reserved bits must be zero. Reject constraint_set3 here rather
  // than interpreting ambiguous Level 1b or expanding the supported family.
  if(profile===0x42 && (constraints&0x4f)===0x40 && !(constraints&0x10))
    return {family:'constrained-baseline',level,bitrateFactor:1000};
  if(profile===0x64 && constraints===0)
    return {family:'high',level,bitrateFactor:1250};
  return null;
}

/**
 * A hardware encoder can emit a lower SPS level than the requested ceiling.
 * Accept it only within the same supported profile family and when that
 * actual level can carry the requested progressive dimensions, FPS and target
 * bitrate. Preserve the actual SPS codec separately in the diagnostic report.
 */
export function verifyDiagnosticAvcOutput(requestedVideoConfig,actualCodec) {
  const requested=diagnosticAvcProfile(requestedVideoConfig?.codec);
  const actual=diagnosticAvcProfile(actualCodec);
  if(!requested||!actual||requested.family!==actual.family||
      actual.level>requested.level)return false;
  const {width,height,framerate,bitrate}=requestedVideoConfig;
  if(!Number.isSafeInteger(width)||width<=0||
      !Number.isSafeInteger(height)||height<=0||
      !Number.isFinite(framerate)||framerate<=0||
      !Number.isSafeInteger(bitrate)||bitrate<=0)return false;
  const mbWidth=Math.ceil(width/16),mbHeight=Math.ceil(height/16);
  const mbFrame=mbWidth*mbHeight,mbSecond=mbFrame*framerate;
  if(!Number.isSafeInteger(mbFrame)||!Number.isFinite(mbSecond))return false;
  const [maxFrame,maxSecond,maxKbps]=diagnosticAvcLevels.get(actual.level);
  return mbFrame<=maxFrame && mbSecond<=maxSecond &&
    mbWidth*mbWidth<=maxFrame*8 && mbHeight*mbHeight<=maxFrame*8 &&
    bitrate<=maxKbps*actual.bitrateFactor;
}
