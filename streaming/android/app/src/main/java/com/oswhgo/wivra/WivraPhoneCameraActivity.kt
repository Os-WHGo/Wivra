package com.oswhgo.wivra

import android.Manifest
import android.app.AlertDialog
import android.content.ContentValues
import android.content.pm.PackageManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.MediaStore
import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.widget.FrameLayout
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.VideoView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import java.io.File
import java.util.concurrent.Executor

/**
 * Wivra's native PHONE camera for Android, independent from the Meta DAT path.
 *
 * - Local preview/photo and video; explicit mic opt-in for video-with-audio.
 * - Videos are captured in app-private storage, then user chooses Save/Later/
 *   Delete. A network outage never blocks a local video.
 * - Photos/videos that were saved are handed to the SAME Claude editor using
 *   MainActivity's Android system content:// chooser.
 * - Exclusive audio choices: CameraX audio inside MP4 OR independent WAV.
 * - WAV + video use an approximate sync timestamp; no first-frame guarantee.
 * - Neither separate input switching nor LIVE transport is implemented here.
 */
class WivraPhoneCameraActivity : ComponentActivity() {
    companion object {
        const val EXTRA_SHOT_SCRIPT = "com.oswhgo.wivra.director.SHOT_SCRIPT"
    }

    // Local Director text lives ONLY in native overlay widgets, never in the
    // CameraX VideoCapture/ImageCapture input frames or published MP4/JPEG.
    private val teleHandler = Handler(Looper.getMainLooper())
    private lateinit var teleScroll: ScrollView
    private lateinit var teleText: TextView
    private lateinit var telePlay: Button
    private var teleRunning = false
    private var teleWpm = 140
    private var teleSizeSp = 26f
    private var teleLastTickMs = 0L
    private var teleY = 0f
    private val teleTick = object : Runnable {
        override fun run() {
            if (!teleRunning || !::teleScroll.isInitialized) return
            val now = SystemClock.uptimeMillis()
            val dt = ((now - teleLastTickMs).coerceIn(0L, 120L)) / 1000f
            teleLastTickMs = now
            val totalScroll = (teleText.height - teleScroll.height).coerceAtLeast(0)
            val words = teleText.text.split(Regex("\\s+")).count { it.isNotBlank() }
            if (totalScroll > 0 && words > 0) {
                val seconds = words * 60f / teleWpm
                teleY = (teleY + dt * totalScroll / seconds).coerceAtMost(totalScroll.toFloat())
                teleScroll.scrollTo(0, teleY.toInt())
                if (teleY >= totalScroll) {
                    stopTeleprompter()
                    return
                }
            }
            teleHandler.postDelayed(this, 40L)
        }
    }

    private lateinit var viewfinder: PreviewView
    private lateinit var status: TextView
    private lateinit var photoButton: Button
    private lateinit var recordingButton: Button
    private lateinit var pendingButton: Button
    private lateinit var micButton: Button
    private lateinit var switchButton: Button

    private val captureExecutor: Executor by lazy { ContextCompat.getMainExecutor(this) }
    private var provider: ProcessCameraProvider? = null
    private var imageCapture: ImageCapture? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var activeRecording: Recording? = null
    private var currentFile: File? = null
    private var recordingFinishing = false
    private var cameraFront = false
    // 0 = silent MP4; 1 = MP4 with embedded mic; 2 = video-only MP4 + mono WAV
    private var micMode = 0
    private var wavRecorder: WivraPhoneWavRecorder? = null
    private var videoStartNs = 0L
    private var videoFinalized = false
    private var wavFinalized = true
    private var wavWasRequested = false
    private var wavFailed = false
    private var interrupted = false
    private var resumed = false

    private val cameraPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { accepted ->
        if (accepted) bindCamera()
        else message(R.string.phone_camera_permission_denied)
    }
    private val audioPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { accepted ->
        micMode = if (accepted) 1 else 0
        updateMicLabel()
        if (!accepted) message(R.string.phone_camera_mic_denied)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = getString(R.string.phone_camera_title)
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(12, 12, 12, 12)
        }
        val controls = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val firstRow = LinearLayout(this)
        val secondRow = LinearLayout(this)

