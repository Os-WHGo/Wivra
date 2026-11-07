// Ray-Ban «solo vídeo» + independent microphone (Android): contract vectors and source guards. — Claude
// The same vectors run in the JVM test WivraRayBanSyncTest.kt; this file re-derives them with an independent
// JavaScript twin so a wrong vector cannot pass on both sides by accident.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const v = JSON.parse(read('streaming/contracts/rayban-audio-sync.json'));
const A = 'streaming/android/app/src/main/java/com/oswhgo/wivra/';

function audioClock(c) {
  const firstSampleNs = c.firstReadNs - (c.firstChunkFrames * 1e9) / v.sampleRate;
  const span = (c.lastReadNs - c.firstReadNs) / 1e9;
  const measured = (c.totalFrames - c.firstChunkFrames) / span;
  const ppm = (measured / v.sampleRate - 1) * 1e6;
  const corrected = span >= 300 && Math.abs(ppm) <= 2000;
  return { ...c, firstSampleNs, ppm, corrected, rate: corrected ? measured : v.sampleRate };
}
function slice(a, partStartNs, durationUs) {
  const t0 = (partStartNs - a.firstSampleNs) / 1e9;
  const start = t0 <= 0 ? 0 : Math.floor(t0 * a.rate + 0.5);
  if (start >= a.totalFrames || !(durationUs > 0)) return null;
  const end = Math.min(a.totalFrames, Math.ceil((t0 + durationUs / 1e6) * a.rate));
  return end > start ? [start, end, start / a.rate - t0] : null;
}

test('audio slices: exact PCM frames per video part, drift corrected only when measurable', () => {
  for (const a of v.audio) {
    const c = audioClock(a.clock);
    assert.equal(c.firstSampleNs, a.expectFirstSampleNs, a.why);
    assert.ok(Math.abs(c.ppm - a.expectDriftPpm) < 0.01, a.why);
    assert.equal(c.corrected, a.expectCorrected, a.why);
    for (const s of a.slices) {
      const got = slice(c, s.partStartNs, s.durationUs);
      if (s.expect === null) { assert.equal(got, null, s.why); continue; }
      assert.equal(got[0], s.expect[0], s.why); assert.equal(got[1], s.expect[1], s.why);
      assert.ok(Math.abs(got[2] - s.expect[2]) < 1e-6, s.why);
    }
  }
});

test('part clocks anchor on the least-delayed sample; regressing pts invent no duration', () => {
  for (const c of v.partClocks) {
    let min = Infinity, mono = true, last = -1;
    c.samples.forEach(([arr, pts], i) => { if (i && pts < last) mono = false; last = pts; min = Math.min(min, arr - pts * 1000); });
    const start = !c.samples.length ? -1 : mono ? min + c.samples[0][1] * 1000 : c.samples[0][0];
    const dur = c.samples.length > 1 && mono ? c.samples.at(-1)[1] - c.samples[0][1] : 0;
    assert.equal(start, c.expectStartNs, c.why); assert.equal(dur, c.expectDurationUs, c.why); assert.equal(mono, c.expectMonotonic, c.why);
  }
});

test('the Kotlin rules match the contract (names, Bluetooth needs a readable non-glasses name)', () => {
  const sync = read(A + 'WivraRayBanSync.kt');
  const re = new RegExp(sync.match(/Regex\("""(.+?)""", RegexOption\.IGNORE_CASE\)/)[1], 'i');
  for (const [name, glasses] of v.glassesNames) assert.equal(name !== null && re.test(name), glasses, String(name));
  assert.match(sync, /Choice\.BLUETOOTH -> input\.kind == Kind\.BLUETOOTH && !input\.name\.isNullOrBlank\(\) && !looksLikeGlasses\(input\.name\)/);
  assert.match(sync, /DRIFT_MIN_SECONDS = 300\.0/);
  assert.match(sync, /DRIFT_MAX_PPM = 2_000\.0/);
  assert.match(sync, /val DEFAULT = PHONE/);
});

