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
import android.os.SystemClock
import android.widget.Button
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import java.io.File
import java.util.concurrent.Executors

/**
 * W99 (Claude, owner decision 2A): "Grabar pantalla" without any transmission.
 * The person confirms, Android shows its own screen/app selector, and
 * WivraScreenRecordService writes a private MP4. Afterwards the person chooses
 * Save to the gallery (then it appears in the editor's Import list as a phone
 * video), Later (stays private, listed under "Grabaciones sin guardar") or Delete.
 */
class WivraScreenRecordActivity : ComponentActivity() {
    private lateinit var status: TextView
    private lateinit var clock: TextView
    private lateinit var startButton: Button
    private lateinit var stopButton: Button
    private lateinit var pendingButton: Button
    private lateinit var micOption: CheckBox
    private var asking = false
    private var mediaBusy = false
    private var note: String? = null   // this screen's own last message (saved, deleted…)
    private val handler = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()

    private val poller = object : Runnable {
        override fun run() {
            if (isDestroyed || isFinishing) return
            val active = WivraScreenRecordService.active
            if (active) note = null
            status.text = when {
                mediaBusy -> getString(R.string.srec_verifying)
                note != null -> note
                else -> WivraScreenRecordService.statusMessage.ifEmpty { getString(R.string.srec_idle) }
            }
            val since = WivraScreenRecordService.startedAt
            clock.text = if (WivraScreenRecordService.recording && since > 0)
                "● " + WivraScreenRecordPlan.clock(SystemClock.elapsedRealtime() - since) else ""
            startButton.isEnabled = !active && !asking && !mediaBusy
            stopButton.isEnabled = active
            pendingButton.isEnabled = !mediaBusy
            micOption.isEnabled = !active && !asking
            if (!active && !mediaBusy && hasWindowFocus()) WivraScreenRecordService.takeFinished()?.let { review(it) }
            handler.postDelayed(this, 500L)
        }
    }

