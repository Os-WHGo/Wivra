package com.oswhgo.wivra

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import com.pedro.common.ConnectChecker
import com.pedro.encoder.input.sources.audio.MicrophoneSource
import com.pedro.encoder.input.sources.audio.NoAudioSource
import com.pedro.encoder.input.sources.video.NoVideoSource
import com.pedro.encoder.input.sources.video.ScreenSource
import com.pedro.library.base.recording.RecordController
import com.pedro.library.rtmp.RtmpStream
import java.io.File

/**
 * W99 (Claude, owner decision 2A): record the phone screen to a LOCAL MP4, with
 * no transmission at all. Same parts as the screen LIVE (one MediaProjection
 * consent per recording, RootEncoder's ScreenSource, optional phone microphone)
 * but the stream is never started: only RootEncoder's local muxer runs.
 *
 * - The file is written in Wivra's private folder (WivraPhoneMediaStore) and is
 *   marked "being written" so no other screen can save or delete it meanwhile.
 * - Stop from the notification, from Wivra, when Android revokes the capture, or
 *   when storage runs low: in every case the muxer is closed and what was
 *   recorded is kept privately; the person then chooses Save to gallery / Later /
 *   Delete. Nothing is published or deleted without that choice.
 * - No other-app sound, no protected-content bypass, no restart after a crash
 *   (START_NOT_STICKY): a fresh consent is needed for every recording.
 */
class WivraScreenRecordService : Service() {
    private data class Launch(
        val resultCode: Int, val projectionData: Intent, val withMic: Boolean,
        val size: WivraScreenRecordPlan.Size
    )

    companion object {
        const val ACTION_START = "com.oswhgo.wivra.screenrecord.START"
        const val ACTION_STOP = "com.oswhgo.wivra.screenrecord.STOP"
        private const val CHANNEL = "wivra_screen_record"
        private const val NOTIFICATION_ID = 3105
        private const val FINISHED_ID = 3106
        private val lock = Any()
        private var offered: Launch? = null
        private var finished: File? = null

        @Volatile var active = false
            private set
        @Volatile var recording = false
            private set
        @Volatile var startedAt = 0L      // SystemClock.elapsedRealtime() when frames started
            private set
        @Volatile var statusMessage = ""  // empty = idle; the screen shows its own text
            private set

        // The one-use consent stays in memory only: never in Intent extras, prefs or logs.
        fun offer(resultCode: Int, data: Intent, withMic: Boolean, widthPx: Int, heightPx: Int): Boolean =
            synchronized(lock) {
                if (offered != null || active) false
                else {
                    offered = Launch(resultCode, data, withMic, WivraScreenRecordPlan.forScreen(widthPx, heightPx))
                    true
                }
            }

        fun withdrawOffer() = synchronized(lock) { offered = null }

        private fun claim(): Launch? = synchronized(lock) { offered.also { offered = null } }

        /** The private MP4 of the last recording, handed out once to the screen that reviews it. */
        fun takeFinished(): File? = synchronized(lock) { finished.also { finished = null } }

        private fun putFinished(file: File) = synchronized(lock) { finished = file }
    }

    // RootEncoder needs a connection listener even though nothing ever connects here.
    private val noNetwork = object : ConnectChecker {
        override fun onConnectionStarted(url: String) {}
        override fun onConnectionSuccess() {}
        override fun onConnectionFailed(reason: String) {}
        override fun onDisconnect() {}
        override fun onAuthError() {}
        override fun onAuthSuccess() {}
    }

    private val main = Handler(Looper.getMainLooper())
    private var recorder: RtmpStream? = null
    private var projection: MediaProjection? = null
    private var file: File? = null
    private var launch: Launch? = null
    private var stopping = false