        val back = button(R.string.back_editor) { safeFinish() }
        switchButton = button(R.string.phone_camera_switch) { changeLens() }
        firstRow.addView(back, weight())
        firstRow.addView(switchButton, weight())
        controls.addView(firstRow)

        photoButton = button(R.string.phone_camera_photo) { capturePhoto() }
        recordingButton = button(R.string.phone_camera_record) { toggleRecording() }
        secondRow.addView(photoButton, weight())
        secondRow.addView(recordingButton, weight())
        controls.addView(secondRow)

        micButton = button(R.string.phone_camera_mic_off) { toggleMic() }
        pendingButton = button(R.string.phone_camera_review_pending) { choosePendingVideo() }
        controls.addView(micButton)
        controls.addView(pendingButton)

        status = TextView(this).apply {
            setText(R.string.phone_camera_intro)
            textSize = 15f
            setPadding(8, 6, 8, 6)
        }
        controls.addView(status)
        val scroll = ScrollView(this).apply { addView(controls) }
        layout.addView(scroll, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT
        ))
        viewfinder = PreviewView(this).apply {
            // TextureView-based preview avoids device-specific SurfaceView Z order
            // that could hide the native Director teleprompter overlay.
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            contentDescription = getString(R.string.phone_camera_preview)
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
        val cameraFrame = FrameLayout(this)
        cameraFrame.addView(viewfinder, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ))
        val shotScript = intent.getStringExtra(EXTRA_SHOT_SCRIPT)
            ?.takeIf { it.length <= 2200 }?.trim()
        if (!shotScript.isNullOrEmpty()) {
            setupTeleprompter(controls, cameraFrame, shotScript)
        }
        layout.addView(cameraFrame, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f
        ))
        setContentView(layout)
        refreshControls()
        requireCamera()
    }

    private fun setupTeleprompter(
        controls: LinearLayout, cameraFrame: FrameLayout, script: String
    ) {
        teleText = TextView(this).apply {
            text = script
            textSize = teleSizeSp
            setTextColor(Color.WHITE)
            setPadding(dp(14), dp(14), dp(14), dp(28))
            contentDescription = getString(R.string.teleprompter_accessible)
        }
        teleScroll = ScrollView(this).apply {
            setBackgroundColor(Color.argb(190, 0, 0, 0))
            isFillViewport = false
            addView(teleText)
            contentDescription = getString(R.string.teleprompter_accessible)
        }
        cameraFrame.addView(teleScroll, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dp(210), Gravity.TOP
        ).apply { setMargins(dp(10), dp(12), dp(10), 0) })
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        telePlay = button(R.string.teleprompter_start) {
            if (teleRunning) stopTeleprompter() else startTeleprompter()
        }
        row.addView(telePlay, weight())
        row.addView(button(R.string.teleprompter_slower) {
            teleWpm = when (teleWpm) { 180 -> 140; else -> 100 }
            message(R.string.teleprompter_wpm, teleWpm)
        }, weight())
        row.addView(button(R.string.teleprompter_faster) {
            teleWpm = when (teleWpm) { 100 -> 140; else -> 180 }
            message(R.string.teleprompter_wpm, teleWpm)
        }, weight())
        controls.addView(row)
        val fonts = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        fonts.addView(button(R.string.teleprompter_smaller) {
            teleSizeSp = (teleSizeSp - 4f).coerceAtLeast(20f)
            teleText.textSize = teleSizeSp
        }, weight())
        fonts.addView(button(R.string.teleprompter_bigger) {
            teleSizeSp = (teleSizeSp + 4f).coerceAtMost(44f)
            teleText.textSize = teleSizeSp
        }, weight())
        fonts.addView(button(R.string.teleprompter_hide) {
            val visible = teleScroll.visibility == View.VISIBLE
            teleScroll.visibility = if (visible) View.GONE else View.VISIBLE
            if (visible) stopTeleprompter()
        }, weight())
        controls.addView(fonts)
    }

    private fun dp(n: Int): Int =
        (n * resources.displayMetrics.density + 0.5f).toInt()

    private fun startTeleprompter() {
        if (!::teleScroll.isInitialized) return
        teleRunning = true
        teleLastTickMs = SystemClock.uptimeMillis()
        teleY = teleScroll.scrollY.toFloat()
        telePlay.setText(R.string.teleprompter_pause)
        teleHandler.removeCallbacks(teleTick)
        teleHandler.post(teleTick)
    }

    private fun stopTeleprompter() {
        teleRunning = false
        teleHandler.removeCallbacks(teleTick)
        if (::telePlay.isInitialized) telePlay.setText(R.string.teleprompter_start)
    }

    private fun weight(): LinearLayout.LayoutParams = LinearLayout.LayoutParams(
        0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f
    )

    private fun button(label: Int, action: () -> Unit): Button =
        Button(this).apply {
            setText(label)
            setOnClickListener { action() }
        }

    private fun message(id: Int, vararg formatArgs: Any) {
        status.text = if (formatArgs.isEmpty()) getString(id)
            else getString(id, *formatArgs)
    }

    private fun hasPermission(name: String) =
        ContextCompat.checkSelfPermission(this, name) == PackageManager.PERMISSION_GRANTED

    private fun requireCamera() {
        if (hasPermission(Manifest.permission.CAMERA)) bindCamera()
        else cameraPermission.launch(Manifest.permission.CAMERA)
    }

    private fun bindCamera() {
        if (!hasPermission(Manifest.permission.CAMERA) || isFinishing) return
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            try {
                provider = future.get()
                val chosen = if (cameraFront)
                    CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA
                val current = requireNotNull(provider)
                if (!current.hasCamera(chosen)) {
                    cameraFront = !cameraFront
                    message(R.string.phone_camera_no_lens)
                    return@addListener
                }
                if (activeRecording != null) return@addListener
                current.unbindAll()
                val preview = Preview.Builder().build().also {
                    it.surfaceProvider = viewfinder.surfaceProvider
                }
                val photo = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY).build()
                val recorder = Recorder.Builder()
                    .setQualitySelector(QualitySelector.from(
                        Quality.FHD, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)
                    )).build()
                val video = VideoCapture.withOutput(recorder)
                try {
                    // Some phones support preview+photo+video in one session.
                    current.bindToLifecycle(this, chosen, preview, photo, video)
                    imageCapture = photo
                } catch (_: IllegalArgumentException) {
                    // Fall back to reliable preview+video on constrained devices.
                    current.unbindAll()
                    current.bindToLifecycle(this, chosen, preview, video)
                    imageCapture = null
                }
                videoCapture = video
                message(if (imageCapture == null) R.string.phone_camera_video_only_device
                    else R.string.phone_camera_ready)
                refreshControls()
            } catch (_: Exception) {
                imageCapture = null
                videoCapture = null
                message(R.string.phone_camera_start_failed)
                refreshControls()
            }
        }, captureExecutor)
    }

    private fun changeLens() {
        if (activeRecording != null || recordingFinishing) {
            message(R.string.phone_camera_stop_before_switch)
            return
        }
        cameraFront = !cameraFront
        bindCamera()
    }

    private fun toggleMic() {
        if (activeRecording != null || recordingFinishing) {
            message(R.string.phone_camera_audio_locked)
            return
        }
        if (micMode == 0 && !hasPermission(Manifest.permission.RECORD_AUDIO)) {
            audioPermission.launch(Manifest.permission.RECORD_AUDIO)
        } else {
            micMode = (micMode + 1) % 3
            updateMicLabel()
        }
    }

    private fun updateMicLabel() {
        micButton.setText(when (micMode) {
            1 -> R.string.phone_camera_mic_on
            2 -> R.string.phone_camera_mic_wav
            else -> R.string.phone_camera_mic_off
        })
    }

    private fun capturePhoto() {
        val capture = imageCapture ?: run {
            message(R.string.phone_camera_photo_unsupported)
            return
        }
        if (!hasPermission(Manifest.permission.CAMERA)) {
            message(R.string.phone_camera_permission_denied)
            return
        }
        photoButton.isEnabled = false
        val output = ImageCapture.OutputFileOptions.Builder(
            contentResolver, MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
            WivraPhoneMediaStore.photoCaptureValues()
        ).build()
        capture.takePicture(output, captureExecutor, object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(outputFileResults: ImageCapture.OutputFileResults) {
                photoButton.isEnabled = true
                message(R.string.phone_camera_photo_saved)
            }
            override fun onError(error: androidx.camera.core.ImageCaptureException) {
                photoButton.isEnabled = true
                message(R.string.phone_camera_photo_failed)
            }
        })
    }

    private fun toggleRecording() {
        if (activeRecording != null) {
            recordingFinishing = true
            recordingButton.isEnabled = false
            message(R.string.phone_camera_finishing)
            activeRecording?.stop()
            wavRecorder?.stop()
        } else if (!recordingFinishing) {
            startRecording()
        }
    }

    private fun startRecording() {
        val video = videoCapture ?: run {
            message(R.string.phone_camera_start_failed)
            return
        }
        if (!hasPermission(Manifest.permission.CAMERA)) {
            requireCamera()
            return
        }
        if (micMode != 0 && !hasPermission(Manifest.permission.RECORD_AUDIO)) {
            micMode = 0
            updateMicLabel()
            message(R.string.phone_camera_mic_denied)
            return
        }
        if (filesDir.usableSpace < 200L * 1024 * 1024) {
            message(R.string.phone_camera_low_space)
            return
        }
        try {
            val privateVideo = WivraPhoneMediaStore.createPrivateVideo(this)
            currentFile = privateVideo
            val pending = video.output.prepareRecording(
                this, FileOutputOptions.Builder(privateVideo).build()
            )
            val configured = if (micMode == 1) pending.withAudioEnabled() else pending
            recordingFinishing = false
            videoFinalized = false
            wavWasRequested = micMode == 2
            wavFinalized = !wavWasRequested
            wavFailed = false
            interrupted = false
            videoStartNs = 0L
            activeRecording = configured.start(captureExecutor) { event ->
                when (event) {
                    is VideoRecordEvent.Start -> {
                        videoStartNs = SystemClock.elapsedRealtimeNanos()
                        if (wavWasRequested && !recordingFinishing) {
                            startSidecarWav(privateVideo)
                        } else if (wavWasRequested) {
                            wavFinalized = true
                            wavFailed = true
                        }
                        message(when {
                            wavWasRequested && wavFailed ->
                                R.string.phone_camera_wav_unavailable
                            micMode == 1 -> R.string.phone_camera_recording_audio
                            micMode == 2 -> R.string.phone_camera_recording_wav
                            else -> R.string.phone_camera_recording_silent
                        })
                        refreshControls()
                    }
                    is VideoRecordEvent.Finalize -> {
                        interrupted = event.hasError()
                        activeRecording = null
                        videoFinalized = true
                        recordingFinishing = true
                        wavRecorder?.stop()
                        completeRecordingWhenReady()
                    }
                }
            }
            refreshControls()
        } catch (_: Exception) {
            activeRecording = null
            recordingFinishing = false
            currentFile = null
            message(R.string.phone_camera_start_failed)
            refreshControls()
        }
    }

    private fun startSidecarWav(video: File) {
        try {
            val recorder = WivraPhoneWavRecorder(WivraPhoneMediaStore.privateWav(this, video))
            wavRecorder = recorder
            recorder.start { result ->
                wavFinalized = true
                wavFailed = !result.usable
                if (result.usable) {
                    try {
                        WivraPhoneMediaStore.saveSidecarTiming(
                            this, video, videoStartNs,
                            result.estimatedFirstReadElapsedRealtimeNs,
                            result.bytesWritten
                        )
                    } catch (_: Exception) {
                        // Never pretend offset is measured if the sidecar record failed.
                        wavFailed = true
                    }
                }
                completeRecordingWhenReady()
            }
        } catch (_: Exception) {
            wavFinalized = true
            wavFailed = true
            wavRecorder = null
            message(R.string.phone_camera_wav_unavailable)
        }
    }

    private fun completeRecordingWhenReady() {
        if (!videoFinalized || !wavFinalized) return
        recordingFinishing = false
        currentFile = null
        wavRecorder = null
        refreshControls()
        message(when {
            interrupted -> R.string.phone_camera_recording_interrupted
            wavWasRequested && wavFailed -> R.string.phone_camera_wav_failed
            else -> R.string.phone_camera_review_pending
        })
        if (resumed) choosePendingVideo()
    }

    private fun refreshControls() {
        if (!::recordingButton.isInitialized) return
        recordingButton.setText(if (activeRecording != null)
            R.string.phone_camera_stop else R.string.phone_camera_record)
        recordingButton.isEnabled = !recordingFinishing && videoCapture != null
        if (::photoButton.isInitialized) photoButton.isEnabled = imageCapture != null
        if (::switchButton.isInitialized)
            switchButton.isEnabled = activeRecording == null && !recordingFinishing
        if (::micButton.isInitialized)
            micButton.isEnabled = activeRecording == null && !recordingFinishing
        if (::pendingButton.isInitialized) {
            pendingButton.isEnabled = activeRecording == null && !recordingFinishing
        }
    }

    private fun choosePendingVideo() {
        val files = try { WivraPhoneMediaStore.pendingVideos(this) }
            catch (_: Exception) { emptyList() }
        if (files.isEmpty()) {
            message(R.string.phone_camera_no_pending)
            return
        }
        val labels = files.map { f ->
            f.name.take(46) + " (" + (f.length() / 1024) + " KB)"
        }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle(R.string.phone_camera_review_pending)
            .setItems(labels) { _, index -> reviewPending(files[index]) }
            .setNegativeButton(R.string.phone_camera_later, null)
            .show()
    }

    private fun reviewPending(file: File) {
        if (!WivraPhoneMediaStore.pendingVideos(this).contains(file)) {
            message(R.string.phone_camera_no_pending)
            return
        }
        val preview = VideoView(this).apply {
            setVideoPath(file.absolutePath) // app-private data, no public URI
            setOnPreparedListener { it.isLooping = false; start() }
            setOnErrorListener { _, _, _ ->
                message(R.string.phone_camera_preview_unavailable)
                true
            }
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.phone_camera_review_pending)
            .setMessage(R.string.phone_camera_private_explanation)
            .setView(preview)
            .setPositiveButton(R.string.recording_keep) { _, _ ->
                try {
                    val wav = WivraPhoneMediaStore.privateWav(this, file)
                    if (wav.exists() && !WivraPhoneMediaStore.hasUsableWav(this, file)) {
                        message(R.string.phone_camera_wav_unusable)
                    } else {
                        if (WivraPhoneMediaStore.hasUsableWav(this, file)) {
                            WivraPhoneMediaStore.publishPair(this, file)
                        } else {
                            WivraPhoneMediaStore.publish(this, file)
                        }
                        message(R.string.phone_camera_saved_to_editor)
                    }
                } catch (_: Exception) {
                    message(R.string.phone_camera_keep_failed)
                }
            }
            .setNeutralButton(R.string.phone_camera_later) { _, _ ->
                message(R.string.recording_remains_pending)
            }
            .setNegativeButton(R.string.recording_discard) { _, _ ->
                AlertDialog.Builder(this)
                    .setTitle(R.string.recording_discard_confirm_title)
                    .setMessage(R.string.phone_camera_confirm_delete)
                    .setPositiveButton(R.string.recording_discard_confirm) { _, _ ->
                        if (WivraPhoneMediaStore.discard(this, file))
                            message(R.string.recording_discarded)
                        else message(R.string.recording_delete_failed)
                    }
                    .setNegativeButton(R.string.phone_camera_later, null).show()
            }
            .setOnDismissListener { preview.stopPlayback() }
            .show()
    }

    private fun safeFinish() {
        if (activeRecording != null || recordingFinishing) {
            message(R.string.phone_camera_stop_before_back)
        } else finish()
    }

    override fun onResume() {
        super.onResume()
        resumed = true
    }

    override fun onPause() {
        stopTeleprompter()
        resumed = false
        super.onPause()
    }

    override fun onStop() {
        // Never record with the phone camera in background without deliberate
        // support; CameraX may finalize an incomplete private recording.
        if (activeRecording != null) {
            recordingFinishing = true
            activeRecording?.stop()
            wavRecorder?.stop()
        }
        super.onStop()
    }

    @Deprecated("Back event")
    override fun onBackPressed() = safeFinish()

    override fun onDestroy() {
        stopTeleprompter()
        if (activeRecording != null) activeRecording?.stop()
        wavRecorder?.stop()
        provider?.unbindAll()
        super.onDestroy()
    }
}