    private val projectionPermission = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        asking = false
        val permission = result.data
        if (result.resultCode != Activity.RESULT_OK || permission == null) {
            say(getString(R.string.srec_permission_cancelled))
            return@registerForActivityResult
        }
        val bounds = windowManager.maximumWindowMetrics.bounds
        val withMic = micOption.isChecked && granted(Manifest.permission.RECORD_AUDIO)
        if (!WivraScreenRecordService.offer(result.resultCode, permission, withMic, bounds.width(), bounds.height())) {
            say(getString(R.string.srec_already_active))
            return@registerForActivityResult
        }
        // The one-use consent is NOT put in this Intent: it stays in memory only.
        try {
            startForegroundService(Intent(this, WivraScreenRecordService::class.java)
                .setAction(WivraScreenRecordService.ACTION_START))
            note = null
            status.text = getString(R.string.srec_starting)
        } catch (_: Exception) {
            WivraScreenRecordService.withdrawOffer()
            say(getString(R.string.srec_service_failed))
        }
    }

    private val micPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { ok ->
        if (!ok) {
            micOption.isChecked = false
            say(getString(R.string.srec_no_mic_permission))
        }
        requestScreen()
    }

    private fun say(text: String) {
        note = text
        status.text = text
    }

    private fun granted(permission: String) =
        checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(22, 22, 22, 22)
        }
        root.addView(TextView(this).apply {
            text = getString(R.string.srec_heading)
            textSize = 19f
            isAccessibilityHeading = true
        })
        root.addView(TextView(this).apply { text = getString(R.string.srec_intro) })
        micOption = CheckBox(this).apply { text = getString(R.string.screen_mic_option) }
        root.addView(micOption)
        clock = TextView(this).apply { textSize = 22f }
        root.addView(clock)
        status = TextView(this).apply {
            accessibilityLiveRegion = android.view.View.ACCESSIBILITY_LIVE_REGION_POLITE
            textSize = 15f
            text = WivraScreenRecordService.statusMessage.ifEmpty { getString(R.string.srec_idle) }
        }
        root.addView(status)
        startButton = Button(this).apply {
            text = getString(R.string.srec_start_button)
            setOnClickListener { confirmAndChoose() }
        }
        root.addView(startButton)
        stopButton = Button(this).apply {
            text = getString(R.string.srec_stop_button)
            setOnClickListener {
                if (WivraScreenRecordService.active) startService(Intent(
                    this@WivraScreenRecordActivity, WivraScreenRecordService::class.java
                ).setAction(WivraScreenRecordService.ACTION_STOP))
            }
        }
        root.addView(stopButton)
        pendingButton = Button(this).apply {
            text = getString(R.string.srec_pending_button)
            setOnClickListener { showPending() }
        }
        root.addView(pendingButton)
        root.addView(Button(this).apply {
            text = getString(R.string.srec_back)
            setOnClickListener { finish() }
        })
        setContentView(root)
        WivraUi.styleAll(root)
        WivraUi.primary(startButton)
    }

    private fun confirmAndChoose() {
        if (asking || WivraScreenRecordService.active || mediaBusy) return
        val bounds = windowManager.maximumWindowMetrics.bounds
        val size = WivraScreenRecordPlan.forScreen(bounds.width(), bounds.height())
        val free = runCatching { filesDir.usableSpace }.getOrDefault(0L)
        if (WivraScreenRecordPlan.mustStopForSpace(free, size, micOption.isChecked)) {
            say(getString(R.string.srec_no_space))
            return
        }
        val minutes = WivraScreenRecordPlan.minutesThatFit(free, size, micOption.isChecked)
        AlertDialog.Builder(this)
            .setTitle(R.string.srec_confirm_title)
            .setMessage(getString(R.string.srec_confirm_body) +
                (if (micOption.isChecked) " " + getString(R.string.srec_confirm_mic) else "") + "\n\n" +
                getString(R.string.srec_confirm_space, minutes.coerceAtMost(9_999L).toInt()))
            .setNegativeButton(R.string.plive_cancel, null)
            .setPositiveButton(R.string.srec_confirm_go) { _, _ ->
                if (micOption.isChecked && !granted(Manifest.permission.RECORD_AUDIO)) {
                    asking = true
                    micPermission.launch(Manifest.permission.RECORD_AUDIO)
                } else requestScreen()
            }.show()
    }

    private fun requestScreen() {
        try {
            val manager = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            asking = true
            // Android's own dialog decides what can be captured (whole screen or one app).
            projectionPermission.launch(manager.createScreenCaptureIntent())
        } catch (_: Exception) {
            asking = false
            say(getString(R.string.srec_request_failed))
        }
    }

    private fun verified(file: File): Boolean =
        WivraPhoneMediaStore.isWivraPrivate(this, file) && !WivraPhoneMediaStore.isWriting(file) &&
            WivraCaptureMediaVerifier.verifyFile(file, file.parentFile!!).valid

    private fun busy(on: Boolean) {
        mediaBusy = on
        if (on) status.text = getString(R.string.srec_verifying)
        else note = null
    }

    /** Check the MP4 off the UI thread, then ask Save / Later / Delete. */
    private fun review(file: File) {
        if (mediaBusy || isFinishing || isDestroyed) return
        busy(true)
        io.execute {
            val ok = runCatching { verified(file) }.getOrDefault(false)
            runOnUiThread {
                busy(false)
                if (isFinishing || isDestroyed) return@runOnUiThread
                if (ok) askKeep(file) else say(getString(R.string.srec_uncertified))
            }
        }
    }

    private fun askKeep(file: File) {
        AlertDialog.Builder(this)
            .setTitle(R.string.srec_keep_title)
            .setMessage(R.string.srec_keep_message)
            .setPositiveButton(R.string.srec_save) { _, _ ->
                if (mediaBusy) return@setPositiveButton
                busy(true)
                io.execute {
                    val saved = runCatching {
                        check(verified(file)) { "MP4 changed before save" }
                        WivraPhoneMediaStore.publish(this, file)
                    }.isSuccess
                    runOnUiThread {
                        busy(false)
                        if (!isDestroyed) say(getString(if (saved) R.string.srec_saved else R.string.srec_save_failed))
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
                        val gone = runCatching { WivraPhoneMediaStore.discard(this, file) }.getOrDefault(false)
                        if (gone) say(getString(R.string.srec_deleted))
                    }.show()
            }.show()
    }

    /** Safe recovery: every private MP4 not being written (also after a crash) can be reviewed. */
    private fun showPending() {
        if (mediaBusy) return
        val files = WivraPhoneMediaStore.pendingVideos(this)
        if (files.isEmpty()) {
            say(getString(R.string.srec_no_pending))
            return
        }
        val titles = files.map { "${it.name.take(58)} · ${it.length() / 1024} KiB" }
        AlertDialog.Builder(this)
            .setTitle(R.string.plive_pending_title)
            .setItems(titles.toTypedArray()) { _, i -> review(files[i]) }
            .setNegativeButton(R.string.plive_close, null).show()
    }

    override fun onStart() {
        super.onStart()
        handler.removeCallbacks(poller)
        handler.post(poller)
    }

    override fun onStop() {
        // The recording continues in the visible foreground service; Stop is in the notification.
        handler.removeCallbacks(poller)
        super.onStop()
    }

    override fun onDestroy() {
        handler.removeCallbacks(poller)
        io.shutdown()
        super.onDestroy()
    }
}
