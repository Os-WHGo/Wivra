package com.oswhgo.wivra

import android.Manifest
import android.app.AlertDialog
import android.content.pm.PackageManager
import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import com.pedro.common.ConnectChecker
import com.pedro.encoder.input.sources.audio.NoAudioSource
import com.pedro.encoder.input.sources.audio.MicrophoneSource
import com.pedro.encoder.input.sources.video.Camera2Source
import com.pedro.encoder.input.video.CameraHelper
import com.pedro.library.base.recording.RecordController
import com.pedro.library.rtmp.RtmpStream
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * A first native, user-triggered RTMP/RTMPS publisher in the FULL Wivra app.
 *
 * Phone camera only. Ray-Ban DAT -> RTMP, LIVE scenes and iOS streaming are
 * separate integrations and are NOT claimed by this Activity.
 *
 * Unlike the pure JS preflight, this activity really prepares the Android
 * H.264/AAC encoder, writes a private MP4, and attempts the RTMP connection.
 * No server or relay owned by Wivra, no account sign-in, no analytics.
 * The stream key lives only inside the current Activity (never in logs,
 * preferences, Intent extras, saved instance state or editor JS).
 *
 * For the first beta, streaming stops if the user leaves the screen; this is
 * deliberate. Background publishing needs its own separately authorized FGS.
 */
class WivraPhoneLiveActivity : ComponentActivity(), ConnectChecker {
    private val mediaScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var mediaBusy = false
    private lateinit var preview: SurfaceView
    private lateinit var endpointInput: EditText
    private lateinit var micOption: CheckBox
    private lateinit var audioSourceButton: Button
    private lateinit var localCopyOption: CheckBox
    // W95 (#95): remembered choice for the local MP4 copy (only the mode name is stored).
    private lateinit var archiveModeButton: android.widget.Button
    private var archiveMode = WivraLiveArchivePreference.ASK
    private lateinit var storageHint: TextView
    private lateinit var status: TextView
    private lateinit var startButton: Button
    private lateinit var stopButton: Button
    private lateinit var flipCameraButton: Button
    private var stream: RtmpStream? = null
    private var cameraVideoSource: Camera2Source? = null
    // LIVE scenes (Claude): layers over the camera; sources chosen before going live.
    private lateinit var scenes: WivraLiveSceneController
    // Reconnection budget for this LIVE (Claude, W75); never stores the key.
    private var reconnect = WivraLiveReconnect()
    private var pendingFile: File? = null
    private var saveLocalCopy = false
    private var localCopyFinalized = false
    private var prepared = false
    private var stopping = false
    private var liveRequested = false
    private var connected = false
    private var initiatedByUser = false

    private var awaitingMicPermission = false

