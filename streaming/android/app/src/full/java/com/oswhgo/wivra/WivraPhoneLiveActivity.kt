package com.oswhgo.wivra

import android.Manifest
import android.app.AlertDialog
import android.content.pm.PackageManager
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
    private lateinit var localCopyOption: CheckBox
    private lateinit var storageHint: TextView
    private lateinit var status: TextView
    private lateinit var startButton: Button
    private lateinit var stopButton: Button
    private var stream: RtmpStream? = null
    private var pendingFile: File? = null
    private var saveLocalCopy = false
    private var localCopyFinalized = false
    private var prepared = false
    private var stopping = false
    private var liveRequested = false
    private var connected = false
    private var initiatedByUser = false
    private var awaitingMicPermission = false
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
        micOption.setOnCheckedChangeListener { _, _ -> updateStorageHint() }
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
            val bitrate = 1_200_000.0 + if (micOption.isChecked) 64_000.0 else 0.0
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

    private fun preparePreview() {
        if (prepared || stream != null || isFinishing) return
        try {
            // Never open the microphone merely because the user previews
            // or selects video-only LIVE. NoAudioSource is an actual no-op
            // source; RootEncoder starts its audioSource during encoding.
            val publisher = RtmpStream(
                applicationContext, this,
                Camera2Source(applicationContext), NoAudioSource()
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
            stream = publisher
            prepared = true
            if (preview.holder.surface.isValid) publisher.startPreview(preview)
            setStatus("Cámara lista. Ninguna transmisión iniciada.")
            startButton.isEnabled = true
        } catch (_: Exception) {
            prepared = false
            runCatching { stream?.release() }
            stream = null
            setStatus("No se pudo abrir la cámara para LIVE.")
        }
    }

    private fun requestLive() {
        if (mediaBusy) return
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
        if (!prepared || stopping || initiatedByUser || isFinishing) return
        val address = endpointInput.text.toString()
        if (!validEndpoint(address)) return
        val withAudio = micOption.isChecked
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
        if (!prepared || stopping || initiatedByUser || isFinishing) return
        if (saveCopy && applicationContext.filesDir.usableSpace < minFreeBytes) {
            setStatus("Espacio insuficiente para el MP4. Solo LIVE puede continuar sin copia.")
            return
        }
        val pending: File? = try {
            // The mic is opt-in and no PCM is captured in video-only mode.
            publisher.changeAudioSource(
                if (withAudio) MicrophoneSource() else NoAudioSource()
            )
            if (!publisher.prepareAudio(44_100, false, 64_000)) {
                setStatus("No se pudo preparar el audio seleccionado.")
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
            liveRequested = true
            connected = false
            startButton.isEnabled = false
            stopButton.isEnabled = true
            micOption.isEnabled = false
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
            startButton.isEnabled = prepared && !isFinishing && !mediaBusy
            stopButton.isEnabled = false
            micOption.isEnabled = true
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
        setStatus(if (saveLocalCopy)
            "LIVE falló, pero la copia MP4 local continúa. Detén para revisarla."
            else "LIVE falló. No había copia local: revisa si existe un VOD remoto."
        )
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
        if (prepared && !isFinishing && preview.holder.surface.isValid &&
            stream?.isOnPreview != true) {
            runCatching { stream?.startPreview(preview) }
        }
    }

    override fun onDestroy() {
        storageHandler.removeCallbacks(storageCheck)
        if (initiatedByUser || stream?.isStreaming == true ||
            stream?.isRecording == true) stopAndReview()
        runCatching { stream?.release() }
        stream = null
        prepared = false
        endpointInput.text?.clear()
        mediaScope.cancel()
        super.onDestroy()
    }
}
