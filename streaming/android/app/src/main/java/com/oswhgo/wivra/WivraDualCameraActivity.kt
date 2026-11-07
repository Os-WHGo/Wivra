package com.oswhgo.wivra

import android.Manifest
import android.app.AlertDialog
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.os.Bundle
import android.os.SystemClock
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.Camera
import androidx.camera.core.CameraInfo
import androidx.camera.core.CameraSelector
import androidx.camera.core.CameraState
import androidx.camera.core.CompositionSettings
import androidx.camera.core.ConcurrentCamera.SingleCameraConfig
import androidx.camera.core.Preview
import androidx.camera.core.UseCaseGroup
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.FallbackStrategy
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import java.io.File
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Two phone cameras at once, composed by CameraX into ONE MP4 with a
 * Picture-in-Picture inset (CameraX 1.5 concurrent camera + CompositionSettings).
 *
 * - Two cameras are offered only when THIS phone reports a concurrent pair
 *   (ProcessCameraProvider.availableConcurrentCameraInfos). Otherwise, or if
 *   binding fails, Wivra records with one camera and says why.
 * - One audio source: the phone microphone embedded in the MP4, or silence.
 * - If a camera is lost while recording, the current file is closed (it keeps
 *   every frame up to the loss) and recording continues as a NEW take with the
 *   remaining camera. Takes with bytes are never deleted automatically.
 * - Takes stay private (same pending folder as the phone camera) until the
 *   owner saves them to the gallery.
 * Not verified on a physical phone yet. — Claude
 */
class WivraDualCameraActivity : ComponentActivity() {
    private enum class Role { PRIMARY, SECONDARY }

    private data class Take(val file: File, var status: WivraMulticamPolicy.TakeStatus?, val dual: Boolean)

    private lateinit var viewfinder: PreviewView
    private lateinit var status: TextView
    private lateinit var recordButton: Button
    private lateinit var cornerButton: Button
    private lateinit var swapButton: Button
    private lateinit var soundButton: Button
    private lateinit var takesButton: Button

    private val uiExecutor by lazy { ContextCompat.getMainExecutor(this) }
    private val verifyExecutor: ExecutorService = Executors.newSingleThreadExecutor()
    private var provider: ProcessCameraProvider? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var boundCameras: List<Camera> = emptyList()
    private var primaryInfo: CameraInfo? = null
    private var secondaryInfo: CameraInfo? = null
    private var singleSelector: CameraSelector? = null
    private var dual = false
    private var forceSingle = false
    private var frontIsPrimary = false
    private var corner = WivraMulticamPolicy.Corner.BOTTOM_RIGHT
    private var wantSound = false
    private var bindGeneration = 0
    private var lossHandledGeneration = -1

    private var activeRecording: Recording? = null
    private var currentTake: Take? = null
    private var finishing = false
    private var ownerStopped = false
    private var continueWith: CameraSelector? = null
    private val takes = mutableListOf<Take>()

