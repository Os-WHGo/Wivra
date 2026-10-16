package com.oswhgo.wivra

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
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
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch

/**
 * Wivra Android B1: DAT video stream connection diagnostics inside the one app.
 * Shows an explicitly throttled visual preview; no recording, audio, upload or LIVE.
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

    private data class LocalPreviewFrame(val bytes: ByteArray, val width: Int, val height: Int)
    private var sdkReady = false
    private var frames = 0L
    private lateinit var status: TextView
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
                if (permission == PermissionStatus.Granted) startStream()
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
        photoButton = button(root, getString(R.string.capture_photo)) { captureGlassesPhoto() }
        button(root, getString(R.string.disconnect)) { stopAll() }
        button(root, getString(R.string.back_editor)) { stopAll(); finish() }
        root.addView(TextView(this).apply {
            text = getString(R.string.preview_disclaimer)
        })
        setContentView(ScrollView(this).apply { addView(root) })
        refreshButtons()
        checkBluetooth()
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
                            cleanup()
                            show(getString(R.string.session_finished))
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

    private fun checkCameraPermission() {
        if (session?.state?.value != DeviceSessionState.STARTED || camera != null) {
            show(getString(R.string.wait_session))
            return
        }
        scope.launch {
            Wearables.checkPermissionStatus(Permission.CAMERA)
                .onSuccess { permission ->
                    if (permission == PermissionStatus.Granted) startStream()
                    else cameraPermissionLauncher.launch(Permission.CAMERA)
                }
                .onFailure { error, _ -> show(getString(R.string.permission_check_failed, error.description)) }
        }
    }

    private fun startStream() {
        val connected = session ?: return
        if (connected.state.value != DeviceSessionState.STARTED || camera != null) return
        connected.addCamera(StreamConfiguration(videoQuality = VideoQuality.MEDIUM, frameRate = 24))
            .onSuccess { capability ->
                camera = capability
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
                framesJob = scope.launch {
                    active.videoStream.collect { frame ->
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
                        if (state == StreamState.CLOSED) show(getString(R.string.stream_closed))
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

    private fun cleanup() {
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
        stopAll()
        scope.cancel()
        super.onDestroy()
    }
}
