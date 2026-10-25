package com.oswhgo.wivra

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder

/**
 * Foreground lifecycle foundation for external Ray-Ban DAT capture.
 *
 * IMPORTANT: the DAT session is still owned by WivraMetaPreviewActivity.
 * This service does not claim to keep recording alive after Activity destruction.
 * Moving the DAT session, frame collector and HEVC recorder into this service
 * is required before pocket mode can be marked functional.
 */
class WivraCaptureForegroundService : Service() {
    companion object {
        const val ACTION_START = "com.oswhgo.wivra.capture.START"
        const val ACTION_STOP = "com.oswhgo.wivra.capture.STOP"
        private const val CHANNEL = "wivra_capture"
        private const val NOTIFICATION_ID = 3001
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL, "Wivra Capture", NotificationManager.IMPORTANCE_LOW)
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val open = Intent(this, WivraMetaPreviewActivity::class.java).apply {
                    addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                }
                val pending = PendingIntent.getActivity(
                    this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                val notification = Notification.Builder(this, CHANNEL)
                    .setSmallIcon(android.R.drawable.presence_video_online)
                    .setContentTitle("Wivra Capture")
                    .setContentText("Servicio Wivra activo. Abre la app para controlar la captura.")
                    .setContentIntent(pending)
                    .setOngoing(true)
                    .build()
                startForeground(NOTIFICATION_ID, notification)
                return START_NOT_STICKY
            }
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }
}