test('the glasses HFP microphone is never opened by the Ray-Ban recording path', () => {
  for (const f of ['WivraRayBanAudioRoute.kt', 'WivraRayBanAudioStore.kt', 'WivraCaptureForegroundService.kt', 'WivraRayBanSync.kt']) {
    const src = read(A + f);
    assert.doesNotMatch(src, /startBluetoothSco|setBluetoothScoOn\(true\)|setCommunicationDevice|MODE_IN_COMMUNICATION/, f);
  }
  const service = read(A + 'WivraCaptureForegroundService.kt');
  // Only the chosen device id, re-validated; the WAV recorder then checks the routed input on every read.
  assert.match(service, /it\.first\.id == audioDeviceId && WivraRayBanSync\.eligible\(it\.first, audioChoice\)/);
  assert.match(service, /WivraPhoneWavRecorder\(WivraRayBanAudioStore\.wavFor\(applicationContext, sessionKey\), device\)/);
  assert.match(service, /startAudio\(muxer\.sessionKey\)\n\s+activeStream\.start\(\)/, 'audio starts before the stream');
  assert.match(service, /finishToPending\(\) \}\n\s+finishAudio\(lastRecorder\)/);
  assert.match(service, /runCatching \{ finishAudio\(abandoned\) \}/, 'the onDestroy rescue also closes the WAV');
  assert.match(read(A + 'WivraPhoneWavRecorder.kt'), /routed == null \|\| routed\.id != preferredDevice\.id/);
});

test('missing or lost microphone: the person is told and offered others; video goes on', () => {
  const activity = read(A + 'WivraMetaPreviewActivity.kt');
  assert.match(activity, /offerVideoOnly\(getString\(R\.string\.dat_audio_missing\), WivraRayBanAudioRoute\.alternatives\(this, choice\), then\)/);
  assert.match(activity, /else then\(WivraRayBanSync\.Choice\.OFF, -1\)/);
  assert.match(activity, /audioPermissionLauncher\.launch\(Manifest\.permission\.RECORD_AUDIO\)/);
  const service = read(A + 'WivraCaptureForegroundService.kt');
  assert.match(service, /audioIssue = getString\(R\.string\.dat_audio_lost\)/);
  assert.match(service, /audioIssue = getString\(R\.string\.dat_audio_no_permission\)/);
});

test('originals stay intact: slices are byte copies, cut before publishing, full WAV kept until audio is public', () => {
  const store = read(A + 'WivraRayBanAudioStore.kt');
  assert.match(store, /input\.seek\(WAV_HEADER \+ startFrame \* 2\)/);
  assert.doesNotMatch(store, /MediaCodec|AudioTrack|resample/i);
  assert.match(store, /if \(parts\.length\(\) == 0 \|\| data\.has\("publishedCompleteAudioUri"\) \|\| allPublished\) deleteOriginal/);
  const activity = read(A + 'WivraMetaPreviewActivity.kt');
  const keep = activity.indexOf('WivraRayBanAudioStore.prepare(applicationContext, pending)');
  const publish = activity.indexOf('WivraHevcMp4Recorder.publishPending(applicationContext, part) ?: continue');
  assert.ok(keep > 0 && keep < publish, 'audio is cut before the private MP4 is published (and removed)');
  assert.match(activity, /WivraRayBanAudioStore\.publishComplete\(applicationContext, pending\.id\)/);
  assert.match(activity, /WivraRayBanAudioStore\.discardSession\(applicationContext, pending\.id\)/);
});

