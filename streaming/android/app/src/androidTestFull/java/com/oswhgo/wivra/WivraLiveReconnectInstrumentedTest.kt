package com.oswhgo.wivra

import android.media.MediaMetadataRetriever
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.ByteBuffer
import java.util.Collections

/**
 * Beta journey C chained in the emulator (Claude): the Ray-Ban LIVE engine publishes to a LOCAL RTMP server
 * on the CI machine (10.0.2.2, tools/rtmp-cut-server.cjs — never the internet) with its private MP4 copy →
 * on air → the server is cut abruptly → the W75 policy reconnects → on air again → stop → the copy is
 * continuous across the cut. No microphone, synthetic DAT-shaped frames. Not a phone and not a real platform.
 */
@RunWith(AndroidJUnit4::class)
class WivraLiveReconnectInstrumentedTest {
    private val instrumentation get() = InstrumentationRegistry.getInstrumentation()
    private val context get() = instrumentation.targetContext

    private fun report(line: String) = instrumentation.sendStatus(0, android.os.Bundle().apply { putString("WIVRA-LIVE-C", line) })

    /** Raw socket: the app forbids cleartext HTTP clients, and this is a test-only call to the CI machine. */
    private fun control(pathName: String): String = Socket().use { s ->
        s.connect(InetSocketAddress("10.0.2.2", 8099), 5_000)
        s.soTimeout = 5_000
        s.getOutputStream().write("GET $pathName HTTP/1.0\r\nHost: 10.0.2.2\r\n\r\n".toByteArray())
        s.getInputStream().readBytes().toString(Charsets.UTF_8).substringAfter("\r\n\r\n")
    }

    private fun waitFor(ms: Long, what: () -> Boolean): Boolean {
        val end = SystemClock.uptimeMillis() + ms
        while (SystemClock.uptimeMillis() < end) { if (what()) return true; SystemClock.sleep(200) }
        return what()
    }

    @Test fun liveSurvivesAServerCutAndTheCopyStaysContinuous() {
        val publisher = WivraRayBanLiveFactory.create()!!
        val copy = File(context.cacheDir, "live-reconnect-test.mp4").apply { delete() }
        val plan = WivraRayBanLivePlan.forProfile(WivraDatProfile.ECONOMY, withAudio = false)
        val statuses = Collections.synchronizedList(mutableListOf<String>())
        var started = false
        instrumentation.runOnMainSync {
            started = publisher.start(context, "rtmp://10.0.2.2:1935/live/wivra", plan, null, copy, object : WivraRayBanLive.Listener {
                override fun onLiveStatus(status: String, a: Int, b: Int, c: Int) { statuses.add(status) }
            })
        }
        assertTrue("LIVE start", started)
        val w = plan.width; val h = plan.height
        val frame = ByteArray(w * h * 3 / 2).also { it.fill(120.toByte(), 0, w * h); it.fill(128.toByte(), w * h, it.size) }
        val feeding = java.util.concurrent.atomic.AtomicBoolean(true)
        val feeder = Thread {
            var k = 0
            while (feeding.get()) {
                // A moving bright bar, so every second of the copy has changing pictures.
                val bar = (k++ * 4) % h
                for (x in 0 until w) frame[bar * w + x] = 235.toByte()
                publisher.offerI420(ByteBuffer.wrap(frame), w, h)
                for (x in 0 until w) frame[bar * w + x] = 120.toByte()
                SystemClock.sleep(1000L / plan.fps)
            }
        }.apply { start() }
        val began = SystemClock.uptimeMillis()
        try {
            assertTrue("on air at the local server; statuses $statuses", waitFor(25_000) { "on_air" in statuses })
            SystemClock.sleep(8_000)      // the server has written pictures of the first segment
            report("cut: " + control("/cut"))
            val firstOnAir = statuses.indexOf("on_air")
            assertTrue("reconnected after the cut; statuses $statuses", waitFor(45_000) {
                synchronized(statuses) { statuses.drop(firstOnAir + 1).let { it.contains("reconnect") && it.lastIndexOf("on_air") > it.indexOf("reconnect") } }
            })
            SystemClock.sleep(4_000)
        } finally {
            feeding.set(false)
            feeder.join(2_000)
            var closed = false
            instrumentation.runOnMainSync { closed = publisher.stop() }
            val elapsed = (SystemClock.uptimeMillis() - began) / 1000.0
            report("statuses=$statuses closed=$closed elapsed=${"%.1f".format(elapsed)}s server=${runCatching { control("/status") }.getOrDefault("?")}")
            val r = MediaMetadataRetriever()
            try {
                r.setDataSource(copy.absolutePath)
                val ms = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)!!.toLong()
                report("copy durationMs=$ms bytes=${copy.length()}")
                assertTrue("the private copy covers the whole LIVE, across the cut ($ms ms of ${"%.1f".format(elapsed)} s)", ms >= (elapsed - 4.0) * 1000)
            } finally {
                r.release()
                copy.delete()
            }
        }
    }
}
