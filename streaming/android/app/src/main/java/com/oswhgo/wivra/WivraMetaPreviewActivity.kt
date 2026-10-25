package com.oswhgo.wivra

import android.Manifest
import android.app.AlertDialog
import android.content.pm.PackageManager
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.VideoView
import android.widget.MediaController
import android.widget.ImageView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import com.meta.wearable.dat.camera.Camera
import com.meta.wearable.dat.camera.Stream
import com.meta.wearable.dat.camera.addCamera
import com.meta.wearable.dat.camera.types.StreamConfiguration
import com.meta.wearable.dat.camera.types.StreamState
import com.meta.wearable.dat.camera.types.VideoQuality
import com.meta.wearable.dat.core.Wearables
import com.meta.wearable.dat.core.selectors.AutoDeviceSelector
import com.meta.wearable.dat.core.session.DeviceSession
import com.meta.wearable.dat.core.session.DeviceSessionState
import com.meta.wearable.dat.core.types.Permission
import com.meta.wearable.dat.core.types.PermissionStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import java.io.File
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch

/**
 * Wivra Android B1: DAT video stream connection diagnostics inside the one app.
 * Supports local HEVC recording from compressed DAT packets and preview; no audio, upload or LIVE.
 * Every Bluetooth, registration, session and camera action is user-initiated.
 * Based on Meta DAT Android 1.0.1 public APIs, with separate hardware QA.
 */
