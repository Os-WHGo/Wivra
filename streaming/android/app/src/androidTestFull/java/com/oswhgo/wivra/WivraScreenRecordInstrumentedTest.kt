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

    /** The emulator's own launcher sometimes stops answering («isn't responding»): wait for it, it is not Wivra. */
    private fun dismissSystemNotResponding(device: UiDevice) {
        repeat(3) {
            val wait = device.wait(Until.findObject(By.text(Pattern.compile("(?i)^wait$"))), 1_500) ?: return
            if (device.findObject(By.textContains("isn't responding")) == null && device.findObject(By.textContains("not responding")) == null) return
            wait.click()
            SystemClock.sleep(1_000)
        }
    }

    @Test fun recordsTheScreenToAValidPrivateMp4() {
        val device = UiDevice.getInstance(instrumentation)
        shell("settings put global hide_error_dialogs 1")
        shell("appops set ${context.packageName} PROJECT_MEDIA allow")
        dismissSystemNotResponding(device)
        context.startActivity(Intent(context, WivraScreenRecordActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        var start = device.wait(Until.findObject(text(R.string.srec_start_button)), 15_000)
        if (start == null) {
            dismissSystemNotResponding(device)
            start = device.wait(Until.findObject(text(R.string.srec_start_button)), 10_000)
        }
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
            journeyE(file)
        } finally {
            file?.let { runCatching { WivraPhoneMediaStore.discard(context, it) } }
            shell("appops set ${context.packageName} PROJECT_MEDIA default")
        }
    }

    /**
     * Beta journey E chained (Claude): the recording just made → «recover» (listed among the pending private
     * videos) → «save locally» (the real MediaStore publication to Movies/Wivra) → imported into the REAL editor
     * WebView from that saved item → exported with the editor's own Export buttons (native progressive save,
     * verified by the native side). Emulator, not a phone.
     */
    private fun journeyE(file: File) {
        assertTrue("recover: the finished recording is offered among the pending videos",
            WivraPhoneMediaStore.pendingVideos(context).any { it.canonicalPath == file.canonicalPath })
        val saved = WivraPhoneMediaStore.publish(context, file)
        try {
            val bytes = context.contentResolver.openInputStream(saved)!!.use { it.readBytes() }
            assertTrue("saved item readable (${bytes.size} bytes)", bytes.size > 1000)
            val activity = instrumentation.startActivitySync(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            instrumentation.waitForIdleSync()
            try {
                val editor = findEditor(activity.window.decorView) ?: error("editor WebView")
                var ready = ""
                for (i in 0 until 90) {
                    ready = eval(editor, "(function(){return window.WivraEditorImport&&typeof importSelectedFiles==='function'?'ready':'loading'})()")
                    if (ready == "\"ready\"") break
                    SystemClock.sleep(500)
                }
                assertTrue("editor ready ($ready)", ready == "\"ready\"")
                eval(editor, "window.__jeClip='" + android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP) + "';'ok'")
                eval(editor, "window.__jeOut='running';(async()=>{try{" +
                    "const b=Uint8Array.from(atob(window.__jeClip),c=>c.charCodeAt(0));delete window.__jeClip;" +
                    "await importSelectedFiles([new File([b],'Wivra_Screen_E.mp4',{type:'video/mp4'})]);" +
                    "for(let i=0;i<100&&!(session&&session.project.clips.length);i++)await new Promise(r=>setTimeout(r,100));" +
                    "if(!session||!session.project.clips.length)throw new Error('not imported');" +
                    "const total=totalDuration(session.project);" +
                    "$('bExp').onclick();if($('expSave'))$('expSave').value='auto';await $('expGo').onclick();" +
                    "window.__jeOut=JSON.stringify({ok:$('expDone').style.display==='block'&&$('expMsg').className!=='bad',total,msg:$('expMsg').textContent.slice(0,300)});" +
                    "}catch(e){window.__jeOut=JSON.stringify({ok:false,error:String(e&&e.message||e)})}})();'started'")
                var state = "\"running\""
                for (i in 0 until 120) {
                    if (state != "\"running\"") break
                    SystemClock.sleep(1000)
                    state = eval(editor, "String(window.__jeOut)")
                }
                val decoded = org.json.JSONTokener(state).nextValue() as String
                instrumentation.sendStatus(0, android.os.Bundle().apply { putString("WIVRA-JOURNEY-E", decoded.take(400)) })
                val out = org.json.JSONObject(decoded)
                assertTrue("editor export of the screen recording: ${out.optString("error")} ${out.optString("msg")}", out.optBoolean("ok"))
            } finally {
                instrumentation.runOnMainSync { activity.finish() }
                instrumentation.waitForIdleSync()
            }
        } finally {
            runCatching { context.contentResolver.delete(saved, null, null) }
        }
    }

    private fun findEditor(node: android.view.View): android.webkit.WebView? {
        if (node is android.webkit.WebView) return node
        if (node is android.view.ViewGroup) for (i in 0 until node.childCount) findEditor(node.getChildAt(i))?.let { return it }
        return null
    }

    private fun eval(webView: android.webkit.WebView, source: String): String {
        val latch = java.util.concurrent.CountDownLatch(1)
        var result = ""
        instrumentation.runOnMainSync { webView.evaluateJavascript(source) { value -> result = value; latch.countDown() } }
        assertTrue("WebView JS did not answer", latch.await(60, java.util.concurrent.TimeUnit.SECONDS))
        return result
    }
}
