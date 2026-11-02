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
    private lateinit var storageHint: TextView
    private lateinit var status: TextView
    private lateinit var startButton: Button
    private lateinit var stopButton: Button
    private lateinit var flipCameraButton: Button
    private var stream: RtmpStream? = null
    private var cameraVideoSource: Camera2Source? = null
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
        else setStatus("Cámara denegada. LIVE no se puede iniciar.")
    }

    private val micPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { allowed ->
        if (awaitingMicPermission) {
            awaitingMicPermission = false
            if (allowed) confirmLive()
            else setStatus("Micrófono denegado. Desactívalo para emitir sin audio.")
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
            text = "Wivra LIVE · cámara del teléfono"
            textSize = 19f
        }
        root.addView(heading)
        root.addView(TextView(this).apply {
            text = "Introduce la URL RTMP/RTMPS que te entregó tu plataforma. " +
                "Solo empieza a emitir después de confirmarlo. " +
                "Wivra conserva una copia MP4 privada aunque falle la red."
        })
        endpointInput = EditText(this).apply {
            hint = "rtmps://servidor/live/clave"
            inputType = InputType.TYPE_CLASS_TEXT or
                InputType.TYPE_TEXT_VARIATION_PASSWORD or
                InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            isSaveEnabled = false
            setSingleLine(true)
            importantForAutofill = android.view.View.IMPORTANT_FOR_AUTOFILL_NO
            contentDescription = "URL de emisión privada"
        }
        root.addView(endpointInput)
        micOption = CheckBox(this).apply {
            text = "Transmitir audio del micrófono del teléfono (opcional)"
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
            text = "Guardar también una copia MP4 local (opcional)"
            isChecked = true // Keep the previous safe default until user opts out.
        }
        root.addView(localCopyOption)
        storageHint = TextView(this).apply { textSize = 13f }
        root.addView(storageHint)
        root.addView(TextView(this).apply {
            text = "LIVE largo: comprueba que tu plataforma conserve el VOD. " +
                "YouTube/Twitch/Kick/TikTok no garantizan un archivo automático. " +
                "Grabar localmente consume espacio adicional para cerrar y exportar. " +
                "Mantén batería suficiente y vigila la temperatura."
        })
        localCopyOption.setOnCheckedChangeListener { _, _ -> updateStorageHint() }
        micOption.setOnCheckedChangeListener { _, checked ->
            if (!checked) selectedInput = null
            updateAudioChoice()
            updateStorageHint()
        }
        status = TextView(this).apply {
            text = "LIVE desconectado. No se ha emitido ningún video."
            textSize = 15f
        }
        root.addView(status)
        val controls = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        startButton = Button(this).apply {
            text = "Preparar LIVE"
            setOnClickListener { requestLive() }
        }
        stopButton = Button(this).apply {
            text = "Detener LIVE y revisar copia opcional"
            isEnabled = false
            setOnClickListener { stopAndReview() }
        }
        controls.addView(startButton, LinearLayout.LayoutParams(0,
            ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        controls.addView(stopButton, LinearLayout.LayoutParams(0,
            ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        root.addView(controls)
        flipCameraButton = Button(this).apply {
            text = "Cambiar cámara frontal/trasera"
            contentDescription = "Cambiar cámara de video del teléfono"
            isEnabled = false
            setOnClickListener { togglePhoneCamera() }
        }
        root.addView(flipCameraButton)
        root.addView(Button(this).apply {
            text = "Revisar capturas locales pendientes"
            setOnClickListener { reviewPendingVideo() }
        })
        preview = SurfaceView(this)
        root.addView(preview, LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f
        ))
        root.addView(Button(this).apply {
            text = "Volver al editor"
            setOnClickListener { finish() }
        })
        setContentView(root)
        updateStorageHint()
        preview.holder.addCallback(object : SurfaceHolder.Callback {
            override fun surfaceCreated(holder: SurfaceHolder) {
                if (prepared && !stopping && stream?.isOnPreview != true) {
                    runCatching { stream?.startPreview(preview) }
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
            "Espacio local: $mb MiB. Estimación para copia MP4: " +
                "$estimatedMinutes min, no garantizados; la exportación requiere espacio extra."
        } else {
            "Solo LIVE: no se creará MP4 local. Comprueba antes el archivo/VOD " +
                "de la plataforma; Wivra no puede garantizarlo. Espacio: $mb MiB."
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
            setStatus("No fue posible detener la copia MP4. " +
                "Finalizando LIVE para proteger el teléfono y los archivos.")
            stopAndReview()
            return
        }
        saveLocalCopy = false
        if (publisher.isStreaming) {
            setStatus(if (closed)
                "Espacio crítico: copia MP4 local cerrada. LIVE continúa. " +
                    "Libera espacio y revisa el archivo al terminar."
            else "Espacio crítico: cierre MP4 sin verificar. LIVE sigue si el " +
                    "servidor continúa conectado; revisa el original privado."
            )
        } else {
            setStatus("Espacio crítico: no hay RTMP activo. Revisa la copia MP4 " +
                "y activa VOD en la plataforma antes de otra emisión.")
        }
        updateStorageHint()
    }

    private fun togglePhoneCamera() {
        if (!prepared || stopping || mediaBusy || isFinishing || isDestroyed) return
        val source = cameraVideoSource ?: return
        try {
            source.switchCamera()
            val side = if (source.getCameraFacing() == CameraHelper.Facing.FRONT) {
                "frontal"
            } else "trasera"
            setStatus("Cámara $side seleccionada. " +
                if (connected) "LIVE continúa; verifica la imagen del servidor."
                else "Comprueba la vista previa antes de transmitir.")
        } catch (_: Exception) {
            // Some phones cannot open the other camera at the chosen
            // resolution while encoding. Keep the existing publisher alive.
            setStatus("No se pudo cambiar cámara: el teléfono podría no admitir " +
                "la resolución elegida. Revisa la vista previa.")
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
                setStatus("El teléfono no pudo preparar el encoder H.264.")
                return
            }
            cameraVideoSource = source
            stream = publisher
            prepared = true
            flipCameraButton.isEnabled = true
            if (preview.holder.surface.isValid) publisher.startPreview(preview)
            setStatus(if (cameraReadyForLive())
                "Vista previa de cámara activa. Ninguna transmisión iniciada."
                else "Codificador preparado; esperando vista previa de cámara activa."
            )
            startButton.isEnabled = cameraReadyForLive()
        } catch (_: Exception) {
            prepared = false
            cameraVideoSource = null
            flipCameraButton.isEnabled = false
            runCatching { stream?.release() }
            stream = null
            setStatus("No se pudo abrir la cámara para LIVE.")
        }
    }

    private fun requestLive() {
        if (mediaBusy) return
        if (!cameraReadyForLive()) {
            setStatus("Cámara no disponible o sin vista previa activa. Revisa permiso y vuelve a preparar LIVE.")
            return
        }
        if (!prepared || stopping || initiatedByUser ||
            stream?.isStreaming == true || stream?.isRecording == true) return
        if (!validEndpoint(endpointInput.text.toString())) {
            setStatus("La dirección RTMP/RTMPS no es válida. Comprueba servidor y clave.")
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
            setStatus("Se perdió la vista previa de cámara antes de confirmar LIVE.")
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
            setStatus("Espacio insuficiente para la copia MP4. " +
                "Desactiva la copia local o libera al menos 128 MiB.")
            return
        }
        val archiveWarning = if (saveCopy) {
            "Wivra guardará una copia MP4 privada que también consume espacio. " +
                "Comprueba que la plataforma archive el VOD. "
        } else {
            "Solo transmitir: NO se guardará copia en Wivra. Si la plataforma " +
                "no archiva la transmisión, podrías perderla. Comprueba el VOD. "
        }
        // Never render the private endpoint or stream key in the dialog.
        AlertDialog.Builder(this)
            .setTitle("Confirmar emisión pública")
            .setMessage("La cámara se enviará a la plataforma configurada. " +
                archiveWarning + "¿Quieres iniciar LIVE ahora?")
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("Iniciar LIVE") { _, _ ->
                startLive(address, withAudio, saveCopy)
            }
            .show()
    }

    private fun startLive(address: String, withAudio: Boolean, saveCopy: Boolean) {
        if (mediaBusy) return
        val publisher = stream ?: return
        // Recheck after the public confirmation dialog, not only when
        // opening it; the user may have revoked camera permission meanwhile.
        if (!cameraReadyForLive() || initiatedByUser) {
            setStatus("No se inició LIVE: cámara sin permiso o vista previa inactiva.")
            return
        }
        if (!prepared || stopping || initiatedByUser || isFinishing) return
        if (saveCopy && applicationContext.filesDir.usableSpace < minFreeBytes) {
            setStatus("Espacio insuficiente para el MP4. Solo LIVE puede continuar sin copia.")
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
                setStatus("No se pudo preparar el audio seleccionado.")
                return
            }
            if (input != null && !microphone.setPreferredDevice(input)) {
                setStatus(getString(R.string.live_audio_unavailable))
                return
            }
            if (saveCopy) WivraPhoneMediaStore.createPrivateVideo(applicationContext)
            else null
        } catch (_: Exception) {
            setStatus("No fue posible preparar LIVE o reservar el MP4 local.")
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
                        setStatus("Copia MP4 local activa. Conectando LIVE…")
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
            endpointInput.isEnabled = false
            publisher.startStream(address)
            storageHandler.removeCallbacks(storageCheck)
            storageHandler.postDelayed(storageCheck, 10_000L)
            // Never log or persist the URL, including on failure.
            endpointInput.text?.clear()
            setStatus(if (saveLocalCopy)
                "Conectando LIVE… Guardando copia privada."
                else "Conectando LIVE… Sin copia local; comprueba VOD externo."
            )
        } catch (_: Exception) {
            setStatus("No se pudo iniciar LIVE. Revisa el estado de la copia local.")
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
            localCopyOption.isEnabled = true
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
                "LIVE detenido. La copia local no pudo certificarse; " +
                "el archivo parcial permanece privado para recuperarlo."
            )
            else -> setStatus(
                "LIVE detenido. No se creó copia local. Verifica en la " +
                "plataforma si la emisión quedó archivada como VOD."
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
        setStatus("Verificando MP4 local. El original permanece privado…")
        mediaScope.launch {
            try {
                val valid = withContext(Dispatchers.IO) { verifiedMp4(file) }
                if (isFinishing || isDestroyed || initiatedByUser) return@launch
                if (valid && window.decorView.hasWindowFocus()) askKeep(file)
                else setStatus("MP4 sin certificar o revisión aplazada. Se conserva privado.")
            } finally {
                mediaBusy = false
                if (!isDestroyed) controlsIdle()
            }
        }
    }

    private fun askKeep(file: File) {
        AlertDialog.Builder(this)
            .setTitle("Video LIVE guardado localmente")
            .setMessage("¿Quieres añadir este MP4 a Fotos/Galería? " +
                "Si eliges Después, permanece privado en Wivra.")
            .setPositiveButton("Guardar video") { _, _ ->
                if (!mediaBusy && !initiatedByUser) {
                    mediaBusy = true
                    controlsIdle()
                    mediaScope.launch {
                        try {
                            withContext(Dispatchers.IO) {
                                check(verifiedMp4(file)) { "MP4 changed before save" }
                                WivraPhoneMediaStore.publish(this@WivraPhoneLiveActivity, file)
                            }
                            setStatus("MP4 guardado. Puedes importarlo desde el editor.")
                        } catch (_: Exception) {
                            setStatus("No se pudo publicar. El MP4 sigue privado o disponible en la galería si el guardado terminó.")
                        } finally {
                            mediaBusy = false
                            if (!isDestroyed) controlsIdle()
                        }
                    }
                }
            }
            .setNeutralButton("Después", null)
            .setNegativeButton("Eliminar") { _, _ ->
                AlertDialog.Builder(this)
                    .setTitle("Confirmar borrado")
                    .setMessage("Este MP4 local se eliminará definitivamente.")
                    .setNegativeButton("Cancelar", null)
                    .setPositiveButton("Eliminar") { _, _ ->
                        runCatching { WivraPhoneMediaStore.discard(this, file) }
                    }.show()
            }.show()
    }

    private fun reviewPendingVideo() {
        if (initiatedByUser || stopping || mediaBusy) return
        val files = WivraPhoneMediaStore.pendingVideos(this)
        if (files.isEmpty()) {
            setStatus("No hay videos pendientes de revisar.")
            return
        }
        val titles = files.map { "${it.name.take(58)} · ${it.length() / 1024} KiB" }
        AlertDialog.Builder(this)
            .setTitle("Videos locales pendientes")
            .setItems(titles.toTypedArray()) { _, i ->
                // A stale or invalid file is never claimed as verified.
                reviewFile(files[i])
            }
            .setNegativeButton("Cerrar", null).show()
    }

    override fun onConnectionStarted(url: String) {
        // url includes the stream key. Do not log, display, persist or forward.
        setStatus("Intentando conectar con el servidor LIVE…")
    }
    override fun onConnectionSuccess() {
        if (!liveRequested || !initiatedByUser || stopping) return
        connected = true
        setStatus(if (saveLocalCopy)
            "EN VIVO. También se está grabando una copia MP4 local."
            else "EN VIVO. Sin copia MP4 local: comprueba el VOD del proveedor."
        )
    }
    override fun onConnectionFailed(reason: String) {
        // Some servers embed the full key in error messages.
        if (stopping || !liveRequested) return
        liveRequested = false
        connected = false
        runCatching { if (stream?.isStreaming == true) stream?.stopStream() }
        setStatus(when {
            saveLocalCopy -> "LIVE falló, pero la copia MP4 local continúa. Detén para revisarla."
            pendingFile != null -> "LIVE falló. Hay un MP4 local cerrado o parcial pendiente de revisión."
            else -> "LIVE falló. No había copia local: revisa si existe un VOD remoto."
        })
    }
    override fun onDisconnect() {
        if (!stopping && initiatedByUser) {
            liveRequested = false
            connected = false
            setStatus(if (saveLocalCopy)
                "LIVE desconectado. La copia MP4 local continúa."
                else "LIVE desconectado sin copia local. Comprueba si hay VOD remoto."
            )
        }
    }
    override fun onAuthError() {
        if (stopping) return
        liveRequested = false
        connected = false
        runCatching { if (stream?.isStreaming == true) stream?.stopStream() }
        setStatus(if (saveLocalCopy)
            "Clave LIVE rechazada. La copia MP4 local continúa."
            else "Clave LIVE rechazada. No hay copia local para recuperar."
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
            runCatching { stream?.startPreview(preview) }
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
        runCatching { stream?.release() }
        stream = null
        cameraVideoSource = null
        prepared = false
        endpointInput.text?.clear()
        mediaScope.cancel()
        super.onDestroy()
    }
}
