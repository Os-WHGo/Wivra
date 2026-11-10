import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = name => readFileSync(new URL('../android/app/src/' + name, import.meta.url), 'utf8');
const live = source('full/java/com/oswhgo/wivra/WivraPhoneLiveActivity.kt');
const scenes = source('full/java/com/oswhgo/wivra/WivraLiveSceneController.kt');
const journey = source('androidTestFull/java/com/oswhgo/wivra/WivraPhoneLiveJourneyInstrumentedTest.kt');
const between = (s, a, b) => s.slice(s.indexOf(a), s.indexOf(b, s.indexOf(a)));

test('scene menu maps allowed actions by identity and rechecks them when tapped', () => {
  const menu = between(scenes, 'private fun showSources()', 'private fun loadVideo(');
  assert.match(menu, /sourceActions\(isLive\(\)\)/);
  assert.match(menu, /val action = actions\[which\]/);
  assert.match(menu, /if \(action !in WivraLiveScenes.sourceActions\(isLive\(\)\)\) return@setItems/);
  assert.match(menu, /SourceAction.STANDBY -> showStandby\(\)/);
  assert.doesNotMatch(menu, /if \(isLive\(\)\) \{/);
});

test('journey distinguishes scroll axes and scene ids from selected labels', () => {
  assert.match(live, /id = R.id.live_controls_scroll/);
  assert.match(scenes, /id = R.id.live_scene_scroll/);
  assert.match(scenes, /R.id.live_scene_camera/);
  assert.match(scenes, /b.isSelected = id == current/);
  assert.match(journey, /resource\(R.id.live_controls_scroll\)/);
  assert.match(journey, /resource\(R.id.live_scene_scroll\)/);
  assert.match(journey, /Direction.RIGHT[\s\S]*Direction.LEFT/);
  assert.match(journey, /clickScene\(device, R.id.live_scene_camera\)/);
  assert.doesNotMatch(journey, /findObject\(By.scrollable\(true\)\)/);
  assert.match(live, /view.minimumHeight = \(48 \* resources.displayMetrics.density\)/);
});

test('surface reattachment preserves the running encoder filters; readiness observes a camera frame', () => {
  const created = between(live, 'override fun surfaceCreated', 'override fun surfaceChanged');
  assert.match(created, /if \(!initiatedByUser\) scenes.reattach\(\)/);
  assert.match(created, /hostStarted && prepared/);
  assert.match(live, /publisher.isOnPreview && hostStarted && cameraFrameReady/);
  assert.match(live, /source.setCustomOnCaptureCompletedCallback/);
  const frame = between(live, 'source.setCustomOnCaptureCompletedCallback', 'val publisher = RtmpStream');
  assert.match(frame, /cameraVideoSource === source && hostStarted/);
  assert.match(frame, /cameraFrameReady = true[\s\S]*refreshPreviewReadiness\(\)/);
  assert.doesNotMatch(frame, /startRecord\(|startStream\(/);
  assert.match(live, /override fun onStop\(\) \{\s*hostStarted = false\s*cameraFrameReady = false/);
});

test('network callbacks serialize with lifecycle and do not close or replace the private MP4', () => {
  const callbacks = between(live, 'override fun onConnectionStarted', 'override fun onAuthSuccess');
  for (const name of ['onConnectionStarted', 'onConnectionSuccess', 'onConnectionFailed', 'onDisconnect', 'onAuthError']) {
    assert.match(callbacks, new RegExp('override fun ' + name + '\\([^)]*\\) \\{\\s*runOnUiThread'));
  }
  assert.doesNotMatch(callbacks, /stopRecord\(|startRecord\(|doneWriting\(|\.delete\(|createPrivateVideo/);
  assert.match(callbacks, /stream\?\.getStreamClient\(\)\?\.reTry\(delay, reason\)/);
  assert.match(callbacks, /plive_failed_copy_continues/);
  assert.match(callbacks, /liveRequested && stream\?\.isStreaming != true/);
});

test('active MP4 stays locked until its writer stops, including a failed close', () => {
  assert.ok(live.indexOf('WivraPhoneMediaStore.markWriting(pending)') < live.indexOf('publisher.startRecord('));
  const stop = between(live, 'private fun stopAndReview()', 'private fun verifiedMp4');
  assert.ok(stop.indexOf('publisher?.isRecording == true) {\n            // A failed close') < stop.indexOf('WivraPhoneMediaStore.doneWriting'));
  assert.match(stop, /pendingFile = file[\s\S]*plive_copy_stop_failed[\s\S]*return/);
  assert.match(live, /isWivraPrivate\(this, file\) \|\| WivraPhoneMediaStore.isWriting\(file\)/);
});

test('journey still requires consent, scene changes, reconnection, recovery and full-length gallery copy', () => {
  for (const required of ['plive_preview_ready', 'plive_confirm_title', 'plive_on_air_with_copy', 'scene_standby_ready',
    'plive_reconnect_with_copy', 'plive_keep_title', 'plive_later', 'plive_review_pending', 'plive_keep_save', 'plive_saved']) {
    assert.ok(journey.includes('R.string.' + required), required);
  }
  assert.match(journey, /control\("\/cut"\)/);
  assert.match(journey, /ms >= \(elapsed - 5.0\) \* 1000/);
  assert.match(journey, /Later preserves the private MP4/);
});
