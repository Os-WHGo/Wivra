package com.oswhgo.wivra

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.WindowManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts

/**
 * Entry point for an explicitly selected screen/app-window LIVE on Android.
 * MediaProjection shows the system screen/app selector; this app does not
 * monitor, select or bypass other applications or protected content.
 *
 * The service owns the actual RTMP stream so the user may open the selected
 * app while broadcasting. The Android foreground notification has Stop.
 */
class WivraScreenLiveActivity : ComponentActivity() {
    private lateinit var endpoint: EditText
    private lateinit var status: TextView
    private lateinit var startButton: Button
    private var pendingEndpoint: String? = null
    private val handler = Handler(Looper.getMainLooper())

    private val statusPoller = object : Runnable {
        override fun run() {
            if (!isDestroyed && !isFinishing) {
                status.text = WivraScreenLiveService.statusMessage
                startButton.isEnabled = pendingEndpoint == null &&
                    !WivraScreenLiveService.active
                handler.postDelayed(this, 1_000L)
            }
        }
    }

    private val projectionPermission = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val address = pendingEndpoint
        pendingEndpoint = null
        val permission = result.data
        if (result.resultCode != Activity.RESULT_OK ||
            permission == null || address == null) {
            status.text = "Permiso cancelado. No se transmite la pantalla."
            return@registerForActivityResult
        }
        if (!WivraScreenLiveService.offer(result.resultCode, permission, address)) {
            status.text = "LIVE de pantalla ya activo o dirección no válida."
            return@registerForActivityResult
        }
        // A one-use projection token and private RTMP key are deliberately NOT
        // added to this Intent, logs, prefs or Editor. They stay in RAM only.
        try {
            val start = Intent(this, WivraScreenLiveService::class.java)
                .setAction(WivraScreenLiveService.ACTION_START)
            startForegroundService(start)
            endpoint.text?.clear()
            status.text = "Captura autorizada. Conectando…"
        } catch (_: Exception) {
            WivraScreenLiveService.withdrawOffer()
            status.text = "Android no pudo iniciar el servicio de captura."
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Never show the stream key in recents, screenshots or Autofill.
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(22, 22, 22, 22)
        }
        root.addView(TextView(this).apply {
            text = "Wivra LIVE · pantalla o aplicación"
            textSize = 19f
        })
        root.addView(TextView(this).apply {
            text = "1. Introduce tu destino RTMP/RTMPS. " +
                "2. Elige pantalla completa o una aplicación en el selector de Android. " +
                "3. Confirma para emitir. La notificación visible permite detener LIVE. " +
                "La captura de pantalla NO incluye audio interno ni micrófono, " +
                "y esta primera ruta NO guarda copia MP4 local. " +
                "Antes comprueba que tu plataforma archive el VOD. " +
                "Contenido protegido puede aparecer en negro."
        })
        endpoint = EditText(this).apply {
            hint = "rtmps://servidor/live/clave"
            inputType = InputType.TYPE_CLASS_TEXT or
                InputType.TYPE_TEXT_VARIATION_PASSWORD or
                InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            isSaveEnabled = false
            setSingleLine(true)
            importantForAutofill = android.view.View.IMPORTANT_FOR_AUTOFILL_NO
            contentDescription = "URL RTMP/RTMPS privada para pantalla LIVE"
        }
        root.addView(endpoint)
        status = TextView(this).apply {
            text = WivraScreenLiveService.statusMessage
            textSize = 15f
        }
        root.addView(status)
        startButton = Button(this).apply {
            text = "Elegir pantalla o aplicación e iniciar LIVE"
            setOnClickListener { confirmAndChooseScreen() }
        }
        root.addView(startButton)
        root.addView(Button(this).apply {
            text = "Detener LIVE de pantalla"
            setOnClickListener {
                startService(Intent(
                    this@WivraScreenLiveActivity, WivraScreenLiveService::class.java
                ).setAction(WivraScreenLiveService.ACTION_STOP))
            }
        })
        root.addView(Button(this).apply {
            text = "Volver a Wivra"
            setOnClickListener { finish() }
        })
        setContentView(root)
    }

    private fun confirmAndChooseScreen() {
        if (pendingEndpoint != null || WivraScreenLiveService.active) return
        val address = endpoint.text.toString()
        if (!WivraLiveEndpoint.valid(address)) {
            status.text = "Introduce una URL RTMP/RTMPS válida."
            return
        }
        AlertDialog.Builder(this)
            .setTitle("Confirmar LIVE público de pantalla")
            .setMessage(
                "Tu pantalla o la aplicación que elijas puede mostrar datos " +
                    "privados y se transmitirá a un servidor externo. " +
                    "Wivra no graba una copia local en este modo. " +
                    "El VOD del proveedor podría no guardarse. " +
                    "Android pedirá permiso en cada nueva sesión. ¿Continuar?"
            )
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("Elegir pantalla") { _, _ ->
                try {
                    val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as
                        MediaProjectionManager
                    pendingEndpoint = address
                    projectionPermission.launch(manager.createScreenCaptureIntent())
                    // Never persist or log address; the OS permission dialog
                    // decides what can actually be captured.
                } catch (_: Exception) {
                    pendingEndpoint = null
                    status.text = "Android no pudo solicitar el permiso de pantalla."
                }
            }.show()
    }

    override fun onStart() {
        super.onStart()
        handler.removeCallbacks(statusPoller)
        handler.post(statusPoller)
    }

    override fun onStop() {
        handler.removeCallbacks(statusPoller)
        // Screen LIVE intentionally continues in the user-visible service
        // while the user opens another app. Stop is always in notification.
        super.onStop()
    }

    override fun onDestroy() {
        handler.removeCallbacks(statusPoller)
        endpoint.text?.clear()
        pendingEndpoint = null
        super.onDestroy()
    }
}
