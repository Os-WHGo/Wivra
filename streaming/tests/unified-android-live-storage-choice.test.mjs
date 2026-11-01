// Full Wivra LIVE: RTMP consent, optional local MP4, storage safety and VOD honesty.
// These tests do not claim a real Twitch/YouTube/Kick stream or a physical phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const live = readFileSync(
  new URL('../android/app/src/full/java/com/oswhgo/wivra/WivraPhoneLiveActivity.kt', import.meta.url),
  'utf8'
);

test('LIVE has a deliberate opt-out for local MP4 with explicit VOD and storage warnings', () => {
  assert.match(live, /private lateinit var localCopyOption: CheckBox/);
  assert.match(live, /"Guardar también una copia MP4 local \(opcional\)"/);
  assert.match(live, /"LIVE largo: comprueba que tu plataforma conserve el VOD/);
  assert.match(live, /"Solo transmitir: NO se guardará copia en Wivra/);
  assert.match(live, /startLive\(address, withAudio, saveCopy\)/);
  assert.match(live, /if \(saveCopy\) WivraPhoneMediaStore\.createPrivateVideo/);
  assert.match(live, /else null/);
  assert.match(live, /if \(saveCopy && pending != null\) \{\s*publisher\.startRecord\(/);
  assert.match(live, /publisher\.startStream\(address\)/);
  assert.match(live, /FLAG_SECURE/);
  assert.doesNotMatch(live, /putString\(.+key|Log\.[a-z]+\(.+address/);
});

test('128-MiB reserve blocks local recording but not stream-only connection', () => {
  const start = live.split('private fun startLive(')[1]?.split('private fun controlsIdle(')[0];
  assert.ok(start);
  assert.match(start, /if \(saveCopy && applicationContext\.filesDir\.usableSpace < minFreeBytes\)/);
  assert.match(start, /if \(saveCopy\) WivraPhoneMediaStore\.createPrivateVideo/);
  assert.match(start, /if \(saveCopy && pending != null\)/);
  assert.match(start, /initiatedByUser = true/);
  assert.match(start, /saveLocalCopy = saveCopy && pending != null/);
  assert.match(start, /publisher\.startStream\(address\)/);
});

test('critical low storage stops only local MP4, not a healthy remote LIVE', () => {
  const watchdog = live.split('private val storageCheck = object : Runnable {')[1]
    ?.split('private val cameraPermission')[0];
  const stopLocal = live.split('private fun finishLocalCopyForLowStorage() {')[1]
    ?.split('private fun preparePreview()')[0];
  assert.ok(watchdog && stopLocal);
  assert.match(watchdog, /saveLocalCopy && stream\?\.isRecording == true/);
  assert.match(watchdog, /finishLocalCopyForLowStorage\(\)/);
  assert.doesNotMatch(watchdog, /stopAndReview\(|stopStream\(/);
  assert.match(stopLocal, /publisher\.stopRecord\(\)/);
  assert.match(stopLocal, /localCopyFinalized = closed/);
  assert.match(stopLocal, /saveLocalCopy = false/);
  assert.match(stopLocal, /if \(publisher\.isStreaming\)/);
  assert.doesNotMatch(stopLocal, /publisher\.stopStream\(|delete\(/);
  // If RootEncoder refuses to stop the local writer, fail closed rather
  // than letting the still-running muxer exhaust the phone storage.
  assert.match(stopLocal, /if \(publisher\.isRecording\) \{[\s\S]*?stopAndReview\(\)/);
});

test('finishing LIVE never pretends a remote-only session created a local MP4', () => {
  const finish = live.split('private fun stopAndReview() {')[1]
    ?.split('private fun verifiedMp4(')[0];
  assert.ok(finish);
  assert.match(finish, /val alreadyFinalized = localCopyFinalized/);
  assert.match(finish, /else alreadyFinalized/);
  assert.match(finish, /file != null && muxerClosed -> reviewFile\(file\)/);
  assert.match(finish, /else -> setStatus\(/);
  assert.match(finish, /No se creó copia local/);
  assert.match(finish, /Verifica en la/);
  assert.doesNotMatch(finish, /WivraPhoneMediaStore\.publish/);
});

test('media verification and public-stream confirmation remain mandatory', () => {
  const ask = live.split('private fun askKeep(')[1]
    ?.split('private fun reviewPendingVideo(')[0];
  assert.ok(ask);
  assert.match(ask, /check\(verifiedMp4\(file\)\)/);
  assert.match(ask, /WivraPhoneMediaStore\.publish/);
  assert.match(ask, /setNeutralButton\("Después", null\)/);
  assert.match(ask, /Confirmar borrado/);
  assert.match(live, /setTitle\("Confirmar emisión pública"\)/);
  assert.match(live, /setPositiveButton\("Iniciar LIVE"\)/);
  assert.match(live, /onConnectionSuccess\(\)/);
  assert.match(live, /if \(saveLocalCopy\)/);
  assert.match(live, /No hay copia local para recuperar/);
});
