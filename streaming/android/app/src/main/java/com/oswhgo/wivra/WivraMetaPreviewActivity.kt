package com.oswhgo.wivra

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
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
import kotlinx.coroutines.launch

/**
 * Wivra Android B1: DAT video stream connection diagnostics inside the one app.
 * No rendering, recording, audio, upload or public LIVE is claimed.
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
    private var sdkReady = false
    private var frames = 0L
    private lateinit var status: TextView
    private lateinit var registerButton: Button
    private lateinit var connectButton: Button
    private lateinit var previewButton: Button

    private val bluetoothLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { allowed ->
            if (allowed) initializeSdk()
            else show("Bluetooth denegado. El editor funciona sin gafas.")
        }

    private val cameraPermissionLauncher =
        registerForActivityResult(Wearables.RequestPermissionContract()) { result ->
            result.onSuccess { permission ->
                if (permission == PermissionStatus.Granted) startStream()
                else show("Permiso de cámara denegado; no se inicia video.")
            }.onFailure { error, _ ->
                show("Error permiso DAT: " + error.description)
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(28, 24, 28, 24)
        }
        root.addView(TextView(this).apply {
            text = "Wivra · Ray-Ban Meta"
            textSize = 23f
        })
        status = TextView(this).apply {
            text = "Esperando permiso…"
            textSize = 16f
            setPadding(0, 20, 0, 20)
        }
        root.addView(status)
        registerButton = button(root, "1. Vincular mediante Meta AI") { registerMeta() }
        connectButton = button(root, "2. Conectar gafas") { beginSession() }
        previewButton = button(root, "3. Activar video") { checkCameraPermission() }
        button(root, "Desconectar") { stopAll() }
        button(root, "Volver al editor") { stopAll(); finish() }
        root.addView(TextView(this).apply {
            text = "\nEsta pantalla comprueba la llegada de cuadros de video. " +
                "No muestra imágenes ni guarda videos todavía. " +
                "LIVE y audio independiente siguen pendientes."
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
                show("Meta DAT preparado. Registra Wivra en Meta AI.")
                refreshButtons()
            }
            .onFailure { error, _ -> show("DAT: " + error.description) }
    }

    private fun registerMeta() {
        if (!sdkReady) return
        Wearables.startRegistration(this)
        show("Autoriza Wivra en Meta AI y vuelve a la aplicación.")
    }

    private fun beginSession() {
        if (!sdkReady || session != null) return
        Wearables.createSession(AutoDeviceSelector())
            .onSuccess { created ->
                session = created
                show("Iniciando sesión de gafas…")
                refreshButtons()
                sessionJob = scope.launch {
                    created.state.collect { state ->
                        if (state == DeviceSessionState.STOPPED) {
                            cleanup()
                            show("Sesión finalizada.")
                        } else {
                            show("Gafas: " + state.toString())
                            refreshButtons()
                        }
                    }
                }
                errorJob = scope.launch {
                    created.errors.collect { error -> show("Sesión: " + error.description) }
                }
                created.start()
            }
            .onFailure { error, _ -> show("Sin conexión: " + error.description) }
    }

    private fun checkCameraPermission() {
        if (session?.state?.value != DeviceSessionState.STARTED || camera != null) {
            show("Espera la conexión STARTED antes de activar video.")
            return
        }
        scope.launch {
            Wearables.checkPermissionStatus(Permission.CAMERA)
                .onSuccess { permission ->
                    if (permission == PermissionStatus.Granted) startStream()
                    else cameraPermissionLauncher.launch(Permission.CAMERA)
                }
                .onFailure { error, _ -> show("Permiso: " + error.description) }
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
                refreshButtons()
                // Observe before start so no first frame is missed.
                framesJob = scope.launch {
                    active.videoStream.collect { frame ->
                        frames += 1
                        if (frames == 1L || frames % 24L == 0L)
                            show("Ray-Ban: " + frames + " cuadros · " +
                                frame.width + "×" + frame.height + " · SIN grabación.")
                    }
                }
                streamJob = scope.launch {
                    active.state.collect { state ->
                        if (state == StreamState.PAUSED) show("Video pausado por las gafas.")
                        if (state == StreamState.CLOSED) show("Stream cerrado.")
                    }
                }
                streamErrorJob = scope.launch {
                    active.errorStream.collect { error -> show("Video: " + error.description) }
                }
                active.start().onFailure { error, _ ->
                    show("Stream falló: " + error.description)
                    stopAll()
                }
            }
            .onFailure { error, _ -> show("Cámara: " + error.description) }
    }

    private fun cleanup() {
        framesJob?.cancel(); framesJob = null
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
        show("Desconectado; editor sin cambios.")
    }

    override fun onDestroy() {
        stopAll()
        scope.cancel()
        super.onDestroy()
    }
}