    private val spaceCheck = object : Runnable {
        override fun run() {
            val l = launch ?: return
            val f = file ?: return
            if (stopping || !active) return
            val free = runCatching { f.parentFile!!.usableSpace }.getOrDefault(Long.MAX_VALUE)
            if (WivraScreenRecordPlan.mustStopForSpace(free, l.size, l.withMic)) {
                stopRecording(getString(R.string.srec_stopped_space))
                return
            }
            showNotification()
            main.postDelayed(this, 10_000L)
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(
            NotificationChannel(CHANNEL, getString(R.string.srec_channel), NotificationManager.IMPORTANCE_LOW)
        )
    }

    private fun openWivra(): PendingIntent = PendingIntent.getActivity(
        this, 711, Intent(this, WivraScreenRecordActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    private fun notification(): Notification {
        val stop = PendingIntent.getService(
            this, 712, Intent(this, WivraScreenRecordService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val builder = Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setContentTitle(getString(R.string.srec_notif_title))
            .setContentText(if (recording) getString(if (launch?.withMic == true) R.string.srec_notif_recording_mic
                else R.string.srec_notif_recording) else getString(R.string.srec_notif_starting))
            .setContentIntent(openWivra())
            .setOngoing(true)
            .addAction(Notification.Action.Builder(
                android.R.drawable.ic_media_pause, getString(R.string.srec_action_stop), stop
            ).build())
        if (recording && startedAt > 0) {
            // The system clock in the notification counts the recording time.
            builder.setUsesChronometer(true)
                .setWhen(System.currentTimeMillis() - (SystemClock.elapsedRealtime() - startedAt))
        }
        return builder.build()
    }

    private fun showNotification() {
        if (!active) return
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIFICATION_ID, notification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> stopRecording(getString(R.string.srec_stopped_by_user))
            ACTION_START -> {
                if (active || stopping) return START_NOT_STICKY
                val request = claim()
                if (request == null) {
                    stopRecording(getString(R.string.srec_no_new_permission))
                    return START_NOT_STICKY
                }
                try {
                    // Android 14+: startForeground(mediaProjection) BEFORE getMediaProjection().
                    val micGranted = checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
                        PackageManager.PERMISSION_GRANTED
                    val withMic = request.withMic && micGranted
                    var types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                    if (withMic) types = types or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    launch = request.copy(withMic = withMic)
                    startForeground(NOTIFICATION_ID, notification(), types)
                    beginRecording(launch!!)
                } catch (_: Exception) {
                    stopRecording(getString(R.string.srec_start_failed))
                }
            }
            else -> stopRecording(getString(R.string.srec_no_new_permission))
        }
        // A system restart must NOT replay the consent or start recording again.
        return START_NOT_STICKY
    }

    private fun beginRecording(request: Launch) {
        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        val oneUseProjection = manager.getMediaProjection(request.resultCode, request.projectionData)
            ?: error("One-use projection was unavailable")
        projection = oneUseProjection
        val revoked = object : MediaProjection.Callback() {
            override fun onStop() {
                // Android ended the capture (e.g. the person tapped the system chip):
                // close the file and keep what was recorded.
                main.post { if (!stopping) stopRecording(getString(R.string.srec_stopped_by_android)) }
            }
        }
        val stream = RtmpStream(applicationContext, noNetwork, NoVideoSource(), NoAudioSource())
        recorder = stream
        // A still screen must keep producing frames, or the video would freeze-skip.
        stream.getGlInterface().setForceRender(true, WivraScreenRecordPlan.FPS)
        check(stream.prepareVideo(request.size.long, request.size.short, request.size.bitrate,
            fps = WivraScreenRecordPlan.FPS, rotation = 90)) { "H264 video preparation failed" }
        if (request.withMic) stream.changeAudioSource(MicrophoneSource())
        check(stream.prepareAudio(44_100, false, WivraScreenRecordPlan.AUDIO_BITRATE)) {
            "Audio preparation failed"
        }
        stream.changeVideoSource(ScreenSource(applicationContext, oneUseProjection, revoked))
        val target = WivraPhoneMediaStore.createPrivateVideo(this)
        WivraPhoneMediaStore.markWriting(target)
        file = target
        active = true
        recording = false
        statusMessage = getString(R.string.srec_starting)
        stream.startRecord(
            target.absolutePath,
            if (request.withMic) RecordController.RecordTracks.ALL else RecordController.RecordTracks.VIDEO
        ) { status ->
            if (status == RecordController.Status.RECORDING) main.post {
                if (!active || stopping || recording) return@post
                recording = true
                startedAt = SystemClock.elapsedRealtime()
                statusMessage = getString(if (request.withMic) R.string.srec_recording_mic else R.string.srec_recording)
                showNotification()
            }
        }
        showNotification()
        main.postDelayed(spaceCheck, 10_000L)
    }

    private fun stopRecording(reason: String) {
        if (stopping) return
        stopping = true
        main.removeCallbacks(spaceCheck)
        val hadFrames = recording
        active = false
        recording = false
        startedAt = 0L
        withdrawOffer()
        val stream = recorder
        recorder = null
        // Closing the muxer is what makes the MP4 readable; never claim it otherwise.
        val closed = stream?.wivraStopOnce() ?: false
        runCatching { projection?.stop() }
        projection = null
        val written = file
        file = null
        launch = null
        if (written != null) {
            WivraPhoneMediaStore.doneWriting(written)
            if (written.length() == 0L) runCatching { WivraPhoneMediaStore.discard(this, written) }
            else putFinished(written)
        }
        statusMessage = when {
            written == null || written.length() == 0L -> reason
            closed && hadFrames -> reason + " " + getString(R.string.srec_review_now)
            else -> reason + " " + getString(R.string.srec_kept_unverified)
        }
        stopForeground(STOP_FOREGROUND_REMOVE)
        if (written != null && written.length() > 0L) {
            // Visible reminder after the ongoing notification is gone.
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(FINISHED_ID,
                Notification.Builder(this, CHANNEL)
                    .setSmallIcon(android.R.drawable.presence_video_online)
                    .setContentTitle(getString(R.string.srec_finished_title))
                    .setContentText(getString(R.string.srec_finished_text))
                    .setContentIntent(openWivra())
                    .setAutoCancel(true)
                    .build())
        }
        stopSelf()
    }

    override fun onDestroy() {
        if (!stopping) stopRecording(getString(R.string.srec_stopped_by_android))
        super.onDestroy()
    }
}
