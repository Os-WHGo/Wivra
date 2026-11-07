package com.oswhgo.wivra

import android.graphics.Color
import android.media.MediaMetadataRetriever
import android.os.SystemClock
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.nio.ByteBuffer

/**
 * Ray-Ban → LIVE engine path in the Android emulator (Claude): synthetic decoded frames shaped like DAT
 * `.raw` 504 × 896 go through WivraRayBanVideoSource and the existing RootEncoder engine into the private
 * MP4 copy (no network, no microphone, no glasses). Checks size, duration and that the picture is upright
 * and not mirrored (bright top-left marker). Not a glasses test: the real DAT stream is tested on 16-11.
 */
@RunWith(AndroidJUnit4::class)
class WivraRayBanLiveInstrumentedTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    /** Shown in the `am instrument -r` output of the CI log. */
    private fun report(line: String) = InstrumentationRegistry.getInstrumentation()
        .sendStatus(0, android.os.Bundle().apply { putString("WIVRA-RBLIVE", line) })

    private fun frame(w: Int, h: Int, k: Int): ByteBuffer {
        val bytes = ByteArray(w * h * 3 / 2)
        for (y in 0 until h) for (x in 0 until w) {
            // Top-left quarter bright, the rest dark; a small moving bar keeps the encoder honest.
            val marker = x < w / 2 && y < h / 2
            val bar = y in (h * 3 / 4) until (h * 3 / 4 + 8) && x == (k * 7) % w
            bytes[y * w + x] = (if (marker || bar) 235 else 16).toByte()
        }
        for (i in w * h until bytes.size) bytes[i] = 128.toByte()
        return ByteBuffer.wrap(bytes)
    }

    @Test fun decodedGlassesFramesBecomeAnUprightH264Copy() {
        val publisher = WivraRayBanLiveFactory.create()
        assertTrue("full package exposes the Ray-Ban LIVE engine", publisher != null)
        val copy = File(context.cacheDir, "rayban-live-test.mp4").apply { delete() }
        val plan = WivraRayBanLivePlan.forProfile(WivraDatProfile.BALANCED, withAudio = false)
        var started = false
        InstrumentationRegistry.getInstrumentation().runOnMainSync {
            started = publisher!!.start(context, null, plan, null, copy, object : WivraRayBanLive.Listener {
                override fun onLiveStatus(status: String, a: Int, b: Int, c: Int) {}
            })
        }
        assertTrue("record-only start", started)
        val w = 504; val h = 896
        val begin = SystemClock.uptimeMillis()
        var k = 0
        while (SystemClock.uptimeMillis() - begin < 4_000) {
            publisher!!.offerI420(frame(w, h, k++), w, h)
            SystemClock.sleep(1000L / plan.fps)
        }
        val stats = publisher!!.stats()
        var closed = false
        InstrumentationRegistry.getInstrumentation().runOnMainSync { closed = publisher.stop() }
        report("offered=${stats.offered} drawn=${stats.drawn} repeated=${stats.repeated} dropped=${stats.dropped} convertMs=${"%.1f".format(stats.convertMs)} bytes=${copy.length()}")
        assertTrue("muxer closed", closed)
        // The emulator CPU is slow and shared; the frame rate a phone holds is measured on the phone (16-11).
        assertTrue("frames drawn (${stats.drawn})", stats.drawn >= 10)
        val r = MediaMetadataRetriever()
        try {
            r.setDataSource(copy.absolutePath)
            val vw = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)!!.toInt()
            val vh = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)!!.toInt()
            val rot = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)?.toInt() ?: 0
            val ms = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)!!.toLong()
            val mime = r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_MIMETYPE)
            report("video=${vw}x$vh rotation=$rot durationMs=$ms mime=$mime")
            assertTrue("portrait glasses size or its 16-aligned fallback: ${vw}x$vh",
                (vw == plan.width && vh == plan.height) || (vw == plan.fallbackWidth && vh == plan.fallbackHeight))
            assertEquals("no rotation flag", 0, rot)
            assertTrue("about 4 s: $ms", ms in 2_500L..6_000L)
            // Quadrant centres and mean luminance at two times, so an orientation problem is visible in the log.
            fun lum(b: android.graphics.Bitmap, fx: Float, fy: Float) =
                Color.luminance(b.getPixel((b.width * fx).toInt().coerceIn(0, b.width - 1), (b.height * fy).toInt().coerceIn(0, b.height - 1)))
            var verdict = false
            for (atUs in longArrayOf(2_000_000L, 3_500_000L)) {
                val picture = r.getFrameAtTime(atUs, MediaMetadataRetriever.OPTION_CLOSEST) ?: continue
                var sum = 0.0
                for (yy in 0 until picture.height step 16) for (xx in 0 until picture.width step 16) sum += Color.luminance(picture.getPixel(xx, yy))
                val mean = sum / (((picture.height + 15) / 16) * ((picture.width + 15) / 16))
                val tl = lum(picture, .25f, .25f); val tr = lum(picture, .75f, .25f)
                val bl = lum(picture, .25f, .75f); val br = lum(picture, .75f, .75f)
                report("at=${atUs / 1000}ms frame=${picture.width}x${picture.height} mean=${"%.3f".format(mean)} tl=${"%.2f".format(tl)} tr=${"%.2f".format(tr)} bl=${"%.2f".format(bl)} br=${"%.2f".format(br)}")
                if (tl > 0.6f && tr < 0.3f && bl < 0.3f && br < 0.3f) verdict = true
            }
            assertTrue("upright, not mirrored: marker stays top-left", verdict)
        } finally {
            r.release()
            copy.delete()
        }
    }
}
