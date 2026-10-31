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
    private lateinit var status: TextView
    private lateinit var startButton: Button
    private lateinit var stopButton: Button
    private var stream: RtmpStream? = null
    private var pendingFile: File? = null
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
            if (applicationContext.filesDir.usableSpace < minFreeBytes) {
                setStatus("Espacio bajo. Deteniendo LIVE para conservar el MP4 local.")
                stopAndReview()
            } else storageHandler.postDelayed(this, 10_000L)
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
            text = "Detener y revisar MP4"
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
        // Do not render the stream key or entire endpoint in the dialog.
        AlertDialog.Builder(this)
            .setTitle("Confirmar emisión pública")
            .setMessage("La cámara se transmitirá a la plataforma externa que " +
                "configuraste. Wivra grabará simultáneamente un MP4 privado. " +
                "¿Quieres iniciar LIVE ahora?")
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("Iniciar LIVE") { _, _ ->
                startLive(address, micOption.isChecked)
            }
            .show()
    }

    private fun startLive(address: String, withAudio: Boolean) {
        if (mediaBusy) return
        val publisher = stream ?: return
        if (!prepared || stopping || initiatedByUser || isFinishing) return
        if (applicationContext.filesDir.usableSpace < minFreeBytes) {
            setStatus("Faltan al menos 128 MB libres. LIVE no se inició.")
            return
        }
        val pending = try {
            // Set the requested source on EVERY attempt. Otherwise a user
            // who enables microphone once then disables it could accidentally
            // keep capturing microphone audio in the next session.
            // Mic permission is checked before arriving here.
            publisher.changeAudioSource(
                if (withAudio) MicrophoneSource() else NoAudioSource()
            )
            // Encoder must be prepared even for NoAudioSource, but no PCM
            // samples are captured or transmitted in video-only mode.
            if (!publisher.prepareAudio(44_100, false, 64_000)) {
                setStatus("No se pudo preparar el audio seleccionado.")
                return
            }
            WivraPhoneMediaStore.createPrivateVideo(applicationContext)
        } catch (_: Exception) {
            setStatus("No fue posible reservar el MP4 local. LIVE no se inició.")
            return
        }
        try {
            publisher.startRecord(
                pending.absolutePath,
                if (withAudio) RecordController.RecordTracks.ALL
                    else RecordController.RecordTracks.VIDEO
            ) { newStatus ->
                if (newStatus == RecordController.Status.RECORDING) {
                    setStatus("Grabación MP4 local activa. Conectando LIVE…")
                }
            }
            pendingFile = pending
            initiatedByUser = true
            liveRequested = true
            connected = false
            startButton.isEnabled = false
            stopButton.isEnabled = true
            micOption.isEnabled = false
            endpointInput.isEnabled = false
            publisher.startStream(address)
            storageHandler.removeCallbacks(storageCheck)
            storageHandler.postDelayed(storageCheck, 10_000L)
            // Never log or persist the URL, including on failure.
            endpointInput.text?.clear()
            setStatus("Conectando LIVE… Grabación local en curso.")
        } catch (_: Exception) {
            setStatus("No se pudo iniciar LIVE. Revisa el MP4 local.")
            liveRequested = false
            connected = false
            runCatching { if (publisher.isStreaming) publisher.stopStream() }
            if (publisher.isRecording) {
                initiatedByUser = true
                pendingFile = pending
                stopAndReview()
            } else {
                // Only an empty file can be safely cleaned up after a
                // failed start. A file with any bytes might contain media,
                // and is never deleted without explicit user consent.
                if (pending.length() == 0L) pending.delete()
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
            endpointInput.isEnabled = true
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
        runCatching { if (publisher?.isStreaming == true) publisher.stopStream() }
        // MP4 is only usable after RootEncoder's MediaMuxer.stop().
        val muxerClosed = runCatching {
            if (publisher?.isRecording == true) {
                // stopRecord() may return false when a SECOND encoder setup
                // fails after MediaMuxer.stop() already finalized the file.
                // Verify actual MP4 bytes separately before offering Save.
                publisher.stopRecord()
                true
            } else false
        }.getOrDefault(false)
        initiatedByUser = false
        stopping = false
        controlsIdle()
        if (file != null && muxerClosed) {
            reviewFile(file)
        } else {
            // Never silently discard a potentially salvageable video.
            setStatus("LIVE detenido. El último archivo no se pudo certificar. " +
                "Cualquier archivo parcial sigue privado.")
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
        setStatus("EN VIVO. Grabando copia local mientras transmites.")
    }
    override fun onConnectionFailed(reason: String) {
        // Some servers embed the full key in error messages.
        if (stopping || !liveRequested) return
        liveRequested = false
        connected = false
        runCatching { if (stream?.isStreaming == true) stream?.stopStream() }
        setStatus("La conexión LIVE falló. La grabación local continúa. " +
            "Pulsa Detener y revisar para conservarla.")
    }
    override fun onDisconnect() {
        if (!stopping && initiatedByUser) {
            liveRequested = false
            connected = false
            setStatus("LIVE desconectado. La copia MP4 local continúa.")
        }
    }
    override fun onAuthError() {
        if (stopping) return
        liveRequested = false
        connected = false
        runCatching { if (stream?.isStreaming == true) stream?.stopStream() }
        setStatus("El servidor rechazó la clave LIVE. MP4 local continúa.")
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