test('editor import: Ray-Ban part + its slice as one manifest v2 capture', () => {
  const imp = read(A + 'WivraCaptureImport.kt');
  assert.match(imp, /rayBanBundles\(context, destinationDir, result\)/);
  assert.match(imp, /\.put\("cameraSource", "android-rayban-dat"\)/);
  assert.match(imp, /audioName != videoName\.dropLast\(4\) \+ "\.wav"/);
  const manifest = read('streaming/android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /FOREGROUND_SERVICE_MICROPHONE/);
});

test('iPhone uses the same least-delayed anchor for the CAF offset, checked by a Swift smoke test', () => {
  const rec = read('streaming/ios/B0/Sources/WivraHEVCRecorder.swift');
  assert.match(rec, /queue\.sync \{ partClock\.start \?\? videoStartUptime \}/);
  assert.match(rec, /partClock\.observe\(arrival: receivedAtUptime, pts: originalPTS\.seconds\)/);
  const sync = read('streaming/ios/B0/Sources/WivraRayBanSync.swift');
  assert.match(sync, /return ptsMonotonic \? minDelta \+ firstPts : firstArrival/);
  const wf = read('.github/workflows/meta-b0-native-build.yml');
  assert.match(wf, /\/tmp\/wivra-rayban-sync-smoke streaming\/contracts\/rayban-audio-sync\.json/);
});

test('Ray-Ban LIVE (Android): existing RootEncoder engine, chosen microphone only, address never kept', () => {
  const F = 'streaming/android/app/src/full/java/com/oswhgo/wivra/';
  const pub = read(F + 'WivraRayBanLivePublisher.kt');
  assert.match(pub, /RtmpStream\(context\.applicationContext, this, video, mic \?: NoAudioSource\(\)\)/);
  assert.match(pub, /if \(mic != null && !mic\.setPreferredDevice\(microphone\)\) \{ publisher\.release\(\); return false \}/);
  assert.match(pub, /WivraLiveReconnect\(\)/);
  assert.doesNotMatch(pub, /Log\.|println|SharedPreferences|putString/);
  const src = read(F + 'WivraRayBanVideoSource.kt');
  assert.match(src, /OrientationConfig\(cameraOrientation = 0, isPortrait = true\)/);
  assert.match(src, /private val slot = WivraLatestFrameSlot\(\)/);
  const activity = read(A + 'WivraMetaPreviewActivity.kt');
  assert.match(activity, /address\.text\?\.clear\(\)/);
  assert.match(activity, /rayBanLive\?\.muteMicrophone\(\)/);
  assert.match(activity, /if \(liveRunning\) return \/\/ a profile change restarts the camera/);
  assert.doesNotMatch(activity, /putString\("(rtmp|live_address|endpoint)/i);
  const wf = read('.github/workflows/wivra-android-ui-screenshots.yml');
  assert.match(wf, /WivraRayBanLiveInstrumentedTest/);
  assert.match(wf, /grep -c '\^OK \(1 test\)' "\$RUNNER_TEMP\/screen-record\.txt"\)" = 4/);
  assert.match(wf, /WivraLiveReconnectInstrumentedTest/);
  assert.match(wf, /nohup node tools\/rtmp-cut-server\.cjs/);
  assert.match(read('tools/rtmp-cut-server.cjs'), /rtmp:\/\/0\.0\.0\.0:1935\/live\/wivra/, 'only the local CI machine');
  // The colour converter is checked against the shared vector here too.
  const v2 = JSON.parse(read('streaming/contracts/rayban-live.json'));
  const c = v2.i420, b = c.bytes, ys = c.width * c.height, cw = c.width / 2;
  const cl = (x) => (x < 0 ? 0 : x > 255 ? 255 : x);
  for (let r = 0; r < c.height; r++) for (let x = 0; x < c.width; x++) {
    const y = b[r * c.width + x], k = (r >> 1) * cw + (x >> 1), u = b[ys + k] - 128, vv = b[ys + ys / 4 + k] - 128;
    const px = ((0xff << 24) | (cl(y + ((1436 * vv) >> 10)) << 16) | (cl(y - ((352 * u + 731 * vv) >> 10)) << 8) | cl(y + ((1815 * u) >> 10))) >>> 0;
    assert.equal(px.toString(16).toUpperCase().padStart(8, '0'), c.argb[r * c.width + x]);
  }
});

test('Ray-Ban LIVE (iPhone): same HaishinKit controller, host-clock frames, chosen microphone, address cleared', () => {
  const live = read('streaming/ios/B0/Sources/WivraIPhoneLiveScreen.swift');
  assert.match(live, /func prepareGlasses\(audioRoute: WivraAudioRoute\?, profile: WivraDatProfile, relay: WivraGlassesFrameRelay\) async/);
  assert.match(live, /try audioRoute\.activateSelectedInput\(\)/, 'WivraAudioRoute keeps HFP closed unless Bluetooth was chosen');
  assert.match(live, /bufferingPolicy: \.bufferingNewest\(2\)/, 'bounded: older frames dropped');
  assert.match(live, /clock\.hostTime\(pts:/);
  assert.match(live, /videoSize: CGSize\(width: plan\.width, height: plan\.height\)/);
  assert.match(live, /glassesRelay\?\.attach\(nil\)/);
  const view = read('streaming/ios/B0/Sources/WivraGlassesLive.swift');
  assert.match(view, /SecureField\(t\("ios\.rblive\.address"\), text: \$destination\)/);
  assert.match(view, /let address = destination\n\s+destination = ""/);
  assert.doesNotMatch(view, /AppStorage|UserDefaults|print\(/);
  const model = read('streaming/ios/B0/Sources/MetaB0Model.swift');
  assert.match(model, /if relay\.isAttached \{ relay\.push\(frame\.sampleBuffer\) \}/);
});

test('LIVE looks: same table and math on both platforms, GPU only, the original is never filtered', () => {
  const v3 = JSON.parse(read('streaming/contracts/rayban-looks.json'));
  const L = Object.fromEntries(v3.looks.map((l) => [l.id, l]));
  const cl = (x) => Math.min(1, Math.max(0, x));
  for (const r of v3.reference) {
    const l = L[r.look], ec = (x) => cl((cl(x * 2 ** l.exposureEv) - 0.5) * l.contrast + 0.5);
    const [c, u, le, ri, d] = r.pixel, x = ec(c), k = l.sharpen;
    const got = k > 0 ? cl((1 + 4 * k) * x - k * (ec(u) + ec(le) + ec(ri) + ec(d))) : x;
    assert.ok(Math.abs(got - r.expect) < 1e-6, r.look);
  }
  const kt = read(A + 'WivraRayBanLook.kt');
  for (const l of v3.looks) assert.match(kt, new RegExp(`\\("${l.id}", ${l.exposureEv}f?, ${l.contrast}f?, ${l.sharpen}f?\\)`.replace(/(\d)f\?/g, '$1(\\.0)?f?')), l.id);
  const pub = read('streaming/android/app/src/full/java/com/oswhgo/wivra/WivraRayBanLivePublisher.kt');
  assert.match(pub, /gl\.clearFilters\(\)/);
  assert.match(pub, /SharpnessFilterRender\(\)\.apply \{ setSharpness\(look\.sharpen\) \}/);
  // The original HEVC recording path never sees a filter.
  for (const f of ['WivraCaptureForegroundService.kt', 'WivraSegmentedHevcRecorder.kt', 'WivraHevcMp4Recorder.kt'])
    assert.doesNotMatch(read(A + f), /FilterRender|WivraRayBanLook/, f);
  const effect = read('streaming/ios/B0/Sources/WivraGlassesLive.swift');
  assert.match(effect, /CIConvolution3X3/);
  assert.match(effect, /CIExposureAdjust/);
  assert.doesNotMatch(read('streaming/ios/B0/Sources/WivraHEVCRecorder.swift'), /WivraLookEffect|CIFilter/);
});
