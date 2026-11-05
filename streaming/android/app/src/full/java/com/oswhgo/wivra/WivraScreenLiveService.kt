package com.oswhgo.wivra

import android.Manifest
import android.content.pm.PackageManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import com.pedro.common.ConnectChecker
import com.pedro.encoder.input.sources.audio.MicrophoneSource
import com.pedro.encoder.input.sources.audio.NoAudioSource
import com.pedro.encoder.input.sources.video.NoVideoSource
import com.pedro.encoder.input.sources.video.ScreenSource
import com.pedro.library.rtmp.RtmpStream

/**
 * A user-initiated Android screen/app-window RTMP source for Wivra FULL.
 *
 * Optional "Pantalla + cámara" (owner-approved, Claude): the phone camera as
 * a layer over the screen and the phone microphone, ONLY when the owner
 * ticks them and grants their runtime permissions; the service then also
 * carries the camera/microphone foreground-service types. It never attempts
 * protected-content bypass, other-app audio, local recording or a cloud
 * relay. The system picks whole display/app.
 *
 * Android 14+ requires one MediaProjection consent per session, plus an active
 * mediaProjection foreground service BEFORE getMediaProjection(). A revoked
 * projection is terminal: user must confirm a fresh OS capture request.
 */
class WivraScreenLiveService : Service(), ConnectChecker {
    private data class Launch(
        val resultCode: Int, val projectionData: Intent, val rtmpUrl: String,
        val withCamera: Boolean = false, val frontCamera: Boolean = false,
        val withMic: Boolean = false
    )

    companion object {
        const val ACTION_START = "com.oswhgo.wivra.screenlive.START"
        const val ACTION_STOP = "com.oswhgo.wivra.screenlive.STOP"
        // Owner controls for the optional camera layer (Claude).
        const val ACTION_STOP_SCREEN = "com.oswhgo.wivra.screenlive.STOP_SCREEN"
        const val ACTION_TOGGLE_CAMERA = "com.oswhgo.wivra.screenlive.TOGGLE_CAMERA"
        const val ACTION_CAMERA_CORNER = "com.oswhgo.wivra.screenlive.CAMERA_CORNER"
        const val ACTION_CAMERA_ROTATE = "com.oswhgo.wivra.screenlive.CAMERA_ROTATE"
        private const val CHANNEL = "wivra_screen_live"
        private const val NOTIFICATION_ID = 3104
        private val lock = Any()
        private var offered: Launch? = null

        @Volatile var active = false
            private set
        @Volatile var streaming = false
            private set
        @Volatile var statusMessage = ""  // empty = idle; the screen shows its localized text
            private set

        // The RTMP stream key and one-use MediaProjection consent stay
        // in memory only. No stream key in Intent extras, prefs, logs,
        // savedInstanceState, notifications, manifest or editor WebView.
        fun offer(resultCode: Int, data: Intent, url: String,
                  withCamera: Boolean = false, frontCamera: Boolean = false,
                  withMic: Boolean = false, receivedMessage: String = ""): Boolean =
            synchronized(lock) {
                if (offered != null || active || !WivraLiveEndpoint.valid(url)) {
                    false
                } else {
                    offered = Launch(resultCode, data, url, withCamera, frontCamera, withMic)
                    statusMessage = receivedMessage
                    true
                }
            }

        fun withdrawOffer() = synchronized(lock) {
            offered = null
        }

        private fun claim(): Launch? = synchronized(lock) {
            val request = offered
            offered = null
            request
        }
    }

