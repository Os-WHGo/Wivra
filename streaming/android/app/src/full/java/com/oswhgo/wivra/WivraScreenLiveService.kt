package com.oswhgo.wivra

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
import com.pedro.encoder.input.sources.audio.NoAudioSource
import com.pedro.encoder.input.sources.video.NoVideoSource
import com.pedro.encoder.input.sources.video.ScreenSource
import com.pedro.library.rtmp.RtmpStream

/**
 * A user-initiated Android screen/app-window RTMP source for Wivra FULL.
 *
 * This is NOT camera multicapture and currently sends video only. It never
 * attempts protected-content bypass, other-app audio, background microphone,
 * local recording, or a cloud relay. The system picks whole display/app.
 *
 * Android 14+ requires one MediaProjection consent per session, plus an active
 * mediaProjection foreground service BEFORE getMediaProjection(). A revoked
 * projection is terminal: user must confirm a fresh OS capture request.
 */
class WivraScreenLiveService : Service(), ConnectChecker {
    private data class Launch(
        val resultCode: Int, val projectionData: Intent, val rtmpUrl: String
    )

    companion object {
        const val ACTION_START = "com.oswhgo.wivra.screenlive.START"
        const val ACTION_STOP = "com.oswhgo.wivra.screenlive.STOP"
        private const val CHANNEL = "wivra_screen_live"
        private const val NOTIFICATION_ID = 3104
        private val lock = Any()
        private var offered: Launch? = null

        @Volatile var active = false
            private set
        @Volatile var streaming = false
            private set
        @Volatile var statusMessage = "Pantalla LIVE desconectada."
            private set

        // The RTMP stream key and one-use MediaProjection consent stay
        // in memory only. No stream key in Intent extras, prefs, logs,
        // savedInstanceState, notifications, manifest or editor WebView.
        fun offer(resultCode: Int, data: Intent, url: String): Boolean =
            synchronized(lock) {
                if (offered != null || active || !WivraLiveEndpoint.valid(url)) {
                    false
                } else {
                    offered = Launch(resultCode, data, url)
                    statusMessage = "Permiso de pantalla recibido. Iniciando servicio visible."
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

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val channel = NotificationChannel(
            CHANNEL, "Wivra LIVE pantalla", NotificationManager.IMPORTANCE_LOW
        )
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
            .createNotificationChannel(channel)
    }

    private fun notification(): Notification {
        val stopIntent = Intent(this, WivraScreenLiveService::class.java)
            .setAction(ACTION_STOP)
        val stop = PendingIntent.getService(
            this, 701, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
            .setContentTitle("Wivra · pantalla LIVE")
            .setContentText(if (streaming) "Pantalla compartida en LIVE"
                            else "Conectando transmisión de pantalla")
            .setOngoing(true)
            .addAction(Notification.Action.Builder(
                android.R.drawable.ic_media_pause, "Detener pantalla LIVE", stop
            ).build())
            .build()
    }

    private fun showNotification() {
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
            .notify(NOTIFICATION_ID, notification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopCapture("Pantalla LIVE detenida por el usuario.")
                return START_NOT_STICKY
            }
            ACTION_START -> {
                if (active || stopping) return START_NOT_STICKY
                val request = claim()
                if (request == null) {
                    stopCapture("No hay permiso nuevo de pantalla: solicita autorización.")
                    return START_NOT_STICKY
                }
                // Android 14+: startForeground(mediaProjection) MUST run
                // before getMediaProjection() or opening a virtual display.
                try {
                    startForeground(
                        NOTIFICATION_ID, notification(),
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
                    )
                    beginProjection(request)
                } catch (_: Exception) {
                    stopCapture("No fue posible iniciar captura de pantalla. " +
                        "Repite el permiso del sistema y comprueba el dispositivo.")
                }
            }
            else -> {
                stopCapture("Pantalla LIVE sin solicitud autorizada.")
            }
        }
        // A system restart must NOT replay consent or reconnect to LIVE.
        return START_NOT_STICKY
    }

    private fun beginProjection(request: Launch) {
        val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as
            MediaProjectionManager
        val oneUseProjection = manager.getMediaProjection(
            request.resultCode, request.projectionData
        ) ?: error("One-use projection was unavailable")

        projection = oneUseProjection
        val revoked = object : MediaProjection.Callback() {
            override fun onStop() {
                main.post {
                    if (!stopping) {
                        stopCapture("Android canceló la captura de pantalla. " +
                            "Para reanudar debes conceder un nuevo permiso.")
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
        check(stream.prepareAudio(44_100, false, 64_000)) {
            "Silent audio source preparation failed"
        }
        stream.changeVideoSource(
            ScreenSource(applicationContext, oneUseProjection, revoked)
        )
        active = true
        streaming = false
        statusMessage = "Conectando pantalla LIVE al servidor remoto…"
        showNotification()
        reconnect = WivraLiveReconnect()
        runCatching { stream.getStreamClient().setReTries(WivraLiveReconnect.DELAYS_S.size) }
        stream.startStream(request.rtmpUrl)
        // No publication is claimed until onConnectionSuccess().
    }

    private fun stopCapture(reason: String) {
        if (stopping) return
        stopping = true
        active = false
        streaming = false
        withdrawOffer()
        statusMessage = reason
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
        if (!stopping) stopCapture("Pantalla LIVE finalizada por Android.")
        super.onDestroy()
    }

    override fun onConnectionStarted(url: String) {
        // url includes the stream key. Never log/display/pass to UI.
        statusMessage = "El servidor está verificando la conexión de pantalla."
    }
    override fun onConnectionSuccess() {
        main.post {
            if (!active || stopping) return@post
            streaming = true
            reconnect.connected()
            statusMessage = "EN VIVO · pantalla compartida (sin audio ni MP4 local)."
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
                statusMessage = "Conexión perdida. Reintento ${reconnect.attempt} de " +
                    "${WivraLiveReconnect.DELAYS_S.size} en ${delay / 1000} s."
                showNotification()
                return@post
            }
            stopCapture(
            "No se pudo conectar LIVE. No existe copia local; revisa el VOD remoto.")
        }
    }
    override fun onDisconnect() {
        main.post { if (!stopping) stopCapture(
            "LIVE desconectado. La pantalla dejó de compartirse."
        ) }
    }
    override fun onAuthError() {
        main.post { if (!stopping) stopCapture(
            "Clave de LIVE rechazada. La pantalla dejó de compartirse."
        ) }
    }
    override fun onAuthSuccess() { /* no credentials are surfaced */ }
}
