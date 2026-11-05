package com.oswhgo.wivra

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.WindowManager
import android.widget.Button
import android.widget.CheckBox
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
    // Optional sources (Claude, owner-approved): only when ticked and granted.
    private lateinit var cameraOption: CheckBox
    private lateinit var frontOption: CheckBox
    private lateinit var micOption: CheckBox
    private var afterSourcePermissions: (() -> Unit)? = null
    private var pendingEndpoint: String? = null
    private val handler = Handler(Looper.getMainLooper())

    private val statusPoller = object : Runnable {
        override fun run() {
            if (!isDestroyed && !isFinishing) {
                status.text = WivraScreenLiveService.statusMessage.ifEmpty { getString(R.string.slive_idle) }
                startButton.isEnabled = pendingEndpoint == null &&
                    !WivraScreenLiveService.active
                val idle = !WivraScreenLiveService.active && pendingEndpoint == null
                cameraOption.isEnabled = idle
                frontOption.isEnabled = idle && cameraOption.isChecked
                micOption.isEnabled = idle
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
            status.text = getString(R.string.slive_permission_cancelled)
            return@registerForActivityResult
        }
        val withCamera = cameraOption.isChecked && granted(Manifest.permission.CAMERA)
        val withMic = micOption.isChecked && granted(Manifest.permission.RECORD_AUDIO)
        if (!WivraScreenLiveService.offer(result.resultCode, permission, address,
                withCamera = withCamera, frontCamera = withCamera && frontOption.isChecked,
                withMic = withMic, receivedMessage = getString(R.string.slive_offer_received))) {
            status.text = getString(R.string.slive_already_active)
            return@registerForActivityResult
        }
        // A one-use projection token and private RTMP key are deliberately NOT
        // added to this Intent, logs, prefs or Editor. They stay in RAM only.
        try {
            val start = Intent(this, WivraScreenLiveService::class.java)
                .setAction(WivraScreenLiveService.ACTION_START)
            startForegroundService(start)
            endpoint.text?.clear()
            status.text = getString(R.string.slive_authorized_connecting)
        } catch (_: Exception) {
            WivraScreenLiveService.withdrawOffer()
            status.text = getString(R.string.slive_service_failed)
        }
    }

    private val sourcePermissions = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { grants ->
        if (cameraOption.isChecked && grants[Manifest.permission.CAMERA] == false) {
            cameraOption.isChecked = false
            status.text = getString(R.string.screen_no_cam_permission)
        }
        if (micOption.isChecked && grants[Manifest.permission.RECORD_AUDIO] == false) {
            micOption.isChecked = false
            status.text = getString(R.string.screen_no_mic_permission)
        }
        val next = afterSourcePermissions
        afterSourcePermissions = null
        next?.invoke()
    }

    private fun granted(permission: String) =
        checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    private fun sendToService(action: String) {
        if (!WivraScreenLiveService.active) return
        startService(Intent(this, WivraScreenLiveService::class.java).setAction(action))
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
            text = getString(R.string.slive_heading)
            textSize = 19f
            isAccessibilityHeading = true   // W87 (Claude): TalkBack heading
        })
        root.addView(TextView(this).apply {
            text = getString(R.string.slive_intro)
        })
        endpoint = EditText(this).apply {
            hint = "rtmps://servidor/live/clave"
            inputType = InputType.TYPE_CLASS_TEXT or
                InputType.TYPE_TEXT_VARIATION_PASSWORD or
                InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
            isSaveEnabled = false
            setSingleLine(true)
            importantForAutofill = android.view.View.IMPORTANT_FOR_AUTOFILL_NO
            contentDescription = getString(R.string.slive_endpoint_description)
        }
        root.addView(endpoint)
        cameraOption = CheckBox(this).apply { text = getString(R.string.screen_cam_option) }
        frontOption = CheckBox(this).apply { text = getString(R.string.screen_front_option) }
        micOption = CheckBox(this).apply { text = getString(R.string.screen_mic_option) }
        root.addView(cameraOption)
        root.addView(frontOption)
        root.addView(micOption)
        status = TextView(this).apply {
            // TalkBack announces connection, reconnection and camera changes.
            accessibilityLiveRegion = android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE
            text = WivraScreenLiveService.statusMessage.ifEmpty { getString(R.string.slive_idle) }
            textSize = 15f
        }
        root.addView(status)
        startButton = Button(this).apply {
            text = getString(R.string.slive_choose_and_start)
            setOnClickListener { confirmAndChooseScreen() }
        }
        root.addView(startButton)
        root.addView(Button(this).apply {
            text = getString(R.string.slive_stop_button)
            setOnClickListener {
                startService(Intent(
                    this@WivraScreenLiveActivity, WivraScreenLiveService::class.java
                ).setAction(WivraScreenLiveService.ACTION_STOP))
            }
        })
        // Live controls for the camera layer; the screen can be stopped alone.
        root.addView(Button(this).apply {
            text = getString(R.string.screen_stop_only)
            setOnClickListener { sendToService(WivraScreenLiveService.ACTION_STOP_SCREEN) }
        })
        root.addView(Button(this).apply {
            text = getString(R.string.screen_toggle_camera)
            setOnClickListener { sendToService(WivraScreenLiveService.ACTION_TOGGLE_CAMERA) }
        })
        root.addView(Button(this).apply {
            text = getString(R.string.screen_move_camera)
            setOnClickListener { sendToService(WivraScreenLiveService.ACTION_CAMERA_CORNER) }
        })
        root.addView(Button(this).apply {
            text = getString(R.string.screen_rotate_camera)
            setOnClickListener { sendToService(WivraScreenLiveService.ACTION_CAMERA_ROTATE) }
        })
        root.addView(Button(this).apply {
            text = getString(R.string.slive_back)
            setOnClickListener { finish() }
        })
        setContentView(root)
        // W83 (Claude): Wivra button look; texts and states unchanged.
        WivraUi.styleAll(root)
        WivraUi.primary(startButton)
    }

    private fun confirmAndChooseScreen() {
        if (pendingEndpoint != null || WivraScreenLiveService.active) return
        val address = endpoint.text.toString()
        if (!WivraLiveEndpoint.valid(address)) {
            status.text = getString(R.string.slive_endpoint_invalid)
            return
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.slive_confirm_title)
            .setMessage(
                getString(R.string.slive_confirm_intro) + " " +
                    (if (cameraOption.isChecked) getString(R.string.screen_confirm_camera) + " " else "") +
                    (if (micOption.isChecked) getString(R.string.screen_confirm_mic) + " " else "") +
                    getString(R.string.slive_confirm_outro)
            )
            .setNegativeButton(R.string.plive_cancel, null)
            .setPositiveButton(R.string.slive_choose_screen) { _, _ ->
                // Camera/microphone permissions first, then the screen consent.
                val needed = buildList {
                    if (cameraOption.isChecked && !granted(Manifest.permission.CAMERA)) add(Manifest.permission.CAMERA)
                    if (micOption.isChecked && !granted(Manifest.permission.RECORD_AUDIO)) add(Manifest.permission.RECORD_AUDIO)
                }
                if (needed.isNotEmpty()) {
                    afterSourcePermissions = { requestScreen(address) }
                    sourcePermissions.launch(needed.toTypedArray())
                } else requestScreen(address)
            }.show()
    }

    private fun requestScreen(address: String) {
                try {
                    val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as
                        MediaProjectionManager
                    pendingEndpoint = address
                    projectionPermission.launch(manager.createScreenCaptureIntent())
                    // Never persist or log address; the OS permission dialog
                    // decides what can actually be captured.
                } catch (_: Exception) {
                    pendingEndpoint = null
                    status.text = getString(R.string.slive_request_failed)
                }
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
