package com.oswhgo.wivra

import android.content.Intent
import android.media.MediaMetadataRetriever
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import java.net.InetSocketAddress
import java.net.Socket
import java.util.regex.Pattern

/**
 * Beta journey C chained with the PHONE camera in the emulator (Claude), driven like a person with UiAutomator:
 * address of a LOCAL RTMP server on the CI machine (tools/rtmp-cut-server.cjs, 10.0.2.2; never the internet)
 * → phone microphone on → «Prepare LIVE» → public-stream confirmation → on air with the private copy →
 * a scene during LIVE (standby card from Sources, then back to Camera) → abrupt server cut → W75 reconnection
 * → on air again → «Stop» → «Save video» → the copy is in the gallery and covers the whole LIVE.
 * The emulator's virtual camera and microphone stand in for the phone's. Not a real platform.
 */
@RunWith(AndroidJUnit4::class)
class WivraPhoneLiveJourneyInstrumentedTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext

    private fun shell(cmd: String) { instrumentation.uiAutomation.executeShellCommand(cmd).close() }
    private fun report(line: String) = instrumentation.sendStatus(0, android.os.Bundle().apply { putString("WIVRA-LIVE-PHONE", line) })
    private fun text(id: Int) = By.text(Pattern.compile("(?i)" + Pattern.quote(context.getString(id))))
    /** A status that has format arguments: match the words before the first argument. */
    private fun startsWith(id: Int) = By.text(Pattern.compile("(?i)^" + Pattern.quote(context.getString(id).substringBefore("%").trim()) + ".*", Pattern.DOTALL))
    private fun screen(device: UiDevice): String = runCatching {
        device.findObjects(By.textContains("")).mapNotNull { runCatching { it.text }.getOrNull() }.filter { it.isNotBlank() }.joinToString(" | ").take(700)
    }.getOrDefault("?")

    private fun control(pathName: String): String = Socket().use { s ->
        s.connect(InetSocketAddress("10.0.2.2", 8099), 5_000); s.soTimeout = 5_000
        s.getOutputStream().write("GET $pathName HTTP/1.0\r\nHost: 10.0.2.2\r\n\r\n".toByteArray())
        s.getInputStream().readBytes().toString(Charsets.UTF_8).substringAfter("\r\n\r\n")
    }

    private fun click(device: UiDevice, id: Int, what: String, timeout: Long = 15_000) {
        val o = device.wait(Until.findObject(text(id)), timeout) ?: run { fail("$what; on screen: ${screen(device)}"); return }
        o.click()
    }

    @Test fun phoneLiveWithMicSceneCutReconnectAndSavedCopy() {
        val device = UiDevice.getInstance(instrumentation)
        shell("settings put global hide_error_dialogs 1")
        shell("pm grant ${context.packageName} android.permission.CAMERA")
        shell("pm grant ${context.packageName} android.permission.RECORD_AUDIO")
        val savedBefore = WivraPhoneMediaStore.latestSavedVideos(context).map { it.uri.toString() }.toSet()
        context.startActivity(Intent(context, WivraPhoneLiveActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        try {
            if (device.wait(Until.findObject(text(R.string.plive_preview_ready)), 30_000) == null)
                fail("camera preview; on screen: ${screen(device)}")
            val field = device.wait(Until.findObject(By.clazz("android.widget.EditText")), 5_000) ?: run { fail("address field"); return }
            field.text = "rtmp://10.0.2.2:1935/live/wivra"
            click(device, R.string.plive_mic_option, "microphone option")
            click(device, R.string.plive_prepare, "Prepare LIVE")
            if (device.wait(Until.findObject(text(R.string.plive_confirm_title)), 10_000) == null) fail("confirmation; on screen: ${screen(device)}")
            click(device, R.string.plive_start, "Start LIVE in the confirmation")
            val began = SystemClock.uptimeMillis()
            if (device.wait(Until.findObject(text(R.string.plive_on_air_with_copy)), 30_000) == null)
                fail("on air with copy; on screen: ${screen(device)}")
            report("on air")

            // A scene during LIVE: the standby card (image scene, microphone muted), then back to the camera.
            click(device, R.string.scene_sources_button, "Sources")
            click(device, R.string.scene_standby, "Standby screen")
            click(device, R.string.scene_standby_brb, "Be right back")
            if (device.wait(Until.findObject(text(R.string.scene_standby_ready)), 10_000) == null) fail("standby scene; on screen: ${screen(device)}")
            report("scene: standby card")
            SystemClock.sleep(3_000)
            click(device, R.string.scene_camera, "Camera scene")
            SystemClock.sleep(3_000)

            report("cut: " + control("/cut"))
            if (device.wait(Until.findObject(startsWith(R.string.plive_reconnect_with_copy)), 20_000) == null)
                fail("reconnection message; on screen: ${screen(device)}")
            report("reconnecting")
            if (device.wait(Until.findObject(text(R.string.plive_on_air_with_copy)), 45_000) == null)
                fail("on air again after the cut; on screen: ${screen(device)}")
            report("on air again")
            SystemClock.sleep(4_000)
            val elapsed = (SystemClock.uptimeMillis() - began) / 1000.0

            click(device, R.string.plive_stop, "Stop LIVE")
            if (device.wait(Until.findObject(text(R.string.plive_keep_title)), 30_000) == null) fail("keep dialog; on screen: ${screen(device)}")
            click(device, R.string.plive_keep_save, "Save video")
            if (device.wait(Until.findObject(text(R.string.plive_saved)), 30_000) == null) fail("saved; on screen: ${screen(device)}")

            val saved = WivraPhoneMediaStore.latestSavedVideos(context).firstOrNull { it.uri.toString() !in savedBefore }
                ?: run { fail("a new video in the gallery"); return }
            val r = MediaMetadataRetriever()
            try {
                r.setDataSource(context, saved.uri)
                val ms = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)!!.toLong()
                val audio = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO)
                report("saved ${saved.title} durationMs=$ms audio=$audio elapsed=${"%.1f".format(elapsed)}s server=${runCatching { control("/status") }.getOrDefault("?")}")
                assertTrue("the saved copy covers the whole LIVE across the cut ($ms ms of ${"%.1f".format(elapsed)} s)", ms >= (elapsed - 5.0) * 1000)
                assertTrue("the copy has the microphone track", audio == "yes")
            } finally {
                r.release()
                runCatching { context.contentResolver.delete(saved.uri, null, null) }
            }
        } finally {
            device.pressBack()
        }
    }
}
