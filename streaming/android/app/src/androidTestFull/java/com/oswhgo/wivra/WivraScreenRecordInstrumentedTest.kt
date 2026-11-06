package com.oswhgo.wivra

import android.content.Intent
import android.media.MediaMetadataRetriever
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import org.junit.Assert.fail
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.util.regex.Pattern

/**
 * W105 (Claude): the W99 local screen recording, end to end in the Android emulator.
 * The person's taps are made with UiAutomator; Android's own screen-capture consent is
 * pre-allowed for this test only with `appops PROJECT_MEDIA` (what Android's own test suite
 * does), and the system dialog is still tapped through if it appears. No microphone, no
 * network. Proves the RootEncoder record-only path writes a valid MP4; not a phone test.
 */
@RunWith(AndroidJUnit4::class)
class WivraScreenRecordInstrumentedTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext

    private fun shell(cmd: String) {
        instrumentation.uiAutomation.executeShellCommand(cmd).close()
    }

    private fun waitFor(timeoutMs: Long, what: () -> Boolean): Boolean {
        val end = SystemClock.uptimeMillis() + timeoutMs
        while (SystemClock.uptimeMillis() < end) { if (what()) return true; SystemClock.sleep(200) }
        return what()
    }

    /** Any letter case: Android may show dialog buttons in capitals. */
    private fun text(id: Int) = By.text(Pattern.compile("(?i)" + Pattern.quote(context.getString(id))))

    /** What is on screen, for a readable failure message. */
    private fun screen(device: UiDevice): String =
        runCatching {
            device.findObjects(By.textContains("")).mapNotNull { runCatching { it.text }.getOrNull() }
                .filter { it.isNotBlank() }.joinToString(" | ").take(600)
        }.getOrDefault("?")

    @Test fun recordsTheScreenToAValidPrivateMp4() {
        val device = UiDevice.getInstance(instrumentation)
        shell("appops set ${context.packageName} PROJECT_MEDIA allow")
        context.startActivity(Intent(context, WivraScreenRecordActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        val start = device.wait(Until.findObject(text(R.string.srec_start_button)), 15_000)
        if (start == null) fail("start button; on screen: ${screen(device)}")
        start!!.click()
        val go = device.wait(Until.findObject(text(R.string.srec_confirm_go)), 10_000)
        if (go == null) fail("confirmation dialog; on screen: ${screen(device)}")
        go!!.click()
        // If Android still shows its own dialog: whole screen, then start.
        if (!waitFor(4_000) { WivraScreenRecordService.active }) {
            device.wait(Until.findObject(By.text(Pattern.compile("(?i)a single app|one app"))), 3_000)?.let { spinner ->
                spinner.click()
                device.wait(Until.findObject(By.text(Pattern.compile("(?i)entire screen|whole screen"))), 3_000)?.click()
            }
            device.wait(Until.findObject(By.text(Pattern.compile("(?i)^(start|start now|start recording|next)$"))), 5_000)?.click()
        }
        if (!waitFor(20_000) { WivraScreenRecordService.recording })
            fail("recording started; status «${WivraScreenRecordService.statusMessage}»; on screen: ${screen(device)}")
        SystemClock.sleep(4_000)
        // Leave Wivra's screen so it does not take the finished file for its own review dialog.
        device.pressHome()
        context.startService(Intent(context, WivraScreenRecordService::class.java).setAction(WivraScreenRecordService.ACTION_STOP))
        assertTrue("recording stopped", waitFor(15_000) { !WivraScreenRecordService.active })
        // The service hands the file over only after closing it (a moment after `active` turns false).
        var taken: File? = null
        waitFor(15_000) { taken = taken ?: WivraScreenRecordService.takeFinished(); taken != null }
        val file: File? = taken
        if (file == null) {
            val pending = WivraPhoneMediaStore.pendingVideos(context).joinToString { "${it.name}:${it.length()}" }
            fail("finished private MP4; status «${WivraScreenRecordService.statusMessage}»; private folder: [$pending]")
        }
        try {
            assertTrue(WivraPhoneMediaStore.isWivraPrivate(context, file!!))
            assertTrue("not marked as being written", !WivraPhoneMediaStore.isWriting(file))
            val report = WivraCaptureMediaVerifier.verifyFile(file, file.parentFile!!)
            assertTrue("valid MP4: ${report.reason}", report.valid)
            val meta = MediaMetadataRetriever()
            try {
                meta.setDataSource(file.absolutePath)
                val ms = meta.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)!!.toLong()
                val w = meta.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)!!.toInt()
                val h = meta.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)!!.toInt()
                val rot = meta.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toInt() ?: 0
                // Shown in the `am instrument -r` output of the CI log.
                instrumentation.sendStatus(0, android.os.Bundle().apply {
                    putString("WIVRA-SCREENREC", "duration=${ms}ms size=${w}x$h rotation=$rot bytes=${file.length()}")
                })
                assertTrue("at least 2 s recorded ($ms ms)", ms >= 2_000)
                val portrait = if (rot % 180 == 0) h > w else w > h
                assertTrue("portrait like the phone (${w}x$h, rotation $rot)", portrait)
            } finally { meta.release() }
        } finally {
            file?.let { runCatching { WivraPhoneMediaStore.discard(context, it) } }
            shell("appops set ${context.packageName} PROJECT_MEDIA default")
        }
    }
}
