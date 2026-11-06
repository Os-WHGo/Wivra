package com.oswhgo.wivra

import org.junit.Assert.assertEquals
import org.junit.Test

class WivraAudioSegmentsTest {
    @Test fun stereo48kBecomes16kMonoAverage() {
        val frames = 4800                                   // 0.1 s at 48 kHz
        val inter = ShortArray(frames * 2) { i -> if (i % 2 == 0) 1000 else 3000 }
        val out = WivraAudioSegments.toMono16k(inter, 2, 48_000)
        assertEquals(1600, out.size)                        // 0.1 s at 16 kHz
        assertEquals(2000, out[10].toInt())                 // (1000 + 3000) / 2
    }

    @Test fun emptyOrInvalidInputGivesNothing() {
        assertEquals(0, WivraAudioSegments.toMono16k(ShortArray(0), 2, 48_000).size)
        assertEquals(0, WivraAudioSegments.toMono16k(ShortArray(10), 0, 48_000).size)
    }
}