    private val cameraPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) startProvider() else message(R.string.phone_camera_permission_denied)
    }
    private val micPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        wantSound = granted
        if (!granted) message(R.string.phone_camera_mic_denied)
        refreshControls()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        title = getString(R.string.dual_camera_title)
        viewfinder = PreviewView(this).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            contentDescription = getString(R.string.dual_camera_title)
        }
        status = TextView(this).apply {
            // Camera loss, fallback and take results are announced by TalkBack.
            accessibilityLiveRegion = android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE
            setPadding(dp(12), dp(8), dp(12), dp(8))
            textSize = 15f
        }
        recordButton = button(R.string.dual_camera_record) { toggleRecording() }
        cornerButton = button(R.string.dual_camera_corner) { moveInset() }
        swapButton = button(R.string.dual_camera_swap) { swapCameras() }
        soundButton = button(R.string.dual_camera_sound_off) { toggleSound() }
        takesButton = button(R.string.dual_camera_takes) { showTakes() }
        val inventoryButton = button(R.string.dual_camera_inventory) { showInventory() }

        val row1 = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(recordButton, weight()); addView(soundButton, weight())
        }
        val row2 = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(cornerButton, weight()); addView(swapButton, weight())
        }
        val row3 = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            addView(takesButton, weight()); addView(inventoryButton, weight())
        }
        val frame = FrameLayout(this).apply {
            addView(viewfinder, FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER))
        }
        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(frame, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
            addView(status); addView(row1); addView(row2); addView(row3)
        })
        // W83 (Claude): Wivra button look; texts and states unchanged.
        WivraUi.styleAll(row1); WivraUi.styleAll(row2); WivraUi.styleAll(row3)
        WivraUi.primary(recordButton)
        wantSound = hasPermission(Manifest.permission.RECORD_AUDIO)
        refreshControls()
        if (hasPermission(Manifest.permission.CAMERA)) startProvider()
        else cameraPermission.launch(Manifest.permission.CAMERA)
    }

    private fun dp(n: Int): Int = (n * resources.displayMetrics.density).toInt()
    private fun weight() = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
    private fun button(label: Int, action: () -> Unit) = Button(this).apply {
        setText(label); setOnClickListener { action() }
    }
    private fun message(id: Int, vararg args: Any) { status.text = getString(id, *args) }
    private fun hasPermission(name: String) =
        ContextCompat.checkSelfPermission(this, name) == PackageManager.PERMISSION_GRANTED

    private fun startProvider() {
        val future = ProcessCameraProvider.getInstance(this)
        future.addListener({
            provider = try { future.get() } catch (_: Exception) { null }
            if (provider == null) message(R.string.phone_camera_start_failed) else bindCameras()
        }, uiExecutor)
    }

    /** Back + front from a pair THIS phone reports; null when there is none. */
    private fun findPair(p: ProcessCameraProvider): Pair<CameraInfo, CameraInfo>? {
        val sets = try { p.availableConcurrentCameraInfos } catch (_: Exception) { emptyList() }
        for (infos in sets) {
            val back = try { CameraSelector.DEFAULT_BACK_CAMERA.filter(infos).firstOrNull() } catch (_: Exception) { null }
            val front = try { CameraSelector.DEFAULT_FRONT_CAMERA.filter(infos).firstOrNull() } catch (_: Exception) { null }
            if (back != null && front != null)
                return if (frontIsPrimary) front to back else back to front
        }
        return null
    }

    private fun composition(c: WivraMulticamPolicy.Composition): CompositionSettings =
        CompositionSettings.Builder()
            .setAlpha(1.0f)
            .setOffset(c.offsetX, c.offsetY)
            .setScale(c.scale, c.scale)
            .build()

    private fun bindCameras() {
        val p = provider ?: return
        bindGeneration += 1
        boundCameras.forEach { it.cameraInfo.cameraState.removeObservers(this) }
        p.unbindAll()
        boundCameras = emptyList()
        primaryInfo = null; secondaryInfo = null
        dual = false
        // Same 16:9 strategy for preview and video, as CameraX recommends for
        // composition, so the inset is not stretched.
        val ratio = ResolutionSelector.Builder()
            .setAspectRatioStrategy(AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY)
            .build()
        val preview = Preview.Builder().setResolutionSelector(ratio).build()
        preview.setSurfaceProvider(viewfinder.surfaceProvider)
        val recorder = Recorder.Builder()
            .setQualitySelector(QualitySelector.from(
                Quality.FHD, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)))
            .build()
        val video = VideoCapture.withOutput(recorder)
        videoCapture = video

        val pair = if (!forceSingle && singleSelector == null) findPair(p) else null
        if (pair != null) {
            try {
                val group = UseCaseGroup.Builder().addUseCase(preview).addUseCase(video).build()
                val inset = WivraMulticamPolicy.composition(WivraMulticamPolicy.pipRect(corner))
                // Bind order = z-order: the inset camera goes second (on top).
                val concurrent = p.bindToLifecycle(listOf(
                    SingleCameraConfig(pair.first.cameraSelector, group,
                        composition(WivraMulticamPolicy.FULL_FRAME), this),
                    SingleCameraConfig(pair.second.cameraSelector, group, composition(inset), this)
                ))
                boundCameras = concurrent.cameras
                primaryInfo = pair.first; secondaryInfo = pair.second
                dual = true
                message(R.string.dual_camera_ready)
            } catch (_: Exception) {
                // IllegalArgumentException / UnsupportedOperationException:
                // not a supported combination right now. One camera instead.
                p.unbindAll()
                message(R.string.dual_camera_bind_failed)
            }
        }
        if (!dual) {
            val selector = singleSelector ?: if (frontIsPrimary)
                CameraSelector.DEFAULT_FRONT_CAMERA else CameraSelector.DEFAULT_BACK_CAMERA
            try {
                val camera = p.bindToLifecycle(this, selector, preview, video)
                boundCameras = listOf(camera)
                primaryInfo = camera.cameraInfo
                if (pair == null && singleSelector == null && !forceSingle) message(R.string.dual_camera_single_fallback)
            } catch (_: Exception) {
                videoCapture = null
                message(R.string.dual_camera_all_lost)
            }
        }
        observeCameras()
        refreshControls()
    }

    private fun observeCameras() {
        val generation = bindGeneration
        boundCameras.forEachIndexed { index, camera ->
            val role = if (index == 0) Role.PRIMARY else Role.SECONDARY
            camera.cameraInfo.cameraState.observe(this) { state ->
                val error = state.error ?: return@observe
                if (generation != bindGeneration) return@observe
                // Recoverable errors while opening are retried by CameraX.
                val lost = error.type == CameraState.ErrorType.CRITICAL ||
                    state.type == CameraState.Type.CLOSED
                if (lost) onCameraLost(role, generation)
            }
        }
    }

    /** See multicamReduce('camera-lost') in core/multicam-plan.mjs. */
    private fun onCameraLost(role: Role, generation: Int) {
        if (lossHandledGeneration == generation) return
        lossHandledGeneration = generation
        val remaining: CameraInfo? = if (dual) {
            if (role == Role.PRIMARY) secondaryInfo else primaryInfo
        } else null
        val recording = activeRecording
        if (recording != null) {
            continueWith = if (WivraMulticamPolicy.shouldContinueAfterLoss(
                    if (remaining != null) 1 else 0, ownerStopped)) remaining?.cameraSelector else null
            finishing = true
            recording.stop() // Finalize continues with the remaining camera.
            message(if (remaining != null) R.string.dual_camera_lost else R.string.dual_camera_all_lost)
        } else if (remaining != null) {
            singleSelector = remaining.cameraSelector
            bindCameras()
            message(R.string.dual_camera_lost_preview)
        } else {
            message(R.string.dual_camera_all_lost)
        }
        refreshControls()
    }

    private fun toggleRecording() {
        val recording = activeRecording
        if (recording != null) {
            ownerStopped = true
            continueWith = null
            finishing = true
            recording.stop()
            refreshControls()
        } else startRecording(continuation = false)
    }

    private fun startRecording(continuation: Boolean) {
        val video = videoCapture ?: run { message(R.string.phone_camera_start_failed); return }
        if (!WivraMulticamPolicy.hasRoomForTake(filesDir.usableSpace)) {
            message(R.string.phone_camera_low_space); return
        }
        val file = try { WivraPhoneMediaStore.createPrivateVideo(this) } catch (_: Exception) {
            message(R.string.phone_camera_start_failed); return
        }
        val take = Take(file, null, dual)
        try {
            val pending = video.output.prepareRecording(this, FileOutputOptions.Builder(file).build())
            val configured = if (wantSound && hasPermission(Manifest.permission.RECORD_AUDIO))
                pending.withAudioEnabled() else pending
            ownerStopped = false
            finishing = false
            currentTake = take
            takes.add(take)
            activeRecording = configured.start(uiExecutor) { event ->
                when (event) {
                    is VideoRecordEvent.Start -> message(
                        if (continuation) R.string.dual_camera_recording_continued
                        else R.string.dual_camera_recording)
                    is VideoRecordEvent.Finalize -> onFinalized(take)
                }
            }
        } catch (_: Exception) {
            if (file.isFile && file.length() == 0L) file.delete()
            takes.remove(take)
            currentTake = null
            activeRecording = null
            message(R.string.phone_camera_start_failed)
        }
        refreshControls()
    }

    private fun onFinalized(take: Take) {
        activeRecording = null
        currentTake = null
        finishing = false
        val next = continueWith
        continueWith = null
        // Continue first (shortest gap), verify the closed file in background.
        if (next != null && !isFinishing && !isDestroyed) {
            singleSelector = next
            bindCameras()
            if (videoCapture != null) startRecording(continuation = true)
        }
        val root = take.file.parentFile
        if (verifyExecutor.isShutdown) return // Screen closed: the take stays pending.
        verifyExecutor.execute {
            val bytes = if (take.file.isFile) take.file.length() else 0L
            val verified = bytes > 0 && root != null &&
                WivraCaptureMediaVerifier.verifyFile(take.file, root).valid
            val result = WivraMulticamPolicy.classifyTake(bytes, verified)
            if (result == WivraMulticamPolicy.TakeStatus.EMPTY && bytes == 0L) take.file.delete()
            uiExecutor.execute {
                take.status = result
                if (activeRecording == null) message(when (result) {
                    WivraMulticamPolicy.TakeStatus.KEPT -> R.string.dual_camera_take_kept
                    WivraMulticamPolicy.TakeStatus.NEEDS_REVIEW -> R.string.dual_camera_take_review
                    WivraMulticamPolicy.TakeStatus.EMPTY -> R.string.dual_camera_take_empty
                })
                refreshControls()
            }
        }
        refreshControls()
    }

    private fun moveInset() {
        corner = corner.next()
        bindCameras()
    }

    /** Also retries two cameras after a fallback to one. */
    private fun swapCameras() {
        frontIsPrimary = !frontIsPrimary
        singleSelector = null
        lossHandledGeneration = -1
        bindCameras()
    }

    private fun toggleSound() {
        if (wantSound) { wantSound = false; refreshControls(); return }
        if (hasPermission(Manifest.permission.RECORD_AUDIO)) { wantSound = true; refreshControls() }
        else micPermission.launch(Manifest.permission.RECORD_AUDIO)
    }

    private fun refreshControls() {
        if (!::recordButton.isInitialized) return
        val idle = activeRecording == null && !finishing
        recordButton.setText(if (activeRecording != null) R.string.dual_camera_stop else R.string.dual_camera_record)
        recordButton.isEnabled = !finishing && videoCapture != null
        cornerButton.isEnabled = idle && dual
        swapButton.isEnabled = idle
        soundButton.isEnabled = idle
        soundButton.setText(if (wantSound) R.string.dual_camera_sound_on else R.string.dual_camera_sound_off)
        takesButton.isEnabled = idle && takes.any { it.file.isFile && it.file.length() > 0L }
    }

    private fun showTakes() {
        val ready = takes.filter { it.file.isFile && it.file.length() > 0L }
        if (ready.isEmpty()) return
        val labels = ready.mapIndexed { i, t ->
            val kind = getString(if (t.dual) R.string.dual_camera_take_dual else R.string.dual_camera_take_single)
            val state = getString(when (t.status) {
                WivraMulticamPolicy.TakeStatus.KEPT -> R.string.dual_camera_state_verified
                WivraMulticamPolicy.TakeStatus.NEEDS_REVIEW -> R.string.dual_camera_state_review
                else -> R.string.dual_camera_state_checking
            })
            "${i + 1}. $kind · $state · ${t.file.length() / 1024} KB"
        }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle(R.string.dual_camera_takes)
            .setItems(labels) { _, index -> saveTake(ready[index]) }
            .setNegativeButton(R.string.phone_camera_later) { _, _ -> message(R.string.dual_camera_pending_hint) }
            .show()
    }

    private fun saveTake(take: Take) {
        AlertDialog.Builder(this)
            .setTitle(R.string.dual_camera_save)
            .setMessage(R.string.dual_camera_pending_hint)
            .setPositiveButton(R.string.dual_camera_save) { _, _ ->
                verifyExecutor.execute {
                    val ok = try { WivraPhoneMediaStore.publish(this, take.file); true } catch (_: Exception) { false }
                    uiExecutor.execute {
                        if (ok) takes.remove(take)
                        message(if (ok) R.string.dual_camera_saved else R.string.dual_camera_save_failed)
                        refreshControls()
                    }
                }
            }
            .setNegativeButton(R.string.phone_camera_later, null)
            .show()
    }

    /** What THIS phone reports through Camera2, shown as-is (diagnostic). */
    private fun showInventory() {
        val text = try { describeInventory(this) } catch (_: Exception) { getString(R.string.dual_camera_pairs_none) }
        AlertDialog.Builder(this)
            .setTitle(R.string.dual_camera_inventory)
            .setMessage(text)
            .setPositiveButton(android.R.string.ok, null)
            .show()
    }

    private fun describeInventory(context: Context): String {
        val manager = context.getSystemService(CameraManager::class.java)
        val facing = { id: String ->
            when (manager.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING)) {
                CameraCharacteristics.LENS_FACING_BACK -> getString(R.string.dual_camera_facing_back)
                CameraCharacteristics.LENS_FACING_FRONT -> getString(R.string.dual_camera_facing_front)
                CameraCharacteristics.LENS_FACING_EXTERNAL -> getString(R.string.dual_camera_facing_external)
                else -> "?"
            }
        }
        val lines = manager.cameraIdList.map { id -> "• $id · ${facing(id)}" }.toMutableList()
        val pairs = manager.concurrentCameraIds.filter { it.size >= 2 }
        if (pairs.isEmpty()) lines += getString(R.string.dual_camera_pairs_none)
        else pairs.forEach { set ->
            lines += getString(R.string.dual_camera_pair, set.joinToString(" + ") { "$it (${facing(it)})" })
        }
        return lines.joinToString("\n")
    }

    override fun onStop() {
        // Leaving the screen closes the take cleanly; nothing restarts in background.
        activeRecording?.let {
            ownerStopped = true
            continueWith = null
            finishing = true
            it.stop()
        }
        super.onStop()
    }

    override fun onBackPressed() {
        if (activeRecording != null || finishing) message(R.string.phone_camera_stop_before_back)
        else finish()
    }

    override fun onDestroy() {
        activeRecording?.stop()
        activeRecording = null
        verifyExecutor.shutdown()
        super.onDestroy()
    }
}
