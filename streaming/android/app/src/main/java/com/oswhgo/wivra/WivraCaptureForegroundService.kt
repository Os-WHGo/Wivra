package com.oswhgo.wivra

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.IBinder
import android.os.PowerManager
import android.os.SystemClock
import com.meta.wearable.dat.camera.Camera
import com.meta.wearable.dat.camera.Stream
import com.meta.wearable.dat.camera.addCamera
import com.meta.wearable.dat.camera.types.StreamConfiguration
import com.meta.wearable.dat.camera.types.StreamState
import com.meta.wearable.dat.camera.types.VideoQuality
import com.meta.wearable.dat.core.session.DeviceSession
import com.meta.wearable.dat.core.session.DeviceSessionState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext

/**
 * Owner of the user-initiated Meta DAT capture after Activity -> Service handoff.
 *
 * No phone CAMERA or microphone capture is started here. The service consumes
 * only the explicitly authorized external DAT HEVC stream; independently
 * playable MP4 checkpoints remain in private storage until user publication.
 * Background survival still requires device QA, especially when the OS kills
 * the process or the glasses disconnect.
 */
class WivraCaptureForegroundService : Service() {
    enum class CaptureState { IDLE, CONNECTING, RECORDING, PAUSED, FINALIZING, FAILED }
    data class CaptureProgress(
        val receivedPackets: Long = 0L,
        val muxedSamples: Int = 0,
        val savedCheckpoints: Int = 0
    )

