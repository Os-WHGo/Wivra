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
import android.view.Gravity
import android.view.View
import android.graphics.Color
import android.widget.FrameLayout
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
import com.meta.wearable.dat.core.types.RegistrationState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import java.io.File
import android.widget.CheckBox
import android.widget.EditText
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
    private var metaRegistrationJob: Job? = null
    private var availableDevicesJob: Job? = null
    private var capabilityRefreshJob: Job? = null
    private var metaRegistrationWarningJob: Job? = null
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
    private var deferCaptureServiceStop = false
    private var pendingDialogVisible = false
    // Capture identity is private to this Activity instance. If Android recreates
    // it during pocket recording, fail closed rather than credit an unknown take.
    private var directorPendingBeforeCapture: Set<String>? = null
    private val directorPartialSaves = mutableSetOf<String>()
    private lateinit var recordButton: Button
    private lateinit var finishRecordButton: Button

    private data class LocalPreviewFrame(val bytes: ByteArray, val width: Int, val height: Int)
    private var sdkReady = false
    private var frames = 0L
    // Ray-Ban profiles shared with iPhone (WivraDatProfiles.kt / streaming/contracts/dat-profiles.json).
    private var activeDatProfile = WivraDatProfile.DEFAULT
    private var datStats = WivraDatStreamStats(WivraDatProfile.DEFAULT.fps)
    private var datSuggestion: WivraDatProfile? = null
    private var lastSuggestionMs = -1_000_000L
    private var datThermal = false
    private lateinit var datProfileButton: Button
    private lateinit var datDiagnostic: TextView
    private lateinit var datSuggestionButton: Button
    // Ray-Ban «solo vídeo» + independent microphone (never the glasses' HFP microphone). — Claude
    private lateinit var datAudioButton: Button
    private lateinit var datHfpStatus: TextView
    private var recordingAudioChoice = WivraRayBanSync.Choice.OFF
    private var recordingAudioDevice = -1
    private var audioThen: ((WivraRayBanSync.Choice, Int) -> Unit)? = null
    // Ray-Ban → LIVE on the existing engine (full package only; null otherwise). — Claude
    private val rayBanLive: WivraRayBanLive? by lazy { WivraRayBanLiveFactory.create() }
    private var liveButton: Button? = null
    private var lookButton: Button? = null
    private var liveRunning = false
    private var liveCopy: File? = null
    private var liveAudioDeviceId = -1
    private val liveAudioWatch = object : android.media.AudioDeviceCallback() {
        override fun onAudioDevicesRemoved(removed: Array<out android.media.AudioDeviceInfo>) {
            // The chosen microphone vanished: LIVE goes on muted, never on another microphone.
            if (liveRunning && removed.any { it.id == liveAudioDeviceId }) {
                rayBanLive?.muteMicrophone()
                show(getString(R.string.rblive_mic_lost))
            }
        }
    }
    private lateinit var status: TextView
    private lateinit var datCapabilityStatus: TextView
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

    private val notificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            // Notifications are optional for FGS operation, but a denied
            // permission can hide the stop action from the notification drawer.
            resolveRecordingAudio(::startCaptureWithAudio)
        }

    private val audioPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { allowed ->
            if (allowed) resolveRecordingAudio(audioThen ?: ::startCaptureWithAudio)
            else offerVideoOnly(getString(R.string.dat_audio_no_permission), emptyList(), audioThen ?: ::startCaptureWithAudio)
        }

    private val cameraPermissionLauncher =
        registerForActivityResult(Wearables.RequestPermissionContract()) { result ->
            result.onSuccess { permission ->
                if (permission == PermissionStatus.Granted) {
                    if (pendingRecordingMode) startServiceCapture() else startStream(false)
                }
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
        datCapabilityStatus = TextView(this).apply {
            text = "Meta DAT: comprobando capacidades..."
            textSize = 12f
            setPadding(0, 0, 0, 12)
        }
        root.addView(datCapabilityStatus)
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
        val previewHeight = (300 * resources.displayMetrics.density).toInt()
        val previewFrame = FrameLayout(this)
        previewFrame.addView(imagePreview, FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, previewHeight
        ))
        // Director sends only a user-selected script, never a media path.
        // This ScrollView is placed OVER the native UI preview. The HEVC
        // recorder consumes DAT packets, not the screen, so the script
        // is never burnt into video saved from the glasses.
        val shotScript = intent.getStringExtra(
            WivraPhoneCameraActivity.EXTRA_SHOT_SCRIPT
        )?.takeIf { it.length in 1..2200 && it.isNotBlank() }?.trim()
        if (!shotScript.isNullOrEmpty()) {
            val prompt = ScrollView(this).apply {
                setBackgroundColor(Color.argb(192, 0, 0, 0))
                contentDescription = "Guion del Director, solo visible en pantalla"
            }
            prompt.addView(TextView(this).apply {
                text = shotScript
                textSize = 24f
                setTextColor(Color.WHITE)
                setPadding(14, 8, 14, 12)
            })
            previewFrame.addView(prompt, FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                (125 * resources.displayMetrics.density).toInt(), Gravity.BOTTOM
            ))
            button(root, "Mostrar / ocultar guion del Director") {
                prompt.visibility = if (prompt.visibility == View.VISIBLE) {
                    View.GONE
                } else View.VISIBLE
            }
        }
        root.addView(previewFrame, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, previewHeight
        ))
        registerButton = button(root, getString(R.string.connect_meta)) { registerMeta() }
        connectButton = button(root, getString(R.string.connect_glasses)) { beginSession() }
        datProfileButton = button(root, "") { chooseDatProfile() }
        datDiagnostic = TextView(this).apply { textSize = 12f; visibility = View.GONE }
        root.addView(datDiagnostic)
        datSuggestionButton = button(root, "") { applyDatSuggestion() }
        datSuggestionButton.visibility = View.GONE
        refreshDatProfileButton()
        datAudioButton = button(root, "") { chooseDatAudio() }
        datHfpStatus = TextView(this).apply { textSize = 12f }
        root.addView(datHfpStatus)
        refreshDatAudio()
        if (rayBanLive != null) {
            liveButton = button(root, getString(R.string.rblive_start_button)) {
                if (liveRunning) stopRayBanLive(review = true) else requestRayBanLive()
            }
            lookButton = button(root, "") { chooseLook() }
            refreshLookButton()
        }
        previewButton = button(root, getString(R.string.activate_video)) { checkCameraPermission() }
        recordButton = button(root, getString(R.string.record_video_only)) {
            checkCameraPermission(recording = true)
        }
        finishRecordButton = button(root, getString(R.string.stop_save_recording)) {
            if (WivraCaptureForegroundService.isCaptureActive()) stopServiceCapture()
            else finishRecording()
        }
        photoButton = button(root, getString(R.string.capture_photo)) { captureGlassesPhoto() }
        button(root, getString(R.string.disconnect)) {
            when {
                WivraCaptureForegroundService.isCaptureActive() -> stopServiceCapture()
                recordingMode -> finishRecording()
                else -> stopAll()
            }
        }
        button(root, getString(R.string.back_editor)) {
            if (WivraCaptureForegroundService.isCaptureActive()) {
                // Leaving the UI must NOT stop a user-initiated pocket recording.
                finish()
            } else if (recordingMode) finishRecording()
            else { stopAll(); finish() }
        }
        root.addView(TextView(this).apply {
            text = getString(R.string.preview_disclaimer)
        })
        setContentView(ScrollView(this).apply { addView(root) })
        WivraUi.styleAll(root)   // W83 (Claude): Wivra button look
        refreshButtons()
        // The service owns DAT while recording. Its lifecycle events, not
        // Activity.onStop(), decide when Stop/Connect and pending clips appear.
        scope.launch {
            WivraCaptureForegroundService.captureUpdates.collect { state ->
                refreshButtons()
                when (state) {
                    WivraCaptureForegroundService.CaptureState.CONNECTING ->
                        show(getString(R.string.starting_session))
                    WivraCaptureForegroundService.CaptureState.FINALIZING ->
                        show(getString(R.string.recording_finalizing))
                    WivraCaptureForegroundService.CaptureState.FAILED ->
                        show(WivraCaptureForegroundService.captureIssue.value ?:
                            "Captura interrumpida. Revisa los MP4 pendientes.")
                    WivraCaptureForegroundService.CaptureState.IDLE -> {
                        WivraCaptureForegroundService.captureIssue.value?.let { show(it) }
                        if (!sdkReady && window.decorView.hasWindowFocus()) checkBluetooth()
                        if (window.decorView.hasWindowFocus()) {
                            window.decorView.post { offerPendingVideo() }
                        }
                    }
                    WivraCaptureForegroundService.CaptureState.PAUSED ->
                        show("Ray-Ban en pausa. Los MP4 confirmados permanecen guardados.")
                    WivraCaptureForegroundService.CaptureState.RECORDING ->
                        show("Grabando Ray-Ban: primeros cuadros HEVC confirmados.")
                }
            }
        }
        scope.launch {
            WivraCaptureForegroundService.captureProgress.collect { progress ->
                if (WivraCaptureForegroundService.captureState ==
                        WivraCaptureForegroundService.CaptureState.RECORDING) {
                    show("Ray-Ban: " + progress.muxedSamples +
                        " muestras MP4 · " + progress.savedCheckpoints +
                        " segmentos seguros. Puedes bloquear la pantalla.")
                }
            }
        }
        if (!WivraCaptureForegroundService.isCaptureActive()) checkBluetooth()
        window.decorView.post { offerPendingVideo() }
    }

    override fun onResume() {
        super.onResume()
        // A service can finish while this Activity has no window focus.
        // On return, recover finalized parts without requiring a new session.
        if (!WivraCaptureForegroundService.isCaptureActive()) {
            if (!sdkReady) checkBluetooth()
            window.decorView.post { offerPendingVideo() }
        }
    }

    override fun onStart() {
        super.onStart()
        refreshButtons()
        // A halted DAT stream may stay STREAMING but stop producing frames.
        // Re-evaluate the photo shutter and signal age only while UI is visible;
        // the separate capture foreground service is unaffected.
        if (capabilityRefreshJob == null) {
            capabilityRefreshJob = scope.launch {
                while (true) {
                    refreshButtons()
                    delay(1_000L)
                }
            }
        }
        if (WivraCaptureForegroundService.isCaptureActive()) {
            show("Grabación Ray-Ban a cargo del servicio. Puedes bloquear la pantalla.")
        } else {
            window.decorView.post { offerPendingVideo() }
        }
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
        capabilityRefreshJob?.cancel()
        capabilityRefreshJob = null
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

    // ── Ray-Ban stream profile («Automático» decides from the previous session; a change restarts the camera) ──
    private fun datChoice(): String =
        getSharedPreferences("wivra_capture", Context.MODE_PRIVATE).getString("dat_profile", null) ?: WivraDatProfile.DEFAULT.id

    private fun datLabel(p: WivraDatProfile) = "${p.width} × ${p.height}, ${p.fps} FPS"

    private fun resolveDatProfile(): WivraDatProfile {
        val choice = datChoice()
        return if (choice == WivraDatProfile.AUTO) WivraDatAuto.start(lastDatObserved, datThermal)
        else WivraDatProfile.from(choice) ?: WivraDatProfile.DEFAULT
    }

    private fun refreshDatProfileButton() {
        val choice = datChoice()
        datProfileButton.text = if (choice == WivraDatProfile.AUTO) getString(R.string.dat_profile_auto_button, datLabel(resolveDatProfile()))
        else getString(R.string.dat_profile_button, datLabel(WivraDatProfile.from(choice) ?: WivraDatProfile.DEFAULT))
        datProfileButton.isEnabled = camera == null
    }

    private fun chooseDatProfile() {
        if (camera != null) return
        val ids = listOf("balanced", "motion", "detail", "max", "economy", WivraDatProfile.AUTO)
        val names = ids.map { id ->
            if (id == WivraDatProfile.AUTO) getString(R.string.dat_profile_auto)
            else WivraDatProfile.from(id)!!.let { getString(datNameRes(it)) + " · " + datLabel(it) }
        }
        android.app.AlertDialog.Builder(this)
            .setTitle(R.string.dat_profile_title)
            .setSingleChoiceItems(names.toTypedArray(), ids.indexOf(datChoice()).coerceAtLeast(0)) { dialog, which ->
                getSharedPreferences("wivra_capture", Context.MODE_PRIVATE).edit().putString("dat_profile", ids[which]).apply()
                refreshDatProfileButton()
                dialog.dismiss()
            }
            .setNegativeButton(R.string.plive_cancel, null)
            .show()
    }

    private fun datNameRes(p: WivraDatProfile) = when (p) {
        WivraDatProfile.ECONOMY -> R.string.dat_profile_economy
        WivraDatProfile.BALANCED -> R.string.dat_profile_balanced
        WivraDatProfile.MOTION -> R.string.dat_profile_motion
        WivraDatProfile.DETAIL -> R.string.dat_profile_detail
        WivraDatProfile.MAX -> R.string.dat_profile_max
    }

    private fun datFrame(width: Int, height: Int, payloadBytes: Int) {
        datStats.frame(SystemClock.elapsedRealtime(), width, height, payloadBytes)
    }

    private fun refreshDatDiagnostic(recording: Boolean) {
        val s = datStats.snapshot()
        if (s.frames < 2) return
        datDiagnostic.visibility = View.VISIBLE
        datDiagnostic.text = getString(R.string.dat_diagnostic, datLabel(activeDatProfile), s.width, s.height, s.fps, s.p95IntervalMs, s.stalls)
        val now = SystemClock.elapsedRealtime()
        val tip = WivraDatAuto.suggest(WivraDatAuto.Observed(activeDatProfile, s.seconds, s.fps, s.stalls, s.height, datThermal),
            (now - lastSuggestionMs) / 1000.0)
        if (tip != null) { datSuggestion = tip; lastSuggestionMs = now }
        val offer = datSuggestion
        if (offer != null && !recording) {
            datSuggestionButton.text = getString(R.string.dat_suggestion, datLabel(offer))
            datSuggestionButton.visibility = View.VISIBLE
        } else datSuggestionButton.visibility = View.GONE
    }

    /** A suggested lower profile restarts the camera, so it is only offered while previewing (never recording). */
    private fun applyDatSuggestion() {
        if (liveRunning) return // a profile change restarts the camera: never during LIVE
        val next = datSuggestion ?: return
        if (recordingMode || WivraCaptureForegroundService.isCaptureActive()) return
        getSharedPreferences("wivra_capture", Context.MODE_PRIVATE).edit().putString("dat_profile", next.id).apply()
        datSuggestion = null
        datSuggestionButton.visibility = View.GONE
        rememberDatSession()
        streamJob?.cancel(); streamJob = null
        streamErrorJob?.cancel(); streamErrorJob = null
        camera?.close(); camera = null
        stream = null
        framesJob?.cancel(); framesJob = null
        decodeJob?.cancel(); decodeJob = null
        frameChannel?.close(); frameChannel = null
        refreshDatProfileButton()
        imagePreview.postDelayed({ if (!isFinishing && !isDestroyed) startStream() }, 600L)
    }

    private fun rememberDatSession() {
        val s = datStats.snapshot()
        if (s.frames > 1) lastDatObserved = WivraDatAuto.Observed(activeDatProfile, s.seconds, s.fps, s.stalls, s.height, datThermal)
    }

    // The Meta DAT selector can pick any supported model, including future
    // models. Report only what this process actually observed: registration,
    // device discovery, camera frames and native recording service state.
    // A product name or lit camera LED never implies streaming or a saved MP4.
    private fun updateDatCapabilityStatus() {
        if (!::datCapabilityStatus.isInitialized) return
        if (!sdkReady) {
            datCapabilityStatus.text = "Meta DAT: SDK sin confirmar."
            return
        }
        val registered = Wearables.registrationState.value == RegistrationState.REGISTERED
        val detected = Wearables.devices.value.isNotEmpty()
        val freshFrame = stream?.state?.value == StreamState.STREAMING &&
            lastFrameReceivedMs > 0L &&
            SystemClock.elapsedRealtime() - lastFrameReceivedMs <= 4_000L
        val capture = WivraCaptureForegroundService.captureState
        val signal = when {
            !registered -> "Registro pendiente"
            !detected && session == null && !WivraCaptureForegroundService.isCaptureActive() ->
                "Gafas no detectadas"
            capture == WivraCaptureForegroundService.CaptureState.RECORDING ->
                "Servicio DAT grabando; verificar fragmentos MP4 al finalizar"
            capture == WivraCaptureForegroundService.CaptureState.PAUSED ->
                "DAT en pausa; continuidad sin confirmar"
            capture == WivraCaptureForegroundService.CaptureState.FINALIZING ->
                "Finalizando MP4; archivo aún sin validar"
            freshFrame && stream != null -> "Fotogramas reales recibidos"
            stream != null -> "Esperando fotogramas DAT"
            session?.state?.value == DeviceSessionState.STARTED ->
                "Sesión lista; cámara aún sin verificar"
            detected -> "Gafas detectadas; cámara aún sin verificar"
            else -> "Conexión DAT sin confirmar"
        }
        datCapabilityStatus.text = "Compatibilidad por capacidades: " + signal +
            "\nDisplay, gestos y generaciones nuevas: pendientes de validar."
    }

    private fun observeAvailableDevices() {
        if (availableDevicesJob != null) return
        availableDevicesJob = scope.launch {
            Wearables.devices.collect {
                // A registered app does not guarantee a currently connected
                // pair of glasses. The device Flow changes independently of
                // registration when glasses are switched or power off.
                refreshButtons()
            }
        }
    }

    private fun refreshButtons() {
        if (::datProfileButton.isInitialized) refreshDatProfileButton()
        refreshDatAudio()
        val serviceRecording = WivraCaptureForegroundService.isCaptureActive()
        registerButton.isEnabled = sdkReady && !serviceRecording &&
            Wearables.registrationState.value != RegistrationState.REGISTERING &&
            Wearables.registrationState.value != RegistrationState.REGISTERED
        connectButton.isEnabled = sdkReady && session == null && !serviceRecording &&
            Wearables.registrationState.value == RegistrationState.REGISTERED &&
            Wearables.devices.value.isNotEmpty()
        liveButton?.isEnabled = liveRunning ||
            (camera != null && stream != null && !recordingMode && !serviceRecording)
        previewButton.isEnabled = !serviceRecording &&
            session?.state?.value == DeviceSessionState.STARTED && camera == null
        recordButton.isEnabled = !serviceRecording &&
            session?.state?.value == DeviceSessionState.STARTED &&
            camera == null && !recordingFinalizing
        finishRecordButton.isEnabled =
            (serviceRecording && WivraCaptureForegroundService.captureState !=
                WivraCaptureForegroundService.CaptureState.FINALIZING) ||
            (recordingMode && !recordingFinalizing)
        photoButton.isEnabled = stream?.state?.value == StreamState.STREAMING &&
            !photoInProgress && lastFrameReceivedMs > 0L &&
            SystemClock.elapsedRealtime() - lastFrameReceivedMs < 4_000L
        updateDatCapabilityStatus()
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
                observeMetaRegistration()
                observeAvailableDevices()
                refreshButtons()
            }
            .onFailure { error, _ -> show(getString(R.string.sdk_error, error.description)) }
    }

    private fun observeMetaRegistration() {
        if (metaRegistrationJob != null) return
        metaRegistrationJob = scope.launch {
            Wearables.registrationState.collect { state ->
                if (!::status.isInitialized || session != null || recordingMode ||
                    WivraCaptureForegroundService.isCaptureActive()) return@collect
                when (state) {
                    RegistrationState.REGISTERED -> {
                        metaRegistrationWarningJob?.cancel()
                        show(getString(R.string.meta_registration_complete))
                    }
                    RegistrationState.REGISTERING -> show(getString(R.string.meta_registration_in_progress))
                    else -> Unit // Leave unrelated camera/preview errors visible.
                }
                refreshButtons() // DAT callbacks may arrive after Meta AI closes.
            }
        }
    }

    private fun registerMeta() {
        // Registration can temporarily take the glasses away from a live DAT
        // session. Never open that flow during user-initiated pocket capture.
        if (!sdkReady || WivraCaptureForegroundService.isCaptureActive()) return
        if (Wearables.registrationState.value == RegistrationState.REGISTERED) {
            show(getString(R.string.meta_registration_complete))
            return
        }
        if (Wearables.registrationState.value == RegistrationState.REGISTERING) {
            show(getString(R.string.meta_registration_in_progress))
            return
        }
        Wearables.startRegistration(this)
        show(getString(R.string.authorize_meta))
        // Developer Mode can stall in the Meta AI companion app without
        // delivering a typed failure. Never announce success merely because
        // startRegistration returned; only the SDK's REGISTERED state proves it.
        metaRegistrationWarningJob?.cancel()
        metaRegistrationWarningJob = scope.launch {
            // DAT's own registration timeout may exceed 20 s while the user
            // reads the companion app consent sheet. Diagnose, never abort it.
            delay(45_000L)
            if (Wearables.registrationState.value != RegistrationState.REGISTERED &&
                session == null && !recordingMode &&
                !WivraCaptureForegroundService.isCaptureActive()) {
                show(getString(R.string.meta_registration_stalled))
            }
        }
    }

    private fun beginSession() {
        if (!sdkReady || session != null ||
            WivraCaptureForegroundService.isCaptureActive()) return
        // Meta SDK can report REGISTERED even if the glasses have vanished
        // after re-pairing. Never claim the camera is ready in that state;
        // avoid reset/unregistration which can destroy local user captures.
        if (Wearables.registrationState.value != RegistrationState.REGISTERED) {
            show(getString(R.string.meta_registration_required))
            return
        }
        if (Wearables.devices.value.isEmpty()) {
            show(getString(R.string.meta_registered_no_devices))
            return
        }
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
        if (WivraCaptureForegroundService.isCaptureActive() ||
            session?.state?.value != DeviceSessionState.STARTED || camera != null) {
            show(getString(R.string.wait_session))
            return
        }
        pendingRecordingMode = recording
        scope.launch {
            Wearables.checkPermissionStatus(Permission.CAMERA)
                .onSuccess { permission ->
                    if (permission == PermissionStatus.Granted) {
                        if (pendingRecordingMode) startServiceCapture() else startStream(false)
                    }
                    else cameraPermissionLauncher.launch(Permission.CAMERA)
                }
                .onFailure { error, _ -> show(getString(R.string.permission_check_failed, error.description)) }
        }
    }

    private fun startServiceCapture() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                PackageManager.PERMISSION_GRANTED) {
            val settings = getSharedPreferences("wivra_capture", Context.MODE_PRIVATE)
            if (!settings.getBoolean("notification_permission_asked", false)) {
                settings.edit().putBoolean("notification_permission_asked", true).apply()
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                return
            }
        }
        resolveRecordingAudio(::startCaptureWithAudio)
    }

    // ── Ray-Ban recording audio: the person's choice, resolved before the camera moves to the service ──
    private fun datAudioChoice(): WivraRayBanSync.Choice = WivraRayBanSync.Choice.from(
        getSharedPreferences("wivra_capture", Context.MODE_PRIVATE).getString("dat_audio", null)) ?: WivraRayBanSync.Choice.DEFAULT

    private fun refreshDatAudio() {
        if (!::datAudioButton.isInitialized) return
        datAudioButton.text = getString(R.string.dat_audio_button, getString(datAudioNameRes(datAudioChoice())))
        datAudioButton.isEnabled = !WivraCaptureForegroundService.isCaptureActive()
        datHfpStatus.text = getString(if (WivraRayBanAudioRoute.hfpClosed(this)) R.string.dat_audio_hfp_closed else R.string.dat_audio_hfp_open)
    }

    private fun chooseDatAudio() {
        if (WivraCaptureForegroundService.isCaptureActive()) return
        val choices = listOf(WivraRayBanSync.Choice.PHONE, WivraRayBanSync.Choice.WIRED_USB,
            WivraRayBanSync.Choice.BLUETOOTH, WivraRayBanSync.Choice.OFF)
        AlertDialog.Builder(this)
            .setTitle(R.string.dat_audio_title)
            .setSingleChoiceItems(choices.map { getString(datAudioNameRes(it)) }.toTypedArray(),
                choices.indexOf(datAudioChoice()).coerceAtLeast(0)) { dialog, which ->
                getSharedPreferences("wivra_capture", Context.MODE_PRIVATE).edit().putString("dat_audio", choices[which].id).apply()
                refreshDatAudio()
                dialog.dismiss()
            }
            .setNegativeButton(R.string.plive_cancel, null)
            .show()
        show(getString(R.string.dat_audio_note))
    }

    /** Resolve the chosen microphone; if it is missing, ask (other microphones / video only), never switch silently. */
    private fun resolveRecordingAudio(then: (WivraRayBanSync.Choice, Int) -> Unit) {
        audioThen = then
        val choice = datAudioChoice()
        if (choice == WivraRayBanSync.Choice.OFF) { then(choice, -1); return }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
            return
        }
        val device = WivraRayBanAudioRoute.pick(this, choice)
        if (device != null) { then(choice, device.id); return }
        offerVideoOnly(getString(R.string.dat_audio_missing), WivraRayBanAudioRoute.alternatives(this, choice), then)
    }

    private fun offerVideoOnly(reason: String, others: List<WivraRayBanSync.Choice>,
                               then: (WivraRayBanSync.Choice, Int) -> Unit) {
        val labels = others.map { getString(datAudioNameRes(it)) } + getString(R.string.dat_audio_use_video_only)
        AlertDialog.Builder(this)
            .setTitle(reason)
            .setItems(labels.toTypedArray()) { _, which ->
                if (which < others.size) {
                    // The person picked another microphone: remembered as their new choice.
                    getSharedPreferences("wivra_capture", Context.MODE_PRIVATE).edit().putString("dat_audio", others[which].id).apply()
                    refreshDatAudio()
                    resolveRecordingAudio(then)
                } else then(WivraRayBanSync.Choice.OFF, -1)
            }
            .setNegativeButton(R.string.plive_cancel) { _, _ -> show(getString(R.string.wait_session)) }
            .show()
    }

    private fun startCaptureWithAudio(choice: WivraRayBanSync.Choice, deviceId: Int) {
        recordingAudioChoice = choice
        recordingAudioDevice = deviceId
        handoffCaptureSession()
    }

    private fun handoffCaptureSession() {
        val active = session
        if (active == null || active.state.value != DeviceSessionState.STARTED ||
            camera != null || !WivraCaptureForegroundService.offerSession(active)) {
            show("No se pudo transferir la sesión Ray-Ban al servicio de grabación.")
            return
        }
        // Snapshot existing private recordings before this capture. Older clips
        // must never satisfy a newly chosen Director shot's save receipt.
        val pendingBefore = WivraHevcMp4Recorder.listPendingRecordings(applicationContext)
            .map { it.id }.toSet()
        directorPendingBeforeCapture = null
        directorPartialSaves.clear()
        if (intent.hasExtra(WivraPhoneCameraActivity.EXTRA_SHOT_ID)) {
            setResult(RESULT_CANCELED) // A second attempt revokes any previous receipt.
        }
        try {
            // User action while Activity is visible; Android can then retain
            // external-device capture after this screen is destroyed/locked.
            startForegroundService(Intent(this,
                WivraCaptureForegroundService::class.java).apply {
                action = WivraCaptureForegroundService.ACTION_START
                putExtra(WivraCaptureForegroundService.EXTRA_AUDIO_CHOICE, recordingAudioChoice.id)
                putExtra(WivraCaptureForegroundService.EXTRA_AUDIO_DEVICE_ID, recordingAudioDevice)
            })
            if (WivraDirectorTakeReceipt.validShotId(
                    intent.getStringExtra(WivraPhoneCameraActivity.EXTRA_SHOT_ID))) {
                directorPendingBeforeCapture = pendingBefore
            }
            // The Activity relinquishes DAT ownership. Its onDestroy must
            // never stop a session that now belongs to the service.
            sessionJob?.cancel(); sessionJob = null
            errorJob?.cancel(); errorJob = null
            session = null
            show(if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) !=
                    PackageManager.PERMISSION_GRANTED) {
                "Captura en servicio. Notificaciones bloqueadas: vuelve a Wivra para detener."
            } else {
                "Iniciando captura Ray-Ban en servicio. Control en notificación."
            })
            refreshButtons()
        } catch (failure: RuntimeException) {
            WivraCaptureForegroundService.withdrawSession(active)
            show("No se pudo iniciar la captura en segundo plano: " +
                (failure.localizedMessage ?: "error desconocido"))
        }
    }

    private fun stopServiceCapture() {
        startService(Intent(this, WivraCaptureForegroundService::class.java).apply {
            action = WivraCaptureForegroundService.ACTION_STOP
        })
        show("Finalizando el segmento MP4. No cierres la aplicación forzosamente.")
        refreshButtons()
    }

    private fun startStream(recording: Boolean = false) {
        val connected = session ?: return
        if (connected.state.value != DeviceSessionState.STARTED || camera != null) return
        val profile = resolveDatProfile()
        activeDatProfile = profile
        datStats = WivraDatStreamStats(profile.fps)
        datSuggestion = null
        connected.addCamera(StreamConfiguration(
            videoQuality = datQuality(profile), frameRate = profile.fps,
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
                        // A foreground-service failure must not silently turn
                        // into a recording that cannot survive backgrounding.
                        recorder?.discard()
                        recorder = null
                        recordingMode = false
                        camera = null
                        capability.close()
                        show("Grabación cancelada: servicio de captura no disponible (" +
                            (failure.localizedMessage ?: "unknown") + ")")
                        refreshButtons()
                        return@onSuccess
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
                            if (!frame.isCodecConfig) datFrame(frame.width, frame.height, bytes.size)
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
                        if (liveRunning && !frame.isCompressed) rayBanLive?.offerI420(frame.buffer, frame.width, frame.height)
                        datFrame(frame.width, frame.height, frame.buffer.remaining())
                        if (frames == 1L || frames % 24L == 0L) {
                            refreshButtons()
                            refreshDatDiagnostic(recording = false)
                            show(getString(R.string.frames_status, frames, frame.width, frame.height) + liveStatsLine())
                        }
                        // During LIVE the separate JPEG preview competes for CPU with the I420->H264
                        // path. Keep it to 1 image/s while LIVE; all DAT video frames were already
                        // offered to RootEncoder above. Normal preview remains ~6 FPS.
                        // Neither stream quality nor the glasses' HEVC originals are downscaled here.
                        val now = SystemClock.elapsedRealtime()
                        if (!frame.isCompressed && WivraRayBanPreviewBudget.shouldRefresh(
                            now, lastPreviewEnqueueMs, liveRunning
                        )) {
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
                    active.errorStream.collect { error ->
                        // Glasses heat or power limits: «Automático» starts lower next time.
                        if (error.name.startsWith("THERMAL") || error.name == "PEAK_POWER_LIMIT") datThermal = true
                        show(getString(R.string.stream_failed, error.description))
                    }
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
        // Transfer ownership immediately so onDestroy cannot launch a second
        // finalizer against the same muxer while this coroutine is suspended.
        val finishingRecorder = recorder
        recorder = null
        scope.launch {
            try {
                // The HEVC collector must release its last sample before muxer.stop().
                finishingJob?.cancelAndJoin()
                val pending = withContext(Dispatchers.IO) {
                    finishingRecorder?.finishToPending()
                }
                stopAll()
                if (pending != null) {
                    show(getString(R.string.recording_pending_ready))
                    offerPendingVideo()
                } else {
                    show(getString(R.string.recording_no_video))
                }
            } catch (failure: Exception) {
                stopAll()
                show("No se pudo finalizar el MP4: " +
                    (failure.localizedMessage ?: "error desconocido"))
            }
        }
    }

    /**
     * Never discard an unanswered recording just because the dialog was
     * dismissed or the activity was reopened. Pending videos live in filesDir.
     */
    private fun offerPendingVideo() {
        if (pendingDialogVisible || recordingMode || recordingFinalizing || isFinishing ||
            WivraCaptureForegroundService.isCaptureActive()) return
        val interrupted = WivraHevcMp4Recorder.listInterruptedCaptures(applicationContext)
        val pending = WivraHevcMp4Recorder.listPendingRecordings(applicationContext)
            .firstOrNull()
        if (pending == null) {
            if (interrupted.isNotEmpty()) {
                show("Hay " + interrupted.size +
                    " archivos de captura interrumpida conservados. " +
                    "No son MP4 finalizados y no se publicarán automáticamente.")
            }
            return
        }
        pendingDialogVisible = true
        val explanation = getString(R.string.recording_pending_explanation) +
            (if (pending.parts.size > 1) {
                "\n\n" + getString(R.string.recording_pending_multiple_parts, pending.parts.size)
            } else "") +
            (if (interrupted.isNotEmpty()) {
                "\n\n" + interrupted.size +
                    " archivo(s) de grabación interrumpida sin finalizar; " +
                    "permanecen privados y no se incluirán en la galería."
            } else "")
        val reviewButton = Button(this).apply {
            text = getString(R.string.recording_review_video)
        }
        val decisionDialog = AlertDialog.Builder(this)
            .setTitle(R.string.recording_save_question)
            .setMessage(explanation)
            .setView(reviewButton)
            .setPositiveButton(R.string.recording_keep) { _, _ ->
                scope.launch {
                    var freshPublication = false
                    var audioNote = ""
                    val savedCount = withContext(Dispatchers.IO) {
                        // Persist BEFORE the first part can become visible or
                        // disappear from pending storage. A process-death retry
                        // must never acknowledge the remaining subset as a take.
                        freshPublication = WivraDirectorSaveJournal.begin(applicationContext, pending.id)
                        // Independent microphone: cut each part's audio BEFORE its private MP4 is published.
                        val audio = runCatching { WivraRayBanAudioStore.prepare(applicationContext, pending) }
                            .getOrNull()
                        var saved = 0
                        var withAudio = 0
                        for (part in pending.parts) {
                            val uri = WivraHevcMp4Recorder.publishPending(applicationContext, part) ?: continue
                            saved++
                            if (audio?.hadAudio == true &&
                                runCatching { WivraRayBanAudioStore.attach(applicationContext, part, uri) }.getOrDefault(false)) withAudio++
                        }
                        if (audio?.hadAudio == true) {
                            audioNote = "\n" + getString(R.string.dat_audio_saved, withAudio, pending.parts.size)
                            // Some part has no slice of its own: the complete original WAV is kept public instead.
                            if (withAudio < saved && runCatching { WivraRayBanAudioStore.publishComplete(applicationContext, pending.id) }.getOrDefault(false))
                                audioNote += "\n" + getString(R.string.dat_audio_complete_saved)
                            else if (withAudio < saved) audioNote += "\n" + getString(R.string.dat_audio_not_saved)
                        }
                        runCatching { WivraRayBanAudioStore.cleanup(applicationContext) }
                        saved
                    }
                    show(when {
                        savedCount == pending.parts.size -> getString(R.string.recording_saved)
                        savedCount > 0 -> getString(R.string.recording_partially_saved,
                            savedCount, pending.parts.size)
                        else -> getString(R.string.recording_keep_failed)
                    } + audioNote)
                    // The Director acknowledgement is strictly later than
                    // the user's Save choice AND successful publication of all
                    // segments. The actual assetId still belongs to the editor's
                    // own import flow, never to this native camera.
                    if (savedCount != pending.parts.size) {
                        directorPartialSaves.add(pending.id)
                    } else if (freshPublication && pending.id !in directorPartialSaves) {
                        val shotId = intent.getStringExtra(
                            WivraPhoneCameraActivity.EXTRA_SHOT_ID)
                        if (WivraDirectorTakeReceipt.mayAcknowledge(
                                shotId, directorPendingBeforeCapture,
                                pending.id, savedCount, pending.parts.size)) {
                            setResult(RESULT_OK, Intent().putExtra(
                                WivraPhoneCameraActivity.EXTRA_SHOT_ID, shotId))
                            directorPendingBeforeCapture = null
                        }
                    }
                    if (savedCount == pending.parts.size) {
                        withContext(Dispatchers.IO) {
                            WivraDirectorSaveJournal.completed(applicationContext, pending.id)
                        }
                    }
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
        var inspectionSerial = 0
        val display: () -> Unit = {
            player.stopPlayback()
            info.text = getString(R.string.recording_review_part, index + 1, clips.size)
            // Probe finalized private MP4s off the UI thread. Never delete or
            // publish a segment just because a decoder is unavailable.
            val selected = clips[index]
            val serial = ++inspectionSerial
            scope.launch {
                val report = withContext(Dispatchers.IO) {
                    WivraMp4Probe.inspect(selected)
                }
                if (serial != inspectionSerial || isFinishing || info.windowToken == null)
                    return@launch
                info.append(if (report.appearsReadable) {
                    "\nHEVC: " + report.width + "×" + report.height +
                        " · pista detectada · decodificador Android: " +
                        (if (report.decoderListed) "disponible" else "no confirmado") +
                        ". La reproducción completa requiere prueba real."
                } else {
                    "\nNo se pudo verificar la pista HEVC. El archivo no se modifica."
                })
            }
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
                        }.also {
                            // The person confirmed: the private microphone audio of these parts goes too.
                            runCatching { WivraRayBanAudioStore.discardSession(applicationContext, pending.id) }
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

    // ── Ray-Ban → LIVE (existing engine; the address is used once and never stored, logged or shown) ──
    private fun liveStatsLine(): String {
        if (!liveRunning) return ""
        val st = rayBanLive?.stats() ?: return ""
        return "\n" + getString(R.string.rblive_stats, st.drawn, st.repeated, st.dropped, st.convertMs)
    }

    private fun currentLook(): WivraRayBanLook =
        WivraRayBanLook.from(getSharedPreferences("wivra_capture", Context.MODE_PRIVATE).getString("dat_look", null))

    private fun lookName(look: WivraRayBanLook) = getString(when (look) {
        WivraRayBanLook.OFF -> R.string.dat_look_off
        WivraRayBanLook.CLEAR -> R.string.dat_look_clear
        WivraRayBanLook.LOW_LIGHT -> R.string.dat_look_lowlight
        WivraRayBanLook.VIVID -> R.string.dat_look_vivid
    })

    private fun refreshLookButton() { lookButton?.text = getString(R.string.dat_look_button, lookName(currentLook())) }

    /** Light GPU look for the LIVE image only; can change during LIVE without restarting the camera. */
    private fun chooseLook() {
        val looks = WivraRayBanLook.entries
        AlertDialog.Builder(this)
            .setTitle(R.string.dat_look_title)
            .setSingleChoiceItems(looks.map { lookName(it) }.toTypedArray(), looks.indexOf(currentLook())) { dialog, which ->
                getSharedPreferences("wivra_capture", Context.MODE_PRIVATE).edit().putString("dat_look", looks[which].id).apply()
                if (liveRunning) rayBanLive?.setLook(looks[which])
                refreshLookButton()
                dialog.dismiss()
            }
            .setNegativeButton(R.string.plive_cancel, null)
            .show()
        show(getString(R.string.dat_look_note))
    }

    private fun requestRayBanLive() {
        val engine = rayBanLive ?: return
        if (camera == null || recordingMode || stream == null || WivraCaptureForegroundService.isCaptureActive()) {
            show(getString(R.string.rblive_need_preview)); return
        }
        val address = EditText(this).apply {
            hint = getString(R.string.rblive_address_hint)
            inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            isSingleLine = true
        }
        val copy = CheckBox(this).apply { text = getString(R.string.rblive_copy); isChecked = true }
        val box = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setPadding(32, 8, 32, 0); addView(address); addView(copy) }
        AlertDialog.Builder(this)
            .setTitle(R.string.rblive_title)
            .setView(box)
            .setNegativeButton(R.string.plive_cancel, null)
            .setPositiveButton(R.string.rblive_next) { _, _ ->
                val url = address.text.toString()
                address.text?.clear()
                val withCopy = copy.isChecked
                resolveRecordingAudio { choice, deviceId -> confirmRayBanLive(engine, url, withCopy, choice, deviceId) }
            }
            .show()
            // Like the phone LIVE: the stream key must never appear in a screenshot or the app switcher.
            .window?.setFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE, android.view.WindowManager.LayoutParams.FLAG_SECURE)
    }

    private fun confirmRayBanLive(engine: WivraRayBanLive, url: String, withCopy: Boolean,
                                  choice: WivraRayBanSync.Choice, deviceId: Int) {
        val plan = WivraRayBanLivePlan.forProfile(activeDatProfile, deviceId >= 0)
        val line = engine.confirmation(this, url, WivraRayBanLivePlan.totalBps(plan))
        if (line == null) { show(getString(R.string.rblive_address_invalid)); return }
        val audio = if (deviceId >= 0) getString(datAudioNameRes(choice)) else getString(R.string.dat_audio_off)
        AlertDialog.Builder(this)
            .setTitle(R.string.rblive_confirm_title)
            .setMessage(getString(R.string.rblive_confirm, plan.width, plan.height, plan.fps, audio) + "\n" + line +
                if (withCopy) "\n" + getString(R.string.rblive_copy) else "")
            .setNegativeButton(R.string.plive_cancel, null)
            .setPositiveButton(R.string.plive_start) { _, _ -> startRayBanLive(engine, url, withCopy, plan, deviceId) }
            .show()
    }

    private fun startRayBanLive(engine: WivraRayBanLive, url: String, withCopy: Boolean,
                                plan: WivraRayBanLivePlan.Plan, deviceId: Int) {
        if (liveRunning || camera == null || recordingMode) return
        val mic = if (deviceId >= 0) WivraRayBanAudioRoute.inputs(this).firstOrNull { it.first.id == deviceId }?.second else null
        if (deviceId >= 0 && mic == null) { show(getString(R.string.dat_audio_missing)); return }
        val copy = if (withCopy) runCatching { WivraPhoneMediaStore.createPrivateVideo(applicationContext) }.getOrNull() else null
        copy?.let { WivraPhoneMediaStore.markWriting(it) }
        val started = engine.start(this, url, plan, mic, copy, object : WivraRayBanLive.Listener {
            override fun onLiveStatus(status: String, a: Int, b: Int, c: Int) {
                if (!liveRunning) return
                show(when (status) {
                    "connecting" -> getString(R.string.plive_connecting)
                    "on_air" -> getString(if (liveCopy != null) R.string.plive_on_air_with_copy else R.string.plive_on_air_without_copy)
                    "reconnect" -> getString(if (liveCopy != null) R.string.plive_reconnect_with_copy else R.string.plive_reconnect, a, b, c)
                    "auth" -> getString(if (liveCopy != null) R.string.plive_auth_with_copy else R.string.plive_auth_without_copy)
                    "disconnected" -> getString(if (liveCopy != null) R.string.plive_disconnected_with_copy else R.string.plive_disconnected_without_copy)
                    else -> getString(if (liveCopy != null) R.string.plive_failed_copy_continues else R.string.plive_failed_no_copy)
                })
            }
        }, currentLook())
        if (!started) {
            copy?.let { WivraPhoneMediaStore.doneWriting(it); if (it.length() == 0L) it.delete() }
            show(getString(R.string.plive_start_failed))
            return
        }
        liveRunning = true
        liveCopy = copy
        liveAudioDeviceId = deviceId
        if (deviceId >= 0) getSystemService(android.media.AudioManager::class.java)?.registerAudioDeviceCallback(liveAudioWatch, null)
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        liveButton?.text = getString(R.string.rblive_stop_button)
        show(getString(R.string.plive_connecting))
        refreshButtons()
    }

    private fun stopRayBanLive(review: Boolean) {
        if (!liveRunning) return
        liveRunning = false
        runCatching { getSystemService(android.media.AudioManager::class.java)?.unregisterAudioDeviceCallback(liveAudioWatch) }
        window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val closed = rayBanLive?.stop() ?: false
        val copy = liveCopy
        liveCopy = null
        copy?.let { WivraPhoneMediaStore.doneWriting(it) }
        liveButton?.text = getString(R.string.rblive_start_button)
        refreshButtons()
        when {
            copy == null -> show(getString(R.string.plive_stopped_no_copy))
            !closed || !WivraCaptureMediaVerifier.verifyFile(copy, copy.parentFile!!).valid ->
                show(getString(R.string.plive_stopped_copy_uncertified))
            review -> askKeepLiveCopy(copy)
            else -> show(getString(R.string.rblive_copy_pending))
        }
    }

    private fun askKeepLiveCopy(copy: File) {
        AlertDialog.Builder(this)
            .setTitle(R.string.rblive_keep_title)
            .setMessage(R.string.rblive_keep_message)
            .setPositiveButton(R.string.recording_keep) { _, _ ->
                scope.launch {
                    val ok = withContext(Dispatchers.IO) { runCatching { WivraPhoneMediaStore.publish(applicationContext, copy) }.isSuccess }
                    show(getString(if (ok) R.string.srec_saved else R.string.srec_save_failed))
                }
            }
            .setNeutralButton(R.string.recording_later) { _, _ -> show(getString(R.string.rblive_copy_pending)) }
            .setNegativeButton(R.string.recording_discard) { _, _ ->
                AlertDialog.Builder(this)
                    .setTitle(R.string.recording_discard_confirm_title)
                    .setMessage(R.string.recording_discard_confirm_message)
                    .setPositiveButton(R.string.recording_discard_confirm) { _, _ ->
                        show(getString(if (WivraPhoneMediaStore.discard(applicationContext, copy)) R.string.srec_deleted else R.string.recording_delete_failed))
                    }
                    .setNegativeButton(R.string.recording_later, null)
                    .show()
            }
            .show()
    }

    private fun cleanup() {
        // The glasses stopped: LIVE ends; its private MP4 copy stays pending for review.
        if (liveRunning) stopRayBanLive(review = false)
        rememberDatSession()
        if (!deferCaptureServiceStop &&
            !WivraCaptureForegroundService.isCaptureActive()) {
            stopService(Intent(this, WivraCaptureForegroundService::class.java))
        }
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
            deferCaptureServiceStop = true
            val collector = framesJob
            framesJob = null
            CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                // Wait until DAT packet collection has stopped before closing muxer.
                collector?.cancelAndJoin()
                try {
                    runCatching { unfinished.finishToPending() }
                } finally {
                    // Do not tear down DAT until the collector has released its
                    // last packet and the pending MP4 muxer has finished.
                    runCatching { camera?.close() }
                    runCatching { session?.stop() }
                    stopService(Intent(applicationContext,
                        WivraCaptureForegroundService::class.java))
                }
            }
        } else {
            stopAll()
        }
        scope.cancel()
        super.onDestroy()
    }

    companion object {
        /** What the previous camera session in this app run really delivered (memory only, never stored or sent). */
        @Volatile var lastDatObserved: WivraDatAuto.Observed? = null
    }

}

/** DAT resolution for a shared profile (also used by the background capture service). */
fun datQuality(p: WivraDatProfile): VideoQuality = when (p) {
    WivraDatProfile.ECONOMY -> VideoQuality.LOW
    WivraDatProfile.BALANCED, WivraDatProfile.MOTION -> VideoQuality.MEDIUM
    WivraDatProfile.DETAIL, WivraDatProfile.MAX -> VideoQuality.HIGH
}
