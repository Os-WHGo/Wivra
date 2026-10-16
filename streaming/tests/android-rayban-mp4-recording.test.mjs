import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const base=new URL('../android/app/src/main/java/com/oswhgo/wivra/',import.meta.url);
const mux=readFileSync(new URL('WivraHevcMp4Recorder.kt',base),'utf8');
const activity=readFileSync(new URL('WivraMetaPreviewActivity.kt',base),'utf8');
const spec=readFileSync(new URL('../../app/dist/agentcut.html',import.meta.url),'utf8');
const dictionary=readFileSync(new URL('../android/app/src/main/res/values/strings.xml',import.meta.url),'utf8');
test('recording uses compressed DAT HEVC only in explicit video-only mode',()=>{
 assert.match(activity,/checkCameraPermission\(recording = true\)/);
 assert.match(activity,/compressVideo = recording/);
 assert.match(activity,/frame\.isCompressed/);
 assert.match(activity,/frame\.presentationTimeUs/);
 assert.match(activity,/WivraSegmentedHevcRecorder\(applicationContext\)/);
 assert.match(activity,/Dispatchers\.IO/);
 assert.match(activity,/stop_save_recording/);
 assert.match(activity,/finishToPending\(\)/);
 assert.match(activity,/if \(recording\) Dispatchers\.IO else Dispatchers\.Main\.immediate/);
 assert.doesNotMatch(activity,/audioStream\.collect/);
});
test('muxer gates on VPS/SPS/PPS and keyframe with bounded sample sizes',()=>{
 assert.match(mux,/MediaFormat\.MIMETYPE_VIDEO_HEVC/);
 assert.match(mux,/MediaMuxer\.OutputFormat\.MUXER_OUTPUT_MPEG_4/);
 assert.match(mux,/sets\.keys\.containsAll\(setOf\(32, 33, 34\)\)/);
 assert.match(mux,/if \(type in 16\.\.21\) syncFrame = true/);
 assert.match(mux,/if \(!started \|\| isCodecConfig && !syncFrame\) return/);
 assert.match(mux,/8 \* 1024 \* 1024/);
 assert.match(mux,/relative = \(ptsUs - firstPtsUs\)\.coerceAtLeast\(lastPtsUs \+ 1L\)/);
 assert.match(mux,/writtenSamples >= 2/);
 assert.match(mux,/muxer\?\.stop\(\)/);
 assert.match(mux,/file\?\.delete\(\)/);
});
test('local video saves atomically without network or experimental microphone',()=>{
 assert.match(mux,/MediaStore\.Video\.Media\.EXTERNAL_CONTENT_URI/);
 assert.match(mux,/MediaStore\.Video\.Media\.IS_PENDING, 1/);
 assert.match(mux,/MediaStore\.Video\.Media\.IS_PENDING, 0/);
 assert.match(mux,/resolver\.delete\(uri, null, null\)/);
 assert.match(mux,/"Movies\/Wivra\/"/);
 assert.doesNotMatch(mux,/^\s*import\s+(?:java\.net|okhttp|retrofit|android\.webkit)/m);
 assert.doesNotMatch(mux,/\b(?:fetch|evaluateJavascript|encodeToString)\s*\(/);
 assert.match(spec,/id="file" type="file" accept="video\/\*,image\/\*"/);
});
test('UI explicitly discloses no audio or LIVE while recording',()=>{
 assert.match(dictionary, /name="record_video_only"[^>]*>[^<]*sin audio/);
 assert.match(dictionary, /name="preview_disclaimer"[^>]*>[^<]*(?:sin audio|audio)/);
});