    companion object {
        const val ACTION_START = "com.oswhgo.wivra.capture.START"
        const val ACTION_STOP = "com.oswhgo.wivra.capture.STOP"
        private const val CHANNEL = "wivra_capture"
        private const val NOTIFICATION_ID = 3001
        private val handoffLock = Any()
        private var offeredSession: DeviceSession? = null
        @Volatile var captureState = CaptureState.IDLE
            private set
        private val mutableCaptureUpdates = MutableStateFlow(CaptureState.IDLE)
        val captureUpdates: StateFlow<CaptureState> = mutableCaptureUpdates.asStateFlow()
        private val mutableCaptureProgress = MutableStateFlow(CaptureProgress())
        val captureProgress: StateFlow<CaptureProgress> = mutableCaptureProgress.asStateFlow()
        private val mutableCaptureIssue = MutableStateFlow<String?>(null)
        val captureIssue: StateFlow<String?> = mutableCaptureIssue.asStateFlow()

        private fun setCaptureState(next: CaptureState) {
            captureState = next
            mutableCaptureUpdates.value = next
        }

        fun isCaptureActive(): Boolean = captureState == CaptureState.CONNECTING ||
            captureState == CaptureState.RECORDING || captureState == CaptureState.PAUSED ||
            captureState == CaptureState.FINALIZING

        // Service and Activity are in the same app process. No serializing an
        // SDK object through Intent or persisting a stale session on disk.
        fun offerSession(session: DeviceSession): Boolean = synchronized(handoffLock) {
            if (isCaptureActive() || offeredSession != null) false
            else {
                offeredSession = session
                mutableCaptureProgress.value = CaptureProgress()
                mutableCaptureIssue.value = null
                setCaptureState(CaptureState.CONNECTING)
                true
            }
        }

        fun withdrawSession(session: DeviceSession) = synchronized(handoffLock) {
            if (offeredSession === session) {
                offeredSession = null
                setCaptureState(CaptureState.IDLE)
            }
        }

        private fun claimSession(): DeviceSession? = synchronized(handoffLock) {
            val session = offeredSession
            offeredSession = null
            session
        }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var session: DeviceSession? = null
    private var camera: Camera? = null
    private var stream: Stream? = null
    private var recorder: WivraSegmentedHevcRecorder? = null
    private var sessionJob: Job? = null
    private var errorJob: Job? = null
    private var streamJob: Job? = null
    private var streamErrorJob: Job? = null
    private var packetsJob: Job? = null
    // Retain ownership until the finalizer actually closes the muxer. If
    // Service.onDestroy races with finalization, it must be able to rescue it.
    private var finalizingRecorder: WivraSegmentedHevcRecorder? = null
    private var finalizingPacketsJob: Job? = null
    private var finishing = false
    private var packetCount = 0L
    private var firstFrameWatchdog: Job? = null
    private var streamHealthWatchdog: Job? = null
    @Volatile private var lastMuxedSampleAtMs = 0L
    private var lastSamplesTotal = 0
    private var streamEverActive = false
    private var lastNotifiedCheckpoint = -1
    private var cpuLock: PowerManager.WakeLock? = null

    // A foreground service alone does not prevent the phone CPU from sleeping.
    // A bounded lease is refreshed only while real HEVC samples arrive.
    // If glasses go silent, the 90-second lease expires automatically.
    private fun renewCpuLease() {
        try {
            if (cpuLock == null) {
                cpuLock = getSystemService(PowerManager::class.java)
                    .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Wivra:RayBanCapture")
                    .apply { setReferenceCounted(false) }
            }
            cpuLock?.acquire(90_000L)
        } catch (_: RuntimeException) {
            // Never claim that CPU protection is guaranteed on every OEM.
        }
    }

    private fun releaseCpuLease() {
        runCatching { if (cpuLock?.isHeld == true) cpuLock?.release() }
        cpuLock = null
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(CHANNEL, "Wivra Capture", NotificationManager.IMPORTANCE_LOW)
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                // Must be promoted promptly while the user is in the foreground.
                // FGS type is connectedDevice: DAT accesses an external wearable.
                try {
                    startForeground(NOTIFICATION_ID, captureNotification())
                } catch (failure: RuntimeException) {
                    // The Activity has already relinquished DAT ownership.
                    // A denied foreground start must not orphan that session.
                    mutableCaptureIssue.value =
                        "Android rechazó el servicio de captura: " +
                        (failure.localizedMessage ?: "sin detalles")
                    runCatching { claimSession()?.stop() }
                    setCaptureState(CaptureState.FAILED)
                    stopSelf(startId)
                    return START_NOT_STICKY
                }
                if (session == null && !finishing) {
                    val handedOff = claimSession()
                    if (handedOff == null) {
                        mutableCaptureIssue.value = "No se pudo recuperar una sesión Ray-Ban activa."
                        setCaptureState(CaptureState.FAILED)
                        stopSelf()
                    } else {
                        session = handedOff
                        observeSession(handedOff)
                    }
                }
            }
            ACTION_STOP -> {
                // STOP may arrive before ACTION_START has claimed the handoff.
                // Release that offered session instead of leaving CONNECTING
                // stuck with an inaccessible DAT connection.
                if (session == null) {
                    runCatching { claimSession()?.stop() }
                }
                finalizeCapture()
            }
        }
        return START_NOT_STICKY
    }

    private fun captureNotification(): Notification {
        val open = PendingIntent.getActivity(
            this, 0,
            Intent(this, WivraMetaPreviewActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val stop = PendingIntent.getService(
            this, 1,
            Intent(this, WivraCaptureForegroundService::class.java).apply {
                action = ACTION_STOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.presence_video_online)
            .setContentTitle("Wivra · Ray-Ban")
            .setContentText(when (captureState) {
                CaptureState.RECORDING -> "Grabando MP4 · " +
                    mutableCaptureProgress.value.savedCheckpoints + " segmentos seguros"
                CaptureState.PAUSED -> "Ray-Ban en pausa. MP4 previos conservados."
                CaptureState.FINALIZING -> "Cerrando último MP4. Conserva la grabación."
                else -> "Conectando gafas. Esperando video válido..."
            })
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(
                android.R.drawable.ic_media_pause, "Detener y conservar MP4", stop
            ).build())
            .setOngoing(true)
            .build()
    }

    private fun observeSession(active: DeviceSession) {
        sessionJob = scope.launch {
            active.state.collect { state ->
                when (state) {
                    DeviceSessionState.STARTED -> attachCamera(active)
                    DeviceSessionState.PAUSED -> {
                        if (!finishing) setCaptureState(CaptureState.PAUSED)
                    }
                    DeviceSessionState.STOPPED -> finalizeCapture()
                    else -> Unit
                }
            }
        }
        errorJob = scope.launch {
            active.errors.collect {
                mutableCaptureIssue.value = "La conexión Meta DAT notificó un error. Revisa los MP4 guardados."
                finalizeCapture()
            }
        }
        // The session is already STARTED when the Activity hands it off.
        // StateFlow delivers its current state to the new owner.
    }

    private fun attachCamera(active: DeviceSession) {
        if (camera != null || finishing) return
        active.addCamera(StreamConfiguration(
            videoQuality = VideoQuality.MEDIUM,
            frameRate = 24,
            compressVideo = true
        )).onSuccess { capability ->
            if (finishing) {
                capability.close()
                return@onSuccess
            }
            camera = capability
            val activeStream = capability.stream
            stream = activeStream
            val muxer = WivraSegmentedHevcRecorder(applicationContext)
            recorder = muxer
            packetCount = 0L
            lastSamplesTotal = 0
            streamEverActive = false
            lastMuxedSampleAtMs = 0L
            lastNotifiedCheckpoint = -1
            renewCpuLease()
            // No silent "recording" state if DAT never delivers a keyframe.
            // A timeout also releases the CPU lease and service notification.
            firstFrameWatchdog = scope.launch {
                var activeWaitMs = 0L
                while (!finishing && recorder === muxer && muxer.samples < 2) {
                    delay(5_000L)
                    // A user-initiated glasses pause is not a failed startup.
                    // Count only active waiting time, not paused time.
                    if (captureState != CaptureState.PAUSED) activeWaitMs += 5_000L
                    if (activeWaitMs >= 45_000L &&
                        !finishing && recorder === muxer && muxer.samples < 2) {
                        mutableCaptureIssue.value =
                            "Ray-Ban no entregó video válido tras 45 segundos activos. " +
                            "Se conservan los MP4 completados."
                        finalizeCapture()
                        break
                    }
                }
            }

            // If DAT delivers a few frames then silently stalls, do not
            // leave a fake active recording or hold battery indefinitely.
            // A deliberate Meta PAUSED stream is exempt and can resume.
            streamHealthWatchdog = scope.launch {
                while (!finishing && recorder === muxer) {
                    delay(15_000L)
                    val last = lastMuxedSampleAtMs
                    if (!finishing && captureState == CaptureState.RECORDING &&
                        last > 0L && SystemClock.elapsedRealtime() - last >= 75_000L) {
                        mutableCaptureIssue.value =
                            "Ray-Ban dejó de enviar video durante 75 segundos. " +
                            "Se conservarán los MP4 completos."
                        finalizeCapture()
                        break
                    }
                }
            }

            // Subscribe BEFORE starting the stream. The Activity may be
            // stopped or destroyed; the collection job belongs to this Service.
            packetsJob = scope.launch(Dispatchers.IO) {
                try {
                    activeStream.videoStream.collect { frame ->
                        if (!frame.isCompressed) return@collect
                        val packet = frame.buffer.duplicate()
                        if (packet.remaining() !in 1..8 * 1024 * 1024) return@collect
                        val bytes = ByteArray(packet.remaining())
                        packet.get(bytes)
                        muxer.consume(bytes, frame.presentationTimeUs,
                            frame.width, frame.height, frame.isCodecConfig)
                        packetCount++
                        val samples = muxer.samples
                        val wroteSample = samples > lastSamplesTotal
                        if (wroteSample) {
                            lastSamplesTotal = samples
                            lastMuxedSampleAtMs = SystemClock.elapsedRealtime()
                        }
                        if (packetCount == 1L || packetCount % 24L == 0L ||
                            (samples >= 2 && captureState == CaptureState.CONNECTING)) {
                            val progress = CaptureProgress(
                                packetCount, samples, muxer.checkpointCount
                            )
                            withContext(Dispatchers.Main.immediate) {
                                mutableCaptureProgress.value = progress
                                if (samples >= 2 &&
                                    active.state.value != DeviceSessionState.PAUSED &&
                                    activeStream.state.value != StreamState.PAUSED &&
                                    (captureState == CaptureState.CONNECTING ||
                                        captureState == CaptureState.PAUSED)) {
                                    mutableCaptureIssue.value = null
                                    setCaptureState(CaptureState.RECORDING)
                                }
                                // Only refresh the notification after the first
                                // valid sample or a completed 30-second MP4 part.
                                if (samples >= 2 &&
                                    (lastNotifiedCheckpoint < 0 ||
                                        progress.savedCheckpoints > lastNotifiedCheckpoint)) {
                                    lastNotifiedCheckpoint = progress.savedCheckpoints
                                    // POST_NOTIFICATIONS can be denied: never
                                    // sacrifice the MP4 stream for a UI update.
                                    runCatching {
                                        getSystemService(NotificationManager::class.java).notify(
                                            NOTIFICATION_ID, captureNotification()
                                        )
                                    }
                                }
                            }
                        }
                        // Refresh the lease ONLY with newly muxed samples.
                        // Repeated codec headers must never keep the CPU awake.
                        if (wroteSample && samples % 24 == 0) {
                            renewCpuLease()
                        }
                    }
                } catch (_: Exception) {
                    withContext(Dispatchers.Main.immediate) { finalizeCapture() }
                }
            }
            streamJob = scope.launch {
                activeStream.state.collect { state ->
                    when (state) {
                        StreamState.STREAMING -> streamEverActive = true
                        StreamState.PAUSED -> {
                            if (!finishing) setCaptureState(CaptureState.PAUSED)
                        }
                        StreamState.STOPPED -> {
                            // The initial STOPPED state is normal before start().
                            // A terminal stop after actual streaming is not.
                            if (streamEverActive) {
                                mutableCaptureIssue.value =
                                    "La transmisión Ray-Ban se detuvo. " +
                                    "Los segmentos MP4 cerrados se conservan."
                                finalizeCapture()
                            }
                        }
                        StreamState.CLOSED -> {
                            mutableCaptureIssue.value =
                                "Se cerró la transmisión Ray-Ban. " +
                                "Los MP4 completados se conservan."
                            finalizeCapture()
                        }
                        else -> Unit
                    }
                }
            }
            streamErrorJob = scope.launch {
                activeStream.errorStream.collect { error ->
                    // DAT can emit recoverable STREAM_ERROR when a user pauses.
                    // State, not an arbitrary error event, determines teardown.
                    mutableCaptureIssue.value =
                        "Meta DAT: " + error.description +
                        ". Se conservan los MP4 completados."
                }
            }
            activeStream.start()
                // A successful start only means DAT accepted the request.
                // RECORDING is reported after MP4 accepts a real sample.
                .onFailure { _, _ ->
                    mutableCaptureIssue.value = "Meta DAT rechazó iniciar la transmisión."
                    finalizeCapture()
                }
        }.onFailure { _, _ ->
            mutableCaptureIssue.value = "Meta DAT no autorizó conectar la cámara."
            finalizeCapture()
        }
    }

    private fun finalizeCapture() {
        if (finishing) return
        finishing = true
        firstFrameWatchdog?.cancel()
        firstFrameWatchdog = null
        streamHealthWatchdog?.cancel()
        streamHealthWatchdog = null
        setCaptureState(CaptureState.FINALIZING)
        val lastRecorder = recorder
        recorder = null
        val lastPacketsJob = packetsJob
        packetsJob = null
        finalizingRecorder = lastRecorder
        finalizingPacketsJob = lastPacketsJob

        scope.launch {
            try {
                // A recorder cannot be closed while the stream still feeds it.
                lastPacketsJob?.cancelAndJoin()
                withContext(Dispatchers.IO) { lastRecorder?.finishToPending() }
            } catch (_: Exception) {
                // Earlier checkpoint MP4 files are already finalized privately.
                setCaptureState(CaptureState.FAILED)
            } finally {
                streamJob?.cancel()
                streamErrorJob?.cancel()
                sessionJob?.cancel()
                errorJob?.cancel()
                runCatching { camera?.close() }
                runCatching { session?.stop() }
                finalizingRecorder = null
                finalizingPacketsJob = null
                stream = null
                camera = null
                session = null
                // Keep the bounded CPU lease until the muxer and DAT session
                // have fully closed, including when the screen is locked.
                releaseCpuLease()
                if (captureState != CaptureState.FAILED) setCaptureState(CaptureState.IDLE)
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
    }

    override fun onDestroy() {
        // Normal ACTION_STOP finalizes before stopSelf(). If destruction
        // interrupts an active finalizer, a separate IO owner rescues its
        // last MP4. Already finalized checkpoint parts remain untouched.
        // Process death skips onDestroy and cannot be guaranteed here.
        firstFrameWatchdog?.cancel()
        streamHealthWatchdog?.cancel()
        val unclaimed = claimSession()
        val abandoned = recorder ?: finalizingRecorder
        val collector = packetsJob ?: finalizingPacketsJob
        val activeCamera = camera
        val activeSession = session ?: unclaimed
        recorder = null
        finalizingRecorder = null
        if (abandoned != null) {
            // Keep FINALIZING visible until the rescue has really completed.
            // The UI must not miss a pending MP4 by checking too early.
            setCaptureState(CaptureState.FINALIZING)
            CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                try {
                    collector?.cancelAndJoin()
                    runCatching { abandoned.finishToPending() }
                } finally {
                    runCatching { activeCamera?.close() }
                    runCatching { activeSession?.stop() }
                    // Keep the processor awake until the final pending MP4
                    // has been closed, even when the UI is not visible.
                    releaseCpuLease()
                    setCaptureState(CaptureState.IDLE)
                }
            }
        } else {
            runCatching { activeCamera?.close() }
            runCatching { activeSession?.stop() }
            releaseCpuLease()
            setCaptureState(CaptureState.IDLE)
        }
        scope.cancel()
        super.onDestroy()
    }
}