    // AudioDeviceInfo ids are only valid for this running app. No persistence.
    private data class ChosenInput(val id: Int, val type: Int, val label: String)
    private var selectedInput: ChosenInput? = null
    private var liveInput: ChosenInput? = null
    private val audioManager by lazy { getSystemService(Context.AUDIO_SERVICE) as AudioManager }
    private var audioCallbackRegistered = false
    private val audioDeviceCallback = object : AudioDeviceCallback() {
        override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
            val expected = liveInput ?: return
            if (removedDevices.none { it.id == expected.id && it.type == expected.type }) return
            // Never silently fall back to phone mic after USB/BT was selected.
            runOnUiThread {
                if (initiatedByUser && !stopping && liveInput == expected) {
                    stopAndReview()
                    setStatus(getString(R.string.live_audio_disconnected))
                }
            }
        }
    }

    private fun discoverInputs(): List<AudioDeviceInfo> = try {
        audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)
            .filter { it.isSource }.sortedWith(compareBy({ it.type }, { it.id }))
    } catch (_: SecurityException) { emptyList() }

    private fun inputLabel(device: AudioDeviceInfo): String = when (device.type) {
        AudioDeviceInfo.TYPE_BUILTIN_MIC -> getString(R.string.live_audio_phone)
        AudioDeviceInfo.TYPE_WIRED_HEADSET -> getString(R.string.live_audio_wired)
        AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_USB_HEADSET ->
            getString(R.string.live_audio_usb)
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BLE_HEADSET ->
            getString(R.string.live_audio_bluetooth)
        else -> getString(R.string.live_audio_other)
    }

    private fun selectedDevice(choice: ChosenInput): AudioDeviceInfo? =
        discoverInputs().firstOrNull { it.id == choice.id && it.type == choice.type }

    private fun updateAudioChoice() {
        if (!::audioSourceButton.isInitialized) return
        val value = selectedInput?.label ?: getString(R.string.live_audio_auto)
        audioSourceButton.text = getString(R.string.live_audio_select_button, value)
        audioSourceButton.isEnabled = micOption.isChecked && !initiatedByUser && !stopping
    }

    private fun showAudioChooser() {
        if (!micOption.isChecked || initiatedByUser || stopping) return
        val devices = discoverInputs()
        val options = arrayOf(getString(R.string.live_audio_auto)) +
            devices.mapIndexed { index, info -> inputLabel(info) + " " + (index + 1) }.toTypedArray()
        val selectedIndex = devices.indexOfFirst {
            it.id == selectedInput?.id && it.type == selectedInput?.type
        }.let { if (it == -1) 0 else it + 1 }
        AlertDialog.Builder(this)
            .setTitle(R.string.live_audio_select_title)
            .setSingleChoiceItems(options, selectedIndex) { dialog, index ->
                selectedInput = if (index == 0) null else {
                    val choice = devices[index - 1]
                    ChosenInput(choice.id, choice.type, options[index])
                }
                if (selectedInput != null && selectedInput?.let { selectedDevice(it) } == null) {
                    selectedInput = null
                    setStatus(getString(R.string.live_audio_unavailable))
                }
                updateAudioChoice()
                dialog.dismiss()
            }
            .setNegativeButton(android.R.string.cancel, null)
            .setNeutralButton(R.string.live_audio_limits_button) { _, _ ->
                AlertDialog.Builder(this).setMessage(R.string.live_audio_preference_only)
                    .setPositiveButton(android.R.string.ok, null).show()
            }
            .show()
    }
    private val storageHandler = Handler(Looper.getMainLooper())
    private val minFreeBytes = 128L * 1024L * 1024L
    private val storageCheck = object : Runnable {
        override fun run() {
            if (!initiatedByUser || stopping) return
            // A full phone must not end an otherwise healthy network LIVE.
            // Stop ONLY the optional local muxer and leave RTMP untouched.
            if (saveLocalCopy && stream?.isRecording == true &&
                applicationContext.filesDir.usableSpace < minFreeBytes) {
                finishLocalCopyForLowStorage()
            }
            storageHandler.postDelayed(this, 10_000L)
        }
    }

    private val cameraPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { allowed ->
        if (allowed) preparePreview()
        else setStatus(getString(R.string.plive_camera_denied))
    }

    private val micPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { allowed ->
        if (awaitingMicPermission) {
            awaitingMicPermission = false
            if (allowed) confirmLive()
            else setStatus(getString(R.string.plive_mic_denied))
        }
    }

    companion object {
        fun validEndpoint(input: String): Boolean = WivraLiveEndpoint.valid(input)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // The endpoint contains a private stream key. Never allow OS
        // screenshots, recents thumbnails, autofill or Activity state backup.
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(18, 18, 18, 18)
        }
        val heading = TextView(this).apply {
            text = getString(R.string.plive_heading)
            textSize = 19f
            isAccessibilityHeading = true   // W87 (Claude): TalkBack heading
        }
        root.addView(heading)
        root.addView(TextView(this).apply {
            text = getString(R.string.plive_intro)
        })
        endpointInput = EditText(this).apply {
            hint = "rtmps://servidor/live/clave"
            inputType = InputType.TYPE_CLASS_TEXT or
                InputType.TYPE_TEXT_VARIATION_PASSWORD or
                InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            isSaveEnabled = false
            setSingleLine(true)
            importantForAutofill = android.view.View.IMPORTANT_FOR_AUTOFILL_NO
            contentDescription = getString(R.string.plive_endpoint_description)
        }
        root.addView(endpointInput)
        micOption = CheckBox(this).apply {
            text = getString(R.string.plive_mic_option)
            isChecked = false
        }
        root.addView(micOption)
        audioSourceButton = Button(this).apply {
            setOnClickListener { showAudioChooser() }
        }
        root.addView(audioSourceButton)
        root.addView(TextView(this).apply {
            text = getString(R.string.live_audio_preference_only)
            textSize = 12f
        })
        updateAudioChoice()
        localCopyOption = CheckBox(this).apply {
            text = getString(R.string.plive_copy_option)
            isChecked = true // Keep the previous safe default until user opts out.
        }
        root.addView(localCopyOption)
        archiveMode = WivraLiveArchiveStore.load(this)
        archiveModeButton = android.widget.Button(this).apply { setOnClickListener { chooseArchiveMode() } }
        root.addView(archiveModeButton)
        applyArchiveMode()
        storageHint = TextView(this).apply { textSize = 13f }
        root.addView(storageHint)
        root.addView(TextView(this).apply {
            text = getString(R.string.plive_long_live_hint)
        })
        localCopyOption.setOnCheckedChangeListener { _, _ -> updateStorageHint() }
        micOption.setOnCheckedChangeListener { _, checked ->
            if (!checked) selectedInput = null
            updateAudioChoice()
            updateStorageHint()
        }
        status = TextView(this).apply {
            text = getString(R.string.plive_idle)
            textSize = 15f
            // W87 (Claude): TalkBack reads connection, reconnection and copy changes.
            accessibilityLiveRegion = android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE
        }
        root.addView(status)
        val controls = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        startButton = Button(this).apply {
            text = getString(R.string.plive_prepare)
            setOnClickListener { requestLive() }
        }
        stopButton = Button(this).apply {
            text = getString(R.string.plive_stop)
            isEnabled = false
            setOnClickListener { stopAndReview() }
        }
        controls.addView(startButton, LinearLayout.LayoutParams(0,
            ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        controls.addView(stopButton, LinearLayout.LayoutParams(0,
            ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        root.addView(controls)
        flipCameraButton = Button(this).apply {
            text = getString(R.string.plive_flip)
            contentDescription = getString(R.string.plive_flip_description)
            isEnabled = false
            setOnClickListener { togglePhoneCamera() }
        }
        root.addView(flipCameraButton)
        scenes = WivraLiveSceneController(this) { initiatedByUser }
        root.addView(scenes.panel)
        root.addView(Button(this).apply {
            text = getString(R.string.plive_review_pending)
            setOnClickListener { reviewPendingVideo() }
        })
        preview = SurfaceView(this).apply { contentDescription = getString(R.string.plive_preview_description) }
        root.addView(preview, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f
        ))
        root.addView(Button(this).apply {
            text = getString(R.string.plive_back_to_editor)
            setOnClickListener { finish() }
        })
        setContentView(root)
        // W83 (Claude): Wivra button look; texts and states unchanged.
        WivraUi.styleAll(root)
        WivraUi.primary(startButton)
        updateStorageHint()
        preview.holder.addCallback(object : SurfaceHolder.Callback {
            override fun surfaceCreated(holder: SurfaceHolder) {
                if (prepared && !stopping && stream?.isOnPreview != true) {
                    runCatching { stream?.startPreview(preview); scenes.reattach() }
                }
                if (!initiatedByUser) startButton.isEnabled = cameraReadyForLive()
            }
            override fun surfaceChanged(holder: SurfaceHolder, format: Int,
                width: Int, height: Int
            ) {
                if (prepared) {
                    runCatching {
                        stream?.getGlInterface()?.setPreviewResolution(width, height)
                    }
                }
            }
            override fun surfaceDestroyed(holder: SurfaceHolder) {
                if (!initiatedByUser) startButton.isEnabled = false
                runCatching { if (stream?.isOnPreview == true) stream?.stopPreview() }
            }
        })
        if (checkSelfPermission(Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED) preparePreview()
        else cameraPermission.launch(Manifest.permission.CAMERA)
    }

    private fun setStatus(message: String) {
        runOnUiThread { if (!isFinishing && !isDestroyed) status.text = message }
    }

    private fun updateStorageHint() {
        if (!::storageHint.isInitialized) return
        val free = applicationContext.filesDir.usableSpace
        val mb = free / (1024 * 1024)
        storageHint.text = if (localCopyOption.isChecked) {
            val reserve = (free - minFreeBytes).coerceAtLeast(0L)
            // Estimated from the configured 1.2 Mbps H264 stream + optional
            // 64 kbps audio. VBR, mux indexes, exports and Photos need more.
            val bitrate = 1_200_000.0 + (if (micOption.isChecked) 64_000.0 else 0.0)
            val estimatedMinutes = (reserve.toDouble() * 8.0 / bitrate / 60.0).toLong()
            getString(R.string.plive_storage_with_copy, mb, estimatedMinutes)
        } else {
            getString(R.string.plive_storage_live_only, mb)
        }
    }

    private fun finishLocalCopyForLowStorage() {
        val publisher = stream ?: return
        if (!saveLocalCopy || !publisher.isRecording) return
        // RootEncoder exposes independent recording and RTMP states.
        // Never call stopStream() from the local-storage watchdog.
        val closed = runCatching { publisher.stopRecord(); true }.getOrDefault(false)
        localCopyFinalized = closed
        if (publisher.isRecording) {
            // RootEncoder may reject the split-stop for a particular device.
            // Do not leave a writer running until the phone is full.
            setStatus(getString(R.string.plive_copy_stop_failed))
            stopAndReview()
            return
        }
        saveLocalCopy = false
        if (publisher.isStreaming) {
            setStatus(if (closed)
                getString(R.string.plive_critical_copy_closed)
            else getString(R.string.plive_critical_copy_unverified)
            )
        } else {
            setStatus(getString(R.string.plive_critical_no_rtmp))
        }
        updateStorageHint()
    }

    private fun togglePhoneCamera() {
        if (!prepared || stopping || mediaBusy || isFinishing || isDestroyed) return
        val source = cameraVideoSource ?: return
        try {
            source.switchCamera()
            val side = getString(if (source.getCameraFacing() == CameraHelper.Facing.FRONT)
                R.string.plive_side_front else R.string.plive_side_back)
            setStatus(getString(if (connected) R.string.plive_camera_selected_live
                else R.string.plive_camera_selected_preview, side))
        } catch (_: Exception) {
            // Some phones cannot open the other camera at the chosen
            // resolution while encoding. Keep the existing publisher alive.
            setStatus(getString(R.string.plive_flip_failed))
        }
    }

    // Native equivalent of the source capability gate: a successful
    // encoder setup alone is not evidence of a usable camera source.
    // No stream or MP4 is allowed to start without a live preview surface
    // and an actual camera permission on this foreground-only screen.
    private fun cameraReadyForLive(): Boolean {
        val publisher = stream ?: return false
        return prepared && !stopping && !isFinishing &&
            checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED &&
            preview.holder.surface.isValid && publisher.isOnPreview
    }

    private fun preparePreview() {
        if (prepared || stream != null || isFinishing) return
        try {
            // Never open the microphone merely because the user previews
            // or selects video-only LIVE. NoAudioSource is an actual no-op
            // source; RootEncoder starts its audioSource during encoding.
            val source = Camera2Source(applicationContext)
            val publisher = RtmpStream(
                applicationContext, this,
                source, NoAudioSource()
            )
            // 4:3 portrait conservative compatibility profile. Not Ray-Ban.
            val videoReady = publisher.prepareVideo(
                640, 480, 1_200_000, fps = 24, rotation = 90
            )
            if (!videoReady) {
                publisher.release()
                setStatus(getString(R.string.plive_encoder_failed))
                return
            }
            cameraVideoSource = source
            stream = publisher
            prepared = true
            flipCameraButton.isEnabled = true
            scenes.bind(publisher)
            if (preview.holder.surface.isValid) {
                publisher.startPreview(preview)
                scenes.reattach()
            }
            setStatus(if (cameraReadyForLive())
                getString(R.string.plive_preview_ready)
                else getString(R.string.plive_preview_waiting)
            )
            startButton.isEnabled = cameraReadyForLive()
        } catch (_: Exception) {
            prepared = false
            cameraVideoSource = null
            flipCameraButton.isEnabled = false
            runCatching { stream?.release() }
            stream = null
            setStatus(getString(R.string.plive_camera_open_failed))
        }
    }

    private fun requestLive() {
        if (mediaBusy) return
        if (!cameraReadyForLive()) {
            setStatus(getString(R.string.plive_camera_not_ready))
            return
        }
        if (!prepared || stopping || initiatedByUser ||
            stream?.isStreaming == true || stream?.isRecording == true) return
        if (!validEndpoint(endpointInput.text.toString())) {
            setStatus(getString(R.string.plive_endpoint_invalid))
            return
        }
        if (micOption.isChecked &&
            checkSelfPermission(Manifest.permission.RECORD_AUDIO) !=
                PackageManager.PERMISSION_GRANTED) {
            awaitingMicPermission = true
            micPermission.launch(Manifest.permission.RECORD_AUDIO)
            return
        }
        confirmLive()
    }

    private fun confirmLive() {
        if (mediaBusy) return
        if (!cameraReadyForLive()) {
            setStatus(getString(R.string.plive_preview_lost))
            return
        }
        if (!prepared || stopping || initiatedByUser || isFinishing) return
        val address = endpointInput.text.toString()
        if (!validEndpoint(address)) return
        val withAudio = micOption.isChecked
        if (withAudio && selectedInput != null &&
            selectedInput?.let { selectedDevice(it) } == null) {
            setStatus(getString(R.string.live_audio_unavailable))
            return
        }
        val saveCopy = localCopyOption.isChecked
        updateStorageHint()
        // A stream-only session does NOT require 128 MiB to reserve a video.
        if (saveCopy && applicationContext.filesDir.usableSpace < minFreeBytes) {
            setStatus(getString(R.string.plive_no_space_copy))
            return
        }
        // W93: say which network carries the stream and, on mobile data or a metered network,
        // how much of the data plan it uses, before anything is sent.
        val liveBps = 1_200_000L + (if (withAudio) 64_000L else 0L)
        val networkLine = WivraLiveNetworkProbe.confirmationLine(this, liveBps) ?: run {
            setStatus(getString(R.string.plive_network_offline))
            return
        }
        val confirmMessage = getString(if (saveCopy) R.string.plive_confirm_with_copy
            else R.string.plive_confirm_without_copy) + "\n\n" + networkLine
        // Never render the private endpoint or stream key in the dialog.
        AlertDialog.Builder(this)
            .setTitle(R.string.plive_confirm_title)
            .setMessage(confirmMessage)
            .setNegativeButton(R.string.plive_cancel, null)
            .setPositiveButton(R.string.plive_start) { _, _ ->
                startLive(address, withAudio, saveCopy)
            }
            .show()
    }

    private fun archiveModeLabel(mode: WivraLiveArchivePreference): String = getString(when (mode) {
        WivraLiveArchivePreference.ALWAYS -> R.string.plive_archive_always
        WivraLiveArchivePreference.ASK -> R.string.plive_archive_ask
        WivraLiveArchivePreference.NEVER -> R.string.plive_archive_never
    })

    private fun applyArchiveMode() {
        localCopyOption.isChecked = if (archiveMode.checkboxEditable) localCopyOption.isChecked else archiveMode.initiallyChecked
        localCopyOption.isEnabled = archiveMode.checkboxEditable && !initiatedByUser
        archiveModeButton.text = getString(R.string.plive_archive_button, archiveModeLabel(archiveMode))
        updateStorageHint()
    }

    private fun chooseArchiveMode() {
        if (initiatedByUser) return
        val modes = WivraLiveArchivePreference.entries
        AlertDialog.Builder(this)
            .setTitle(R.string.plive_archive_title)
            .setSingleChoiceItems(modes.map { archiveModeLabel(it) }.toTypedArray(), modes.indexOf(archiveMode)) { dialog, which ->
                archiveMode = modes[which]
                WivraLiveArchiveStore.save(this, archiveMode)
                if (archiveMode == WivraLiveArchivePreference.ASK) localCopyOption.isChecked = true
                applyArchiveMode()
                dialog.dismiss()
            }
            .setNegativeButton(R.string.plive_cancel, null)
            .show()
    }

    private fun startLive(address: String, withAudio: Boolean, saveCopy: Boolean) {
        if (mediaBusy) return
        val publisher = stream ?: return
        // Recheck after the public confirmation dialog, not only when
        // opening it; the user may have revoked camera permission meanwhile.
        if (!cameraReadyForLive() || initiatedByUser) {
            setStatus(getString(R.string.plive_not_started_camera))
            return
        }
        if (!prepared || stopping || initiatedByUser || isFinishing) return
        if (saveCopy && applicationContext.filesDir.usableSpace < minFreeBytes) {
            setStatus(getString(R.string.plive_no_space_mp4))
            return
        }
        val chosen = if (withAudio) selectedInput else null
        val input = chosen?.let { selectedDevice(it) }
        if (chosen != null && input == null) {
            setStatus(getString(R.string.live_audio_unavailable))
            return
        }
        val pending: File? = try {
            // Apply preference to the SAME RootEncoder AudioRecord, never
            // to a diagnostic recorder unrelated to published audio.
            val microphone = MicrophoneSource()
            publisher.changeAudioSource(
                if (withAudio) microphone else NoAudioSource()
            )
            if (!publisher.prepareAudio(44_100, false, 64_000)) {
                setStatus(getString(R.string.plive_audio_prepare_failed))
                return
            }
            if (input != null && !microphone.setPreferredDevice(input)) {
                setStatus(getString(R.string.live_audio_unavailable))
                return
            }
            if (saveCopy) WivraPhoneMediaStore.createPrivateVideo(applicationContext)
            else null
        } catch (_: Exception) {
            setStatus(getString(R.string.plive_prepare_failed))
            return
        }
        try {
            if (saveCopy && pending != null) {
                publisher.startRecord(
                    pending.absolutePath,
                    if (withAudio) RecordController.RecordTracks.ALL
                        else RecordController.RecordTracks.VIDEO
                ) { newStatus ->
                    if (newStatus == RecordController.Status.RECORDING) {
                        setStatus(getString(R.string.plive_copy_active_connecting))
                    }
                }
            }
            saveLocalCopy = saveCopy && pending != null
            localCopyFinalized = false
            pendingFile = pending
            initiatedByUser = true
            liveInput = chosen
            liveRequested = true
            connected = false
            startButton.isEnabled = false
            stopButton.isEnabled = true
            micOption.isEnabled = false
            updateAudioChoice()
            localCopyOption.isEnabled = false
            archiveModeButton.isEnabled = false
            endpointInput.isEnabled = false
            reconnect = WivraLiveReconnect()
            runCatching { publisher.getStreamClient().setReTries(WivraLiveReconnect.DELAYS_S.size) }
            publisher.startStream(address)
            scenes.reapply() // e.g. the pause scene mutes the mic chosen just now
            storageHandler.removeCallbacks(storageCheck)
            storageHandler.postDelayed(storageCheck, 10_000L)
            // Never log or persist the URL, including on failure.
            endpointInput.text?.clear()
            setStatus(if (saveLocalCopy)
                getString(R.string.plive_connecting_with_copy)
                else getString(R.string.plive_connecting_without_copy)
            )
        } catch (_: Exception) {
            setStatus(getString(R.string.plive_start_failed))
            liveRequested = false
            connected = false
            liveInput = null
            runCatching { if (publisher.isStreaming) publisher.stopStream() }
            if (publisher.isRecording) {
                initiatedByUser = true
                pendingFile = pending
                stopAndReview()
            } else {
                // Only delete a zero-byte private file from a failed start.
                if (pending?.length() == 0L) pending.delete()
                pendingFile = null
                saveLocalCopy = false
                initiatedByUser = false
                controlsIdle()
            }
        }
    }

    private fun controlsIdle() {
        runOnUiThread {
            startButton.isEnabled = cameraReadyForLive() && !mediaBusy
            flipCameraButton.isEnabled = prepared && !isFinishing &&
                !isDestroyed && !mediaBusy && !stopping
            stopButton.isEnabled = false
            micOption.isEnabled = true
            updateAudioChoice()
            localCopyOption.isEnabled = archiveMode.checkboxEditable      // W95: ALWAYS/NEVER keep it locked
            archiveModeButton.isEnabled = true
            endpointInput.isEnabled = true
            updateStorageHint()
        }
    }

    private fun stopAndReview() {
        if (stopping) return
        storageHandler.removeCallbacks(storageCheck)
        stopping = true
        liveRequested = false
        connected = false
        liveInput = null
        val publisher = stream
        val file = pendingFile
        pendingFile = null
        val alreadyFinalized = localCopyFinalized
        localCopyFinalized = false
        runCatching { if (publisher?.isStreaming == true) publisher.stopStream() }
        // A local muxer is optional. Never invent a recording for LIVE-only.
        val muxerClosed = if (publisher?.isRecording == true) {
            runCatching {
                publisher.stopRecord()
                true
            }.getOrDefault(false)
        } else alreadyFinalized
        saveLocalCopy = false
        initiatedByUser = false
        stopping = false
        controlsIdle()
        when {
            file != null && muxerClosed -> reviewFile(file)
            file != null -> setStatus(
                getString(R.string.plive_stopped_copy_uncertified)
            )
            else -> setStatus(
                getString(R.string.plive_stopped_no_copy)
            )
        }
    }

    private fun verifiedMp4(file: File): Boolean {
        // The private phone folder is checked by the existing storage authority.
        if (!WivraPhoneMediaStore.isWivraPrivate(this, file)) return false
        return WivraCaptureMediaVerifier.verifyFile(file, file.parentFile!!).valid
    }

    private fun reviewFile(file: File) {
        if (mediaBusy || isFinishing || isDestroyed) return
        mediaBusy = true
        controlsIdle()
        setStatus(getString(R.string.plive_verifying))
        mediaScope.launch {
            try {
                val valid = withContext(Dispatchers.IO) { verifiedMp4(file) }
                if (isFinishing || isDestroyed || initiatedByUser) return@launch
                if (valid && window.decorView.hasWindowFocus()) askKeep(file)
                else setStatus(getString(R.string.plive_uncertified_kept))
            } finally {
                mediaBusy = false
                if (!isDestroyed) controlsIdle()
            }
        }
    }

    private fun askKeep(file: File) {
        AlertDialog.Builder(this)
            .setTitle(R.string.plive_keep_title)
            .setMessage(R.string.plive_keep_message)
            .setPositiveButton(R.string.plive_keep_save) { _, _ ->
                if (!mediaBusy && !initiatedByUser) {
                    mediaBusy = true
                    controlsIdle()
                    mediaScope.launch {
                        try {
                            withContext(Dispatchers.IO) {
                                check(verifiedMp4(file)) { "MP4 changed before save" }
                                WivraPhoneMediaStore.publish(this@WivraPhoneLiveActivity, file)
                            }
                            setStatus(getString(R.string.plive_saved))
                        } catch (_: Exception) {
                            setStatus(getString(R.string.plive_save_failed))
                        } finally {
                            mediaBusy = false
                            if (!isDestroyed) controlsIdle()
                        }
                    }
                }
            }
            .setNeutralButton(R.string.plive_later, null)
            .setNegativeButton(R.string.plive_delete) { _, _ ->
                AlertDialog.Builder(this)
                    .setTitle(R.string.plive_delete_confirm_title)
                    .setMessage(R.string.plive_delete_confirm_message)
                    .setNegativeButton(R.string.plive_cancel, null)
                    .setPositiveButton(R.string.plive_delete) { _, _ ->
                        runCatching { WivraPhoneMediaStore.discard(this, file) }
                    }.show()
            }.show()
    }

    private fun reviewPendingVideo() {
        if (initiatedByUser || stopping || mediaBusy) return
        val files = WivraPhoneMediaStore.pendingVideos(this)
        if (files.isEmpty()) {
            setStatus(getString(R.string.plive_no_pending))
            return
        }
        val titles = files.map { "${it.name.take(58)} · ${it.length() / 1024} KiB" }
        AlertDialog.Builder(this)
            .setTitle(R.string.plive_pending_title)
            .setItems(titles.toTypedArray()) { _, i ->
                // A stale or invalid file is never claimed as verified.
                reviewFile(files[i])
            }
            .setNegativeButton(R.string.plive_close, null).show()
    }

    override fun onConnectionStarted(url: String) {
        // url includes the stream key. Do not log, display, persist or forward.
        setStatus(getString(R.string.plive_connecting))
    }
    override fun onConnectionSuccess() {
        if (!liveRequested || !initiatedByUser || stopping) return
        connected = true
        reconnect.connected()
        setStatus(if (saveLocalCopy)
            getString(R.string.plive_on_air_with_copy)
            else getString(R.string.plive_on_air_without_copy)
        )
    }
    override fun onConnectionFailed(reason: String) {
        // Some servers embed the full key in error messages.
        if (stopping || !liveRequested) return
        // W75: retry with the address RootEncoder already holds; the local
        // MP4 copy keeps recording meanwhile. `reason` is never shown/logged.
        val delay = reconnect.nextDelayMs()
        if (delay != null && runCatching { stream?.getStreamClient()?.reTry(delay, reason) == true }.getOrDefault(false)) {
            connected = false
            setStatus(getString(if (saveLocalCopy) R.string.plive_reconnect_with_copy else R.string.plive_reconnect,
                reconnect.attempt, WivraLiveReconnect.DELAYS_S.size, (delay / 1000).toInt()))
            return
        }
        liveRequested = false
        connected = false
        runCatching { if (stream?.isStreaming == true) stream?.stopStream() }
        setStatus(when {
            saveLocalCopy -> getString(R.string.plive_failed_copy_continues)
            pendingFile != null -> getString(R.string.plive_failed_copy_pending)
            else -> getString(R.string.plive_failed_no_copy)
        })
    }
    override fun onDisconnect() {
        if (!stopping && initiatedByUser) {
            liveRequested = false
            connected = false
            setStatus(if (saveLocalCopy)
                getString(R.string.plive_disconnected_with_copy)
                else getString(R.string.plive_disconnected_without_copy)
            )
        }
    }
    override fun onAuthError() {
        if (stopping) return
        liveRequested = false
        connected = false
        runCatching { if (stream?.isStreaming == true) stream?.stopStream() }
        setStatus(if (saveLocalCopy)
            getString(R.string.plive_auth_with_copy)
            else getString(R.string.plive_auth_without_copy)
        )
    }
    override fun onAuthSuccess() { /* Never expose credentials. */ }

    override fun onStop() {
        if (audioCallbackRegistered) {
            audioManager.unregisterAudioDeviceCallback(audioDeviceCallback)
            audioCallbackRegistered = false
        }
        // The background UI does not secretly keep broadcasting. Recording
        // finishes privately, and appears in pending review on return.
        if (initiatedByUser || stream?.isStreaming == true ||
            stream?.isRecording == true) {
            stopAndReview()
        }
        runCatching {
            if (stream?.isOnPreview == true) stream?.stopPreview()
        }
        scenes.onHostStop()
        super.onStop()
    }

    override fun onStart() {
        super.onStart()
        if (!audioCallbackRegistered) {
            audioManager.registerAudioDeviceCallback(audioDeviceCallback, Handler(Looper.getMainLooper()))
            audioCallbackRegistered = true
        }
        if (prepared && !isFinishing && preview.holder.surface.isValid &&
            stream?.isOnPreview != true) {
            runCatching { stream?.startPreview(preview); scenes.reattach() }
        }
        if (::startButton.isInitialized && !initiatedByUser) {
            startButton.isEnabled = cameraReadyForLive() && !mediaBusy
        }
    }

    override fun onDestroy() {
        if (audioCallbackRegistered) {
            audioManager.unregisterAudioDeviceCallback(audioDeviceCallback)
            audioCallbackRegistered = false
        }
        storageHandler.removeCallbacks(storageCheck)
        if (initiatedByUser || stream?.isStreaming == true ||
            stream?.isRecording == true) stopAndReview()
        if (::scenes.isInitialized) scenes.release()
        runCatching { stream?.release() }
        stream = null
        cameraVideoSource = null
        prepared = false
        endpointInput.text?.clear()
        mediaScope.cancel()
        super.onDestroy()
    }
}
