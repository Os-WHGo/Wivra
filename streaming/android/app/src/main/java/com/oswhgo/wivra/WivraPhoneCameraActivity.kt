package com.oswhgo.wivra

import android.Manifest
import android.app.AlertDialog
import android.content.ContentValues
import android.content.pm.PackageManager
import android.os.Bundle
import android.provider.MediaStore
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
 * - No LIVE publisher and no separate audio track in this component yet.
 */
class WivraPhoneCameraActivity : ComponentActivity() {
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
    private var micEnabled = false
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
        micEnabled = accepted
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
            contentDescription = getString(R.string.phone_camera_preview)
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
        layout.addView(viewfinder, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f
        ))
        setContentView(layout)
        refreshControls()
        requireCamera()
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
        if (micEnabled) {
            micEnabled = false
            updateMicLabel()
        } else if (hasPermission(Manifest.permission.RECORD_AUDIO)) {
            micEnabled = true
            updateMicLabel()
        } else {
            audioPermission.launch(Manifest.permission.RECORD_AUDIO)
        }
    }

    private fun updateMicLabel() {
        micButton.setText(if (micEnabled) R.string.phone_camera_mic_on
            else R.string.phone_camera_mic_off)
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
        if (micEnabled && !hasPermission(Manifest.permission.RECORD_AUDIO)) {
            micEnabled = false
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
            val configured = if (micEnabled) pending.withAudioEnabled() else pending
            recordingFinishing = false
            activeRecording = configured.start(captureExecutor) { event ->
                when (event) {
                    is VideoRecordEvent.Start -> {
                        message(if (micEnabled) R.string.phone_camera_recording_audio
                            else R.string.phone_camera_recording_silent)
                        refreshControls()
                    }
                    is VideoRecordEvent.Finalize -> {
                        // Keep any nonempty private partial file for human review
                        // even when CameraX reports a write or interruption error.
                        activeRecording = null
                        recordingFinishing = false
                        currentFile = null
                        refreshControls()
                        if (event.hasError())
                            message(R.string.phone_camera_recording_interrupted)
                        else
                            message(R.string.phone_camera_review_pending)
                        if (resumed) choosePendingVideo()
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
                    WivraPhoneMediaStore.publish(this, file)
                    message(R.string.phone_camera_saved_to_editor)
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
        resumed = false
        super.onPause()
    }

    override fun onStop() {
        // Never record with the phone camera in background without deliberate
        // support; CameraX may finalize an incomplete private recording.
        if (activeRecording != null) {
            recordingFinishing = true
            activeRecording?.stop()
        }
        super.onStop()
    }

    @Deprecated("Back event")
    override fun onBackPressed() = safeFinish()

    override fun onDestroy() {
        if (activeRecording != null) activeRecording?.stop()
        provider?.unbindAll()
        super.onDestroy()
    }
}
