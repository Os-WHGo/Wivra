package com.oswhgo.wivra

import android.content.Intent
import android.media.MediaMetadataRetriever
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Assert.assertFalse
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
 * → «Prepare LIVE» → public-stream confirmation → on air with the private copy →
 * a scene during LIVE (standby card from Sources, then back to Camera) → abrupt server cut → W75 reconnection
 * → on air again → «Stop» → «Save video» → the copy is in the gallery and covers the whole LIVE.
 * The emulator's virtual camera stands in for the phone's; it runs without audio, so the microphone is a phone
 * test. Not a real platform.
 */
@RunWith(AndroidJUnit4::class)
class WivraPhoneLiveJourneyInstrumentedTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext

    private fun shell(cmd: String) { instrumentation.uiAutomation.executeShellCommand(cmd).close() }
    private fun report(line: String) = instrumentation.sendStatus(0, android.os.Bundle().apply { putString("WIVRA-LIVE-PHONE", line) })
    private fun resource(id: Int) = By.res(context.resources.getResourceName(id))
    private fun text(id: Int) = By.text(Pattern.compile("(?i)" + Pattern.quote(context.getString(id))))
    /** A status that has format arguments: match the words before the first argument. */
    private fun startsWith(id: Int) = By.text(Pattern.compile("(?i)^" + Pattern.quote(context.getString(id).substringBefore("%").trim()) + ".*", Pattern.DOTALL))
    private fun screen(device: UiDevice): String = runCatching {
        device.findObjects(By.textContains("")).mapNotNull { runCatching { it.text }.getOrNull() }.filter { it.isNotBlank() }.joinToString(" | ").take(2500)
    }.getOrDefault("?")

    private fun control(pathName: String): String = Socket().use { s ->
        s.connect(InetSocketAddress("10.0.2.2", 8099), 5_000); s.soTimeout = 5_000
        s.getOutputStream().write("GET $pathName HTTP/1.0\r\nHost: 10.0.2.2\r\n\r\n".toByteArray())
        s.getInputStream().readBytes().toString(Charsets.UTF_8).substringAfter("\r\n\r\n")
    }

    /** Like a person: look, and if it is not on screen, scroll the controls down (then up) to find it. */
    private fun find(device: UiDevice, selector: androidx.test.uiautomator.BySelector, timeout: Long): androidx.test.uiautomator.UiObject2? {
        device.wait(Until.findObject(selector), timeout)?.let { return it }
        for (direction in listOf(androidx.test.uiautomator.Direction.DOWN, androidx.test.uiautomator.Direction.UP)) repeat(6) {
            val panel = device.findObject(resource(R.id.live_controls_scroll)) ?: return null
            if (!panel.scroll(direction, 0.6f)) return@repeat
            device.wait(Until.findObject(selector), 800)?.let { return it }
        }
        return null
    }

    /** Reveal the row vertically first, then move only its horizontal viewport. Labels include selection state. */
    private fun clickScene(device: UiDevice, id: Int) {
        val row = find(device, resource(R.id.live_scene_scroll), 3_000)
            ?: run { fail("scene row; on screen: ${screen(device)}"); return }
        device.findObject(resource(id))?.let { it.click(); return }
        for (direction in listOf(androidx.test.uiautomator.Direction.RIGHT, androidx.test.uiautomator.Direction.LEFT)) {
            repeat(8) {
                row.scroll(direction, 0.65f)
                device.findObject(resource(id))?.let { it.click(); return }
            }
        }
        fail("scene control $id; on screen: ${screen(device)}")
    }

    private fun click(device: UiDevice, id: Int, what: String, timeout: Long = 15_000) {
        val o = find(device, text(id), timeout) ?: run { fail("$what; on screen: ${screen(device)}"); return }
        o.click()
    }

    @Test fun phoneLiveWithSceneCutReconnectAndSavedCopy() {
        val device = UiDevice.getInstance(instrumentation)
        shell("settings put global hide_error_dialogs 1")
        shell("pm grant ${context.packageName} android.permission.CAMERA")
        shell("pm grant ${context.packageName} android.permission.RECORD_AUDIO")
        val pendingBefore = WivraPhoneMediaStore.pendingVideos(context).map { it.name }.toSet()
        val savedBefore = WivraPhoneMediaStore.latestSavedVideos(context).map { it.uri.toString() }.toSet()
        context.startActivity(Intent(context, WivraPhoneLiveActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        try {
            if (find(device, text(R.string.plive_preview_ready), 30_000) == null)
                fail("camera preview; on screen: ${screen(device)}")
            // LIVE uses a fixed-height preview above scrollable controls. The endpoint
            // can be below the viewport on an emulator or a small phone; navigate
            // like a person instead of incorrectly declaring a missing field.
            val field = find(device, By.clazz("android.widget.EditText"), 5_000)
                ?: run { fail("address field; on screen: ${screen(device)}"); return }
            field.text = "rtmp://10.0.2.2:1935/live/wivra"
            // No microphone: the CI emulator runs without audio (-noaudio); the microphone is a phone test.
            click(device, R.string.plive_prepare, "Prepare LIVE")
            if (find(device, text(R.string.plive_confirm_title), 10_000) == null) fail("confirmation; on screen: ${screen(device)}")
            click(device, R.string.plive_start, "Start LIVE in the confirmation")
            val began = SystemClock.uptimeMillis()
            if (find(device, text(R.string.plive_on_air_with_copy), 30_000) == null)
                fail("on air with copy; on screen: ${screen(device)}")
            report("on air")

            // A scene during LIVE: the standby card (image scene, microphone muted), then back to the camera.
            click(device, R.string.scene_sources_button, "Sources")
            assertTrue("sources dialog opens during LIVE", device.hasObject(text(R.string.scene_sources_title)))
            assertFalse("video picker stays blocked during LIVE", device.hasObject(text(R.string.scene_pick_video)))
            assertFalse("image picker stays blocked during LIVE", device.hasObject(text(R.string.scene_pick_image)))
            click(device, R.string.scene_standby, "Standby screen")
            click(device, R.string.scene_standby_brb, "Be right back")
            if (find(device, text(R.string.scene_standby_ready), 10_000) == null) fail("standby scene; on screen: ${screen(device)}")
            report("scene: standby card")
            SystemClock.sleep(3_000)
            clickScene(device, R.id.live_scene_image)
            assertTrue("standby selection is accessible at the right end", device.findObject(resource(R.id.live_scene_image)).isSelected)
            clickScene(device, R.id.live_scene_camera)
            assertTrue("camera selected after standby", device.findObject(resource(R.id.live_scene_camera)).isSelected)
            SystemClock.sleep(3_000)

            report("cut: " + control("/cut"))
            if (find(device, startsWith(R.string.plive_reconnect_with_copy), 20_000) == null)
                fail("reconnection message; on screen: ${screen(device)}")
            report("reconnecting")
            if (find(device, text(R.string.plive_on_air_with_copy), 45_000) == null)
                fail("on air again after the cut; on screen: ${screen(device)}")
            report("on air again")
            SystemClock.sleep(4_000)
            val elapsed = (SystemClock.uptimeMillis() - began) / 1000.0

            click(device, R.string.plive_stop, "Stop LIVE")
            if (find(device, text(R.string.plive_keep_title), 30_000) == null) fail("keep dialog; on screen: ${screen(device)}")
            // Leave it private, recreate the screen, then recover it through the user-facing pending list.
            val pending = WivraPhoneMediaStore.pendingVideos(context).firstOrNull { it.name !in pendingBefore && !WivraPhoneMediaStore.isWriting(it) }
                ?: run { fail("finalized private copy offered for recovery"); return }
            click(device, R.string.plive_later, "Keep private for later")
            assertTrue("Later preserves the private MP4", pending.isFile && pending.length() > 0L)
            device.pressBack()
            context.startActivity(Intent(context, WivraPhoneLiveActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            click(device, R.string.plive_review_pending, "Recover pending video")
            val recovered = find(device, By.textStartsWith(pending.name.take(58)), 10_000)
                ?: run { fail("private copy available after reopening"); return }
            recovered.click()
            if (find(device, text(R.string.plive_keep_title), 30_000) == null) fail("recovered keep dialog")
            click(device, R.string.plive_keep_save, "Save recovered video")
            if (find(device, text(R.string.plive_saved), 30_000) == null) fail("saved; on screen: ${screen(device)}")

            val saved = WivraPhoneMediaStore.latestSavedVideos(context).firstOrNull { it.uri.toString() !in savedBefore }
                ?: run { fail("a new video in the gallery"); return }
            val r = MediaMetadataRetriever()
            try {
                r.setDataSource(context, saved.uri)
                val ms = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)!!.toLong()
                report("saved ${saved.title} durationMs=$ms elapsed=${"%.1f".format(elapsed)}s server=${runCatching { control("/status") }.getOrDefault("?")}")
                assertTrue("the saved copy covers the whole LIVE across the cut ($ms ms of ${"%.1f".format(elapsed)} s)", ms >= (elapsed - 5.0) * 1000)
            } finally {
                r.release()
                runCatching { context.contentResolver.delete(saved.uri, null, null) }
            }
        } finally {
            device.pressBack()
        }
    }
}