    private val main = Handler(Looper.getMainLooper())
    private var publisher: RtmpStream? = null
    private var projection: MediaProjection? = null
    private var stopping = false
    // Reconnection budget (Claude, W75); RootEncoder keeps the URL in memory.
    private var reconnect = WivraLiveReconnect()
    private var scene: WivraScreenScene.State? = null
    private var cameraLayer: WivraScreenCameraLayer? = null
    private var screenStoppedOnPurpose = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val channel = NotificationChannel(
            CHANNEL, getString(R.string.slive_channel), NotificationManager.IMPORTANCE_LOW
        )
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
            .createNotificationChannel(channel)
    }

    private fun serviceAction(action: String, code: Int): PendingIntent =
        PendingIntent.getService(
            this, code, Intent(this, WivraScreenLiveService::class.java).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    private fun notification(): Notification {
        val stopIntent = Intent(this, WivraScreenLiveService::class.java)
            .setAction(ACTION_STOP)
        val stop = PendingIntent.getService(
            this, 701, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val current = scene
        val builder = Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentTitle(getString(R.string.slive_notif_title))
            .setContentText(when {
                !streaming -> getString(R.string.slive_notif_connecting)
                current?.mode == WivraScreenScene.Mode.CAMERA_ONLY -> getString(R.string.slive_notif_camera_only)
                current?.mode == WivraScreenScene.Mode.SCREEN_CAMERA -> getString(R.string.slive_notif_screen_camera)
                else -> getString(R.string.slive_notif_screen)
            })
            .setOngoing(true)
            .addAction(Notification.Action.Builder(
                android.R.drawable.ic_media_pause, getString(R.string.slive_action_stop), stop
            ).build())
        // With a camera, the owner can stop ONLY the screen and keep the camera.
        if (current?.cameraWanted == true && current.screenActive) {
            builder.addAction(Notification.Action.Builder(
                android.R.drawable.ic_menu_close_clear_cancel, getString(R.string.slive_action_stop_screen),
                serviceAction(ACTION_STOP_SCREEN, 702)
            ).build())
            builder.addAction(Notification.Action.Builder(
                android.R.drawable.ic_menu_camera,
                getString(if (current.mode == WivraScreenScene.Mode.SCREEN_CAMERA) R.string.slive_action_hide_camera else R.string.slive_action_show_camera),
                serviceAction(ACTION_TOGGLE_CAMERA, 703)
            ).build())
        }
        return builder.build()
    }

    private fun noticeText(n: WivraScreenScene.Notice): String = getString(when (n) {
        WivraScreenScene.Notice.SCREEN_STOPPED_CAMERA_CONTINUES -> R.string.slive_notice_screen_stopped_camera
        WivraScreenScene.Notice.SCREEN_STOPPED_ENDED -> R.string.slive_notice_screen_stopped_ended
        WivraScreenScene.Notice.REVOKED_CAMERA_CONTINUES -> R.string.slive_notice_revoked_camera
        WivraScreenScene.Notice.REVOKED_ENDED -> R.string.slive_revoked
        WivraScreenScene.Notice.CAMERA_FAILED_SCREEN_CONTINUES -> R.string.slive_notice_camera_failed
        WivraScreenScene.Notice.CAMERA_FAILED_ENDED -> R.string.slive_notice_camera_failed_ended
    })

    private fun applyScene(next: WivraScreenScene.State) {
        scene = next
        next.notice?.let { statusMessage = noticeText(it) }
        cameraLayer?.place(WivraScreenScene.cameraLayer(next),
            backdropVisible = next.mode == WivraScreenScene.Mode.CAMERA_ONLY)
        if (next.mode == WivraScreenScene.Mode.ENDED) {
            stopCapture(next.notice?.let { noticeText(it) } ?: getString(R.string.slive_ended))
        } else if (active) showNotification()
    }

    private fun showNotification() {
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
            .notify(NOTIFICATION_ID, notification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopCapture(getString(R.string.slive_stopped_by_user))
                return START_NOT_STICKY
            }
            ACTION_STOP_SCREEN -> {
                val current = scene
                if (!active || stopping || current == null) return START_NOT_STICKY
                screenStoppedOnPurpose = true
                val next = WivraScreenScene.screenStoppedByOwner(current)
                applyScene(next)
                // The projection ends now; sharing again needs a new consent.
                if (next.mode != WivraScreenScene.Mode.ENDED) {
                    try { projection?.stop() } catch (_: Exception) { }
                    projection = null
                }
                return START_NOT_STICKY
            }
            ACTION_TOGGLE_CAMERA, ACTION_CAMERA_CORNER, ACTION_CAMERA_ROTATE -> {
                val current = scene
                if (!active || stopping || current == null) return START_NOT_STICKY
                applyScene(when (intent?.action) {
                    ACTION_TOGGLE_CAMERA -> WivraScreenScene.toggleCamera(current)
                    ACTION_CAMERA_CORNER -> WivraScreenScene.nextCorner(current)
                    else -> WivraScreenScene.nextRotation(current)
                })
                return START_NOT_STICKY
            }
            ACTION_START -> {
                if (active || stopping) return START_NOT_STICKY
                val request = claim()
                if (request == null) {
                    stopCapture(getString(R.string.slive_no_new_permission))
                    return START_NOT_STICKY
                }
                // Android 14+: startForeground(mediaProjection) MUST run
                // before getMediaProjection() or opening a virtual display.
                try {
                    // Camera/microphone types only when chosen AND granted now.
                    val cameraGranted = checkSelfPermission(Manifest.permission.CAMERA) ==
                        PackageManager.PERMISSION_GRANTED
                    val micGranted = checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
                        PackageManager.PERMISSION_GRANTED
                    val types = WivraScreenScene.serviceTypes(
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
                        request.withCamera, cameraGranted, request.withMic, micGranted
                    )
                    startForeground(NOTIFICATION_ID, notification(), types)
                    beginProjection(request)
                } catch (_: Exception) {
                    stopCapture(getString(R.string.slive_capture_start_failed))
                }
            }
            else -> {
                stopCapture(getString(R.string.slive_unauthorized))
            }
        }
        // A system restart must NOT replay consent or reconnect to LIVE.
        return START_NOT_STICKY
    }

    private fun beginProjection(offered: Launch) {
        // Camera/microphone only when chosen AND still granted (same check as
        // the foreground-service types passed to startForeground).
        val request = offered.copy(
            withCamera = offered.withCamera && checkSelfPermission(Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
            withMic = offered.withMic && checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
                PackageManager.PERMISSION_GRANTED
        )
        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as
            MediaProjectionManager
        val oneUseProjection = manager.getMediaProjection(
            request.resultCode, request.projectionData
        ) ?: error("One-use projection was unavailable")

        projection = oneUseProjection
        val revoked = object : MediaProjection.Callback() {
            override fun onStop() {
                main.post {
                    if (stopping || screenStoppedOnPurpose) return@post
                    val current = scene
                    if (current?.cameraWanted == true) {
                        // Camera continues; the screen needs a fresh consent.
                        projection = null
                        applyScene(WivraScreenScene.screenRevoked(current))
                    } else {
                        stopCapture(getString(R.string.slive_revoked))
                    }
                }
            }
        }
        // Prepare a native H.264 encoder and use RootEncoder's existing
        // ScreenSource. Static screens require periodic forced frame render.
        // Avoid a second camera or another media stack.
        val stream = RtmpStream(
            applicationContext, this, NoVideoSource(), NoAudioSource()
        )
        publisher = stream
        stream.getGlInterface().setForceRender(true, 15)
        check(stream.prepareVideo(640, 480, 1_200_000, fps = 24, rotation = 90)) {
            "H264 video preparation failed"
        }
        // The phone microphone only when the owner chose it (and granted it).
        if (request.withMic) stream.changeAudioSource(MicrophoneSource())
        check(stream.prepareAudio(44_100, false, 64_000)) {
            "Silent audio source preparation failed"
        }
        stream.changeVideoSource(
            ScreenSource(applicationContext, oneUseProjection, revoked)
        )
        active = true
        streaming = false
        statusMessage = getString(R.string.slive_connecting)
        scene = WivraScreenScene.start(request.withCamera, request.frontCamera)
        showNotification()
        reconnect = WivraLiveReconnect()
        runCatching { stream.getStreamClient().setReTries(WivraLiveReconnect.DELAYS_S.size) }
        stream.startStream(request.rtmpUrl)
        if (request.withCamera) {
            val layer = WivraScreenCameraLayer(applicationContext, request.frontCamera) {
                main.post { scene?.let { if (active && !stopping) applyScene(WivraScreenScene.cameraFailed(it)) } }
            }
            cameraLayer = layer
            layer.attach(stream.getGlInterface())
            scene?.let { applyScene(it) }
        }
        // No publication is claimed until onConnectionSuccess().
    }

    private fun stopCapture(reason: String) {
        if (stopping) return
        stopping = true
        active = false
        streaming = false
        withdrawOffer()
        statusMessage = reason
        runCatching { cameraLayer?.release() }
        cameraLayer = null
        scene = null
        val stream = publisher
        publisher = null
        try {
            if (stream?.isStreaming == true) stream.stopStream()
            stream?.release()
        } catch (_: Exception) {
            // An interrupted remote stream is never represented as completed.
        }
        try {
            projection?.stop()
        } catch (_: Exception) { }
        projection = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        if (!stopping) stopCapture(getString(R.string.slive_finished_by_android))
        super.onDestroy()
    }

    override fun onConnectionStarted(url: String) {
        // url includes the stream key. Never log/display/pass to UI.
        statusMessage = getString(R.string.slive_server_verifying)
    }
    override fun onConnectionSuccess() {
        main.post {
            if (!active || stopping) return@post
            streaming = true
            reconnect.connected()
            val mic = publisher?.audioSource is MicrophoneSource
            statusMessage = getString(when (scene?.mode) {
                WivraScreenScene.Mode.SCREEN_CAMERA -> if (mic) R.string.slive_on_air_both_mic else R.string.slive_on_air_both
                WivraScreenScene.Mode.CAMERA_ONLY -> if (mic) R.string.slive_on_air_camera_mic else R.string.slive_on_air_camera
                else -> if (mic) R.string.slive_on_air_screen_mic else R.string.slive_on_air_screen
            })
            showNotification()
        }
    }
    override fun onConnectionFailed(reason: String) {
        // reason may contain the RTMP URL/key.
        main.post {
            if (stopping || !active) return@post
            val delay = reconnect.nextDelayMs()
            if (delay != null && runCatching { publisher?.getStreamClient()?.reTry(delay, reason) == true }.getOrDefault(false)) {
                streaming = false
                statusMessage = getString(R.string.plive_reconnect, reconnect.attempt,
                    WivraLiveReconnect.DELAYS_S.size, (delay / 1000).toInt())
                showNotification()
                return@post
            }
            stopCapture(
            getString(R.string.slive_connect_failed))
        }
    }
    override fun onDisconnect() {
        main.post { if (!stopping) stopCapture(
            getString(R.string.slive_disconnected)
        ) }
    }
    override fun onAuthError() {
        main.post { if (!stopping) stopCapture(
            getString(R.string.slive_auth_rejected)
        ) }
    }
    override fun onAuthSuccess() { /* no credentials are surfaced */ }
}
