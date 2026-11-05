package com.oswhgo.wivra

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.sin

/** Pure PCM mixing used to put a video's sound into the LIVE audio. — Claude */
class WivraPcmMixTest {
    private fun le(vararg s: Int) = ByteArray(s.size * 2).also { b ->
        s.forEachIndexed { i, v -> b[2 * i] = (v and 0xFF).toByte(); b[2 * i + 1] = ((v shr 8) and 0xFF).toByte() }
    }
    private fun shorts(b: ByteArray) = IntArray(b.size / 2) { i ->
        ((b[2 * i + 1].toInt() shl 8) or (b[2 * i].toInt() and 0xFF)).toShort().toInt()
    }

    @Test fun ringIsBoundedAndOrdered() {
        val r = WivraPcmMix.Ring(5)
        assertEquals(3, r.write(shortArrayOf(1, 2, 3)))
        assertEquals(2, r.write(shortArrayOf(4, 5, 6, 7)))   // only what fits
        val out = ShortArray(4)
        assertEquals(4, r.read(out, 4))
        assertArrayEquals(shortArrayOf(1, 2, 3, 4), out)
        assertEquals(2, r.write(shortArrayOf(8, 9)))           // wraps around
        val rest = ShortArray(3)
        assertEquals(3, r.read(rest, 10))
        assertArrayEquals(shortArrayOf(5, 8, 9), rest)
        assertEquals(0, r.available())
    }

    @Test fun mixClampsAndKeepsMicWhenVideoIsShort() {
        val pcm = le(1000, -1000, 30000, -30000, 7)
        val mixed = WivraPcmMix.mixInto(pcm, pcm.size, shortArrayOf(500, 500, 10000, -10000), 4, 1f)
        assertArrayEquals(intArrayOf(1500, -500, 32767, -32768, 7), shorts(mixed))
        val half = WivraPcmMix.mixInto(le(0), 2, shortArrayOf(1000), 1, 0.5f)
        assertArrayEquals(intArrayOf(500), shorts(half))
    }

    @Test fun stereoToMonoAndMonoToStereo() {
        assertArrayEquals(shortArrayOf(150, -50),
            WivraPcmMix.remixChannels(shortArrayOf(100, 200, -100, 0), 2, 2, 1))
        assertArrayEquals(shortArrayOf(7, 7, -3, -3),
            WivraPcmMix.remixChannels(shortArrayOf(7, -3), 2, 1, 2))
        assertArrayEquals(shortArrayOf(1, 2, 4, 5),
            WivraPcmMix.remixChannels(shortArrayOf(1, 2, 3, 4, 5, 6), 2, 3, 2))
    }

    @Test fun resamplerKeepsDurationAndToneAcrossChunks() {
        // 1 s of a 441 Hz tone at 48 kHz, fed in uneven chunks, to 44.1 kHz.
        val inRate = 48_000; val outRate = 44_100
        val tone = ShortArray(inRate) { i -> (10_000 * sin(2 * PI * 441 * i / inRate)).toInt().toShort() }
        val rs = WivraPcmMix.Resampler(inRate, outRate, 1)
        val out = ArrayList<Short>()
        var at = 0
        for (chunk in generateSequence(1013) { (it * 7) % 3001 + 17 }) {
            if (at >= tone.size) break
            val n = minOf(chunk, tone.size - at)
            out.addAll(rs.process(tone.copyOfRange(at, at + n), n).toList())
            at += n
        }
        assertTrue("about one second of output", abs(out.size - outRate) <= 2)
        // Compare against the ideal 441 Hz tone at 44.1 kHz.
        var maxErr = 0
        for (i in 0 until out.size - 1) {
            val ideal = (10_000 * sin(2 * PI * 441 * i / outRate)).toInt()
            maxErr = maxOf(maxErr, abs(out[i] - ideal))
        }
        assertTrue("linear interpolation error stays small: $maxErr", maxErr < 200)
        // Same rate is a copy.
        assertArrayEquals(shortArrayOf(1, 2), WivraPcmMix.Resampler(44_100, 44_100, 1).process(shortArrayOf(1, 2, 3), 2))
    }
}