class WivraMetaPreviewActivity : ComponentActivity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var session: DeviceSession? = null
    private var camera: Camera? = null
    private var stream: Stream? = null
    private var sessionJob: Job? = null
    private var errorJob: Job? = null
    private var framesJob: Job? = null
    private var streamJob: Job? = null
    private var streamErrorJob: Job? = null
    private var decodeJob: Job? = null
    private var frameChannel: Channel<LocalPreviewFrame>? = null
    private var lastPreviewEnqueueMs = 0L
    private var warnedUnsupportedLayout = false
    private var lastFrameReceivedMs = 0L
    private var photoInProgress = false
    private lateinit var photoButton: Button
    private lateinit var imagePreview: ImageView
    private var recordingMode = false
    private var recordingFinalizing = false
    private var pendingRecordingMode = false
    private var recorder: WivraSegmentedHevcRecorder? = null
    private var compressedPackets = 0L
    private var pendingDialogVisible = false
    private lateinit var recordButton: Button
    private lateinit var finishRecordButton: Button

    private data class LocalPreviewFrame(val bytes: ByteArray, val width: Int, val height: Int)
    private var sdkReady = false
    private var frames = 0L
    private lateinit var status: TextView
    private lateinit var phoneNetworkStatus: TextView
    private val connectivityManager by lazy {
        getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    }
    private var networkObserverRegistered = false
    private val networkObserver = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = refreshPhoneNetworkOnUiThread()
        override fun onLost(network: Network) = refreshPhoneNetworkOnUiThread()
        override fun onCapabilitiesChanged(
            network: Network, capabilities: NetworkCapabilities
        ) = refreshPhoneNetworkOnUiThread()
    }

    // Inspect the phone's default OS network; never infer Meta DAT transport,
    // stream readiness or actual upload Mbps from this observation.
    private fun refreshPhoneNetworkOnUiThread() {
        runOnUiThread { if (::phoneNetworkStatus.isInitialized) updatePhoneNetworkStatus() }
    }

    private fun updatePhoneNetworkStatus() {
        val capabilities = connectivityManager.getNetworkCapabilities(
            connectivityManager.activeNetwork
        )
        val transport = when {
            capabilities == null -> R.string.mobile_network_offline
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN) ->
                R.string.mobile_network_vpn
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ->
                R.string.mobile_network_wifi
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) ->
                R.string.mobile_network_cellular
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) ->
                R.string.mobile_network_ethernet
            else -> R.string.mobile_network_other
        }
        val availability = if (capabilities?.hasCapability(
            NetworkCapabilities.NET_CAPABILITY_VALIDATED
        ) == true) R.string.mobile_network_system_validated
            else R.string.mobile_network_unverified
        phoneNetworkStatus.text = getString(
            R.string.mobile_network_summary,
            getString(transport), getString(availability)
        ) + "\n" + getString(R.string.mobile_network_disclaimer)
    }

    private lateinit var registerButton: Button
    private lateinit var connectButton: Button
    private lateinit var previewButton: Button

    private val bluetoothLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { allowed ->
            if (allowed) initializeSdk()
            else show(getString(R.string.bluetooth_denied))
        }

    private val cameraPermissionLauncher =
        registerForActivityResult(Wearables.RequestPermissionContract()) { result ->
            result.onSuccess { permission ->
                if (permission == PermissionStatus.Granted) startStream(pendingRecordingMode)
                else show(getString(R.string.camera_denied))
            }.onFailure { error, _ ->
                show(getString(R.string.permission_error, error.description))
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(28, 24, 28, 24)
        }
        root.addView(TextView(this).apply {
            text = getString(R.string.screen_title)
            textSize = 23f
        })
        status = TextView(this).apply {
            text = getString(R.string.waiting_permission)
            textSize = 16f
            setPadding(0, 20, 0, 20)
        }
        root.addView(status)
        phoneNetworkStatus = TextView(this).apply {
            text = getString(R.string.mobile_network_checking)
            textSize = 13f
            setPadding(0, 0, 0, 12)
        }
        root.addView(phoneNetworkStatus)
        imagePreview = ImageView(this).apply {
            contentDescription = getString(R.string.preview_accessibility)
            scaleType = ImageView.ScaleType.FIT_CENTER
            setBackgroundColor(0xFF151515.toInt())
        }
        root.addView(imagePreview, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            (300 * resources.displayMetrics.density).toInt()
        ))
        registerButton = button(root, getString(R.string.connect_meta)) { registerMeta() }
        connectButton = button(root, getString(R.string.connect_glasses)) { beginSession() }
        previewButton = button(root, getString(R.string.activate_video)) { checkCameraPermission() }
        recordButton = button(root, getString(R.string.record_video_only)) {
            checkCameraPermission(recording = true)
        }
        finishRecordButton = button(root, getString(R.string.stop_save_recording)) {
            finishRecording()
        }
        photoButton = button(root, getString(R.string.capture_photo)) { captureGlassesPhoto() }
        button(root, getString(R.string.disconnect)) { if (recordingMode) finishRecording() else stopAll() }
        button(root, getString(R.string.back_editor)) { if (recordingMode) finishRecording() else { stopAll(); finish() } }
        root.addView(TextView(this).apply {
            text = getString(R.string.preview_disclaimer)
        })
        setContentView(ScrollView(this).apply { addView(root) })
        refreshButtons()
        checkBluetooth()
        window.decorView.post { offerPendingVideo() }
    }

    override fun onStart() {
        super.onStart()
        try {
            if (!networkObserverRegistered) {
                connectivityManager.registerDefaultNetworkCallback(networkObserver)
                networkObserverRegistered = true
            }
            updatePhoneNetworkStatus()
        } catch (_: SecurityException) {
            if (::phoneNetworkStatus.isInitialized) {
                phoneNetworkStatus.text = getString(R.string.mobile_network_unavailable)
            }
        }
    }

    override fun onStop() {
        if (networkObserverRegistered) {
            connectivityManager.unregisterNetworkCallback(networkObserver)
            networkObserverRegistered = false
        }
        super.onStop()
    }

    private fun button(root: LinearLayout, label: String, action: () -> Unit): Button =
        Button(this).also { b ->
            b.text = label
            b.setOnClickListener { action() }
            root.addView(b, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT))
        }

    private fun show(message: String) { status.text = message }
    private fun refreshButtons() {
        registerButton.isEnabled = sdkReady
        connectButton.isEnabled = sdkReady && session == null
        previewButton.isEnabled = session?.state?.value == DeviceSessionState.STARTED && camera == null
        recordButton.isEnabled = session?.state?.value == DeviceSessionState.STARTED &&
            camera == null && !recordingFinalizing
        finishRecordButton.isEnabled = recordingMode && !recordingFinalizing
        photoButton.isEnabled = stream != null && !photoInProgress &&
            lastFrameReceivedMs > 0L &&
            SystemClock.elapsedRealtime() - lastFrameReceivedMs < 4_000L
    }

    private fun checkBluetooth() {
        if (Build.VERSION.SDK_INT >= 31 &&
            checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED
        ) bluetoothLauncher.launch(Manifest.permission.BLUETOOTH_CONNECT)
        else initializeSdk()
    }

    private fun initializeSdk() {
        if (sdkReady) return
        Wearables.initialize(applicationContext)
            .onSuccess {
                sdkReady = true
                show(getString(R.string.sdk_ready))
                refreshButtons()
            }
            .onFailure { error, _ -> show(getString(R.string.sdk_error, error.description)) }
    }

    private fun registerMeta() {
        if (!sdkReady) return
        Wearables.startRegistration(this)
        show(getString(R.string.authorize_meta))
    }

    private fun beginSession() {
        if (!sdkReady || session != null) return
        Wearables.createSession(AutoDeviceSelector())
            .onSuccess { created ->
                session = created
                show(getString(R.string.starting_session))
                refreshButtons()
                sessionJob = scope.launch {
                    created.state.collect { state ->
                        if (state == DeviceSessionState.STOPPED) {
                            if (recordingMode && !recordingFinalizing) {
                                finishRecording()
                            } else if (!recordingFinalizing) {
                                cleanup()
                                show(getString(R.string.session_finished))
                            }
                        } else {
                            show(getString(R.string.session_state, state.toString()))
                            refreshButtons()
                        }
                    }
                }
                errorJob = scope.launch {
                    created.errors.collect { error -> show(getString(R.string.session_error, error.description)) }
                }
                created.start()
            }
            .onFailure { error, _ -> show(getString(R.string.connection_failed, error.description)) }
    }

    private fun checkCameraPermission(recording: Boolean = false) {
        if (session?.state?.value != DeviceSessionState.STARTED || camera != null) {
            show(getString(R.string.wait_session))
            return
        }
        pendingRecordingMode = recording
        scope.launch {
            Wearables.checkPermissionStatus(Permission.CAMERA)
                .onSuccess { permission ->
                    if (permission == PermissionStatus.Granted) startStream(pendingRecordingMode)
                    else cameraPermissionLauncher.launch(Permission.CAMERA)
                }
                .onFailure { error, _ -> show(getString(R.string.permission_check_failed, error.description)) }
        }
    }

    private fun startStream(recording: Boolean = false) {
        val connected = session ?: return
        if (connected.state.value != DeviceSessionState.STARTED || camera != null) return
        connected.addCamera(StreamConfiguration(
            videoQuality = VideoQuality.MEDIUM, frameRate = 24,
            // The video-only MP4 muxer needs the original HEVC stream.
            // Decoded YUV is preserved for normal low-FPS preview mode.
            compressVideo = recording
        ))
            .onSuccess { capability ->
                camera = capability
                recordingMode = recording
                recordingFinalizing = false
                compressedPackets = 0L
                recorder = if (recording) WivraSegmentedHevcRecorder(applicationContext) else null
                if (recording) {
                    // Launch while Activity is visible and the user has just
                    // requested capture. This is a lifecycle foundation only:
                    // DAT ownership remains here until the service migration.
                    try {
                        startForegroundService(Intent(this,
                            WivraCaptureForegroundService::class.java).apply {
                            action = WivraCaptureForegroundService.ACTION_START
                        })
                    } catch (failure: RuntimeException) {
                        show("No se pudo iniciar el servicio de captura: " +
                            (failure.localizedMessage ?: "unknown"))
                    }
                    show(getString(R.string.recording_wait_keyframe))
                    imagePreview.setImageDrawable(null)
                }
                val active = capability.stream
                stream = active
                frames = 0
                lastFrameReceivedMs = 0L
                lastPreviewEnqueueMs = 0L
                warnedUnsupportedLayout = false
                refreshButtons()
                val incoming = Channel<LocalPreviewFrame>(Channel.CONFLATED)
                frameChannel = incoming
                // Separate decoder task: backpressure never grows unbounded and frames
                // are copied while DAT still owns a valid buffer. No remote upload.
                decodeJob = scope.launch(Dispatchers.Default) {
                    for (raw in incoming) {
                        val bitmap = WivraI420PreviewConverter.decode(raw.bytes, raw.width, raw.height)
                        withContext(Dispatchers.Main.immediate) {
                            if (stream !== active) {
                                bitmap?.recycle()
                            } else if (bitmap != null) {
                                imagePreview.setImageBitmap(bitmap)
                            } else if (!warnedUnsupportedLayout) {
                                warnedUnsupportedLayout = true
                                show(getString(R.string.yuv_unsupported))
                            }
                        }
                    }
                }
                // Subscribe before start so the first frame is not missed.
                framesJob = scope.launch(
                    if (recording) Dispatchers.IO else Dispatchers.Main.immediate
                ) {
                    active.videoStream.collect { frame ->
                        if (recording) {
                            if (!frame.isCompressed) return@collect
                            val copied = frame.buffer.duplicate()
                            if (copied.remaining() !in 1..8 * 1024 * 1024) return@collect
                            val bytes = ByteArray(copied.remaining())
                            copied.get(bytes)
                            recorder?.consume(bytes, frame.presentationTimeUs,
                                frame.width, frame.height, frame.isCodecConfig)
                            compressedPackets += 1
                            if (compressedPackets == 1L || compressedPackets % 24L == 0L) {
                                withContext(Dispatchers.Main.immediate) {
                                    show(getString(R.string.recording_frames_checkpoints,
                                        recorder?.samples ?: 0,
                                        recorder?.checkpointCount ?: 0))
                                }
                            }
                            return@collect
                        }
                        frames += 1
                        lastFrameReceivedMs = SystemClock.elapsedRealtime()
                        if (frames == 1L || frames % 24L == 0L) {
                            refreshButtons()
                            show(getString(R.string.frames_status, frames, frame.width, frame.height))
                        }
                        // Limit JPEG preview workload to roughly 6 images/sec. The full
                        // capture stream is never saved or shared with the WebView here.
                        val now = SystemClock.elapsedRealtime()
                        if (now - lastPreviewEnqueueMs >= 160L && !frame.isCompressed) {
                            lastPreviewEnqueueMs = now
                            val expectedPixels = frame.width.toLong() * frame.height.toLong()
                            val expectedBytes = expectedPixels * 3 / 2
                            val copied = frame.buffer.duplicate()
                            // Never allocate an unbounded buffer, especially with corrupted
                            // dimensions or an undocumented YUV plane layout.
                            if (frame.width > 0 && frame.height > 0 &&
                                frame.width % 2 == 0 && frame.height % 2 == 0 &&
                                expectedPixels <= 1280L * 1920L &&
                                copied.remaining().toLong() == expectedBytes) {
                                val bytes = ByteArray(copied.remaining())
                                copied.get(bytes)
                                incoming.trySend(LocalPreviewFrame(bytes, frame.width, frame.height))
                            } else if (!warnedUnsupportedLayout) {
                                warnedUnsupportedLayout = true
                                show(getString(R.string.yuv_mismatch))
                            }
                        }
                    }
                }
                streamJob = scope.launch {
                    active.state.collect { state ->
                        if (state == StreamState.PAUSED) show(getString(R.string.video_paused))
                        if (state == StreamState.CLOSED) {
                            if (recordingMode && !recordingFinalizing) finishRecording()
                            else if (!recordingFinalizing) show(getString(R.string.stream_closed))
                        }
                    }
                }
                streamErrorJob = scope.launch {
                    active.errorStream.collect { error -> show(getString(R.string.stream_failed, error.description)) }
                }
                active.start().onFailure { error, _ ->
                    show(getString(R.string.stream_start_failed, error.description))
                    stopAll()
                }
            }
            .onFailure { error, _ -> show(getString(R.string.camera_failed, error.description)) }
    }

    private fun captureGlassesPhoto() {
        val active = stream ?: return
        if (photoInProgress || lastFrameReceivedMs == 0L ||
            SystemClock.elapsedRealtime() - lastFrameReceivedMs > 4_000L) {
            show(getString(R.string.photo_requires_stream))
            return
        }
        photoInProgress = true
        refreshButtons()
        show(getString(R.string.photo_capture_progress))
        scope.launch {
            try {
                // Stable DAT in-stream snapshot, NOT experimental standalone HQ Photo.
                val picture = active.capturePhoto().getOrThrow()
                val saved = withContext(Dispatchers.IO) {
                    WivraMetaPhotoStore.save(applicationContext, picture)
                }
                if (stream === active) {
                    show(getString(R.string.photo_saved, saved.lastPathSegment ?: ""))
                }
            } catch (failure: Exception) {
                if (stream === active) {
                    show(getString(R.string.photo_save_failed,
                        failure.localizedMessage ?: "unknown"))
                }
            } finally {
                photoInProgress = false
                refreshButtons()
            }
        }
    }

    private fun finishRecording() {
        if (!recordingMode || recordingFinalizing) return
        recordingFinalizing = true
        refreshButtons()
        show(getString(R.string.recording_finalizing))
        val finishingJob = framesJob
        framesJob = null
        scope.launch {
            // The HEVC collector must release the last sample before muxer.stop().
            finishingJob?.cancelAndJoin()
            val pending = withContext(Dispatchers.IO) { recorder?.finishToPending() }
            recorder = null
            stopAll()
            if (pending != null) {
                show(getString(R.string.recording_pending_ready))
                offerPendingVideo()
            } else {
                show(getString(R.string.recording_no_video))
            }
        }
    }

    /**
     * Never discard an unanswered recording just because the dialog was
     * dismissed or the activity was reopened. Pending videos live in filesDir.
     */
    private fun offerPendingVideo() {
        if (pendingDialogVisible || recordingMode || recordingFinalizing || isFinishing) return
        val pending = WivraHevcMp4Recorder.listPendingRecordings(applicationContext)
            .firstOrNull() ?: return
        pendingDialogVisible = true
        val explanation = getString(R.string.recording_pending_explanation) +
            if (pending.parts.size > 1) {
                "\n\n" + getString(R.string.recording_pending_multiple_parts, pending.parts.size)
            } else ""
        val reviewButton = Button(this).apply {
            text = getString(R.string.recording_review_video)
        }
        val decisionDialog = AlertDialog.Builder(this)
            .setTitle(R.string.recording_save_question)
            .setMessage(explanation)
            .setView(reviewButton)
            .setPositiveButton(R.string.recording_keep) { _, _ ->
                scope.launch {
                    val savedCount = withContext(Dispatchers.IO) {
                        pending.parts.count { part ->
                            WivraHevcMp4Recorder.publishPending(applicationContext, part) != null
                        }
                    }
                    show(when {
                        savedCount == pending.parts.size -> getString(R.string.recording_saved)
                        savedCount > 0 -> getString(R.string.recording_partially_saved,
                            savedCount, pending.parts.size)
                        else -> getString(R.string.recording_keep_failed)
                    })
                    if (savedCount > 0) {
                        window.decorView.post { offerPendingVideo() }
                    }
                }
            }
            .setNegativeButton(R.string.recording_discard) { _, _ ->
                confirmDiscardPending(pending)
            }
            .setNeutralButton(R.string.recording_later) { _, _ ->
                show(getString(R.string.recording_remains_pending))
            }
            .setOnDismissListener { pendingDialogVisible = false }
            .create()
        reviewButton.setOnClickListener {
            decisionDialog.dismiss()
            reviewPendingVideo(pending)
        }
        decisionDialog.show()
    }

    /**
     * Review completed, app-owned MP4s ONLY. VideoView reads the private path
     * inside Wivra; never exports a URI, invokes Claude's editor, or changes the
     * pending decision. Each MP4 part is played separately.
     */
    private fun reviewPendingVideo(pending: WivraHevcMp4Recorder.PendingRecording) {
        val clips = WivraHevcMp4Recorder.listPendingRecordings(applicationContext)
            .firstOrNull { it.id == pending.id }?.parts.orEmpty()
        if (clips.isEmpty()) {
            show(getString(R.string.recording_review_unavailable))
            return
        }
        val density = resources.displayMetrics.density
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(16, 8, 16, 8)
        }
        val info = TextView(this)
        layout.addView(info)
        val player = VideoView(this)
        layout.addView(player, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, (260 * density).toInt()
        ))
        val controls = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        val previous = Button(this).apply {
            text = getString(R.string.recording_review_previous)
        }
        val next = Button(this).apply {
            text = getString(R.string.recording_review_next)
        }
        controls.addView(previous, LinearLayout.LayoutParams(0,
            ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        controls.addView(next, LinearLayout.LayoutParams(0,
            ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        layout.addView(controls)
        layout.addView(TextView(this).apply {
            text = getString(R.string.recording_review_disclaimer)
        })
        var index = 0
        val display: () -> Unit = {
            player.stopPlayback()
            info.text = getString(R.string.recording_review_part, index + 1, clips.size)
            previous.isEnabled = index > 0
            next.isEnabled = index < clips.size - 1
            player.setVideoPath(clips[index].absolutePath)
            player.setMediaController(MediaController(this).also {
                it.setAnchorView(player)
            })
            player.setOnPreparedListener { player.start() }
            player.setOnErrorListener { _, _, _ ->
                info.text = info.text.toString() + "\n" +
                    getString(R.string.recording_review_unavailable)
                true
            }
        }
        previous.setOnClickListener {
            if (index > 0) { index--; display() }
        }
        next.setOnClickListener {
            if (index + 1 < clips.size) { index++; display() }
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.recording_review_title)
            .setView(layout)
            .setPositiveButton(R.string.recording_review_close, null)
            .setOnDismissListener {
                player.stopPlayback()
                window.decorView.post { offerPendingVideo() }
            }
            .show()
        display()
    }

    private fun confirmDiscardPending(pending: WivraHevcMp4Recorder.PendingRecording) {
        AlertDialog.Builder(this)
            .setTitle(R.string.recording_discard_confirm_title)
            .setMessage(getString(R.string.recording_discard_confirm_message) +
                if (pending.parts.size > 1) {
                    "\n\n" + getString(R.string.recording_pending_multiple_parts,
                        pending.parts.size)
                } else "")
            .setPositiveButton(R.string.recording_discard_confirm) { _, _ ->
                scope.launch {
                    val deletedCount = withContext(Dispatchers.IO) {
                        pending.parts.count { part ->
                            WivraHevcMp4Recorder.discardPending(applicationContext, part)
                        }
                    }
                    show(if (deletedCount == pending.parts.size)
                         getString(R.string.recording_discarded)
                         else getString(R.string.recording_delete_failed))
                    if (deletedCount > 0) window.decorView.post { offerPendingVideo() }
                }
            }
            .setNegativeButton(R.string.recording_later) { _, _ ->
                show(getString(R.string.recording_remains_pending))
            }
            .show()
    }

    private fun cleanup() {
        stopService(Intent(this, WivraCaptureForegroundService::class.java))
        recorder?.discard()
        recorder = null
        recordingMode = false
        recordingFinalizing = false
        compressedPackets = 0L
        framesJob?.cancel(); framesJob = null
        decodeJob?.cancel(); decodeJob = null
        frameChannel?.close(); frameChannel = null
        lastFrameReceivedMs = 0L
        photoInProgress = false
        if (::imagePreview.isInitialized) imagePreview.setImageDrawable(null)
        streamJob?.cancel(); streamJob = null
        streamErrorJob?.cancel(); streamErrorJob = null
        sessionJob?.cancel(); sessionJob = null
        errorJob?.cancel(); errorJob = null
        stream = null
        camera?.close(); camera = null
        session = null
        refreshButtons()
    }

    private fun stopAll() {
        session?.stop()
        cleanup()
        show(getString(R.string.disconnected))
    }

    override fun onDestroy() {
        // Best effort on normal Android activity destruction. Android can kill
        // a process without invoking onDestroy: crash-safe segments are a
        // separate milestone and must not be claimed as already implemented.
        val unfinished = recorder
        if (unfinished != null) {
            // Transfer ownership before cleanup: cleanup() must never discard
            // the very recorder being finalized asynchronously.
            recorder = null
            val collector = framesJob
            framesJob = null
            CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                // Wait until DAT packet collection has stopped before closing muxer.
                collector?.cancelAndJoin()
                runCatching { unfinished.finishToPending() }
            }
        }
        stopAll()
        scope.cancel()
        super.onDestroy()
    }
}
