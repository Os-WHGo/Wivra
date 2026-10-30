package com.oswhgo.wivra

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class WivraVideoPtsNormalizerTest {
    @Test fun normalHevcCadenceRetainsSourceFrameIntervals() {
        val clock = WivraVideoPtsNormalizer()
        val actual = listOf(1_000_000L, 1_041_667L, 1_083_334L)
            .map(clock::next).toLongArray()
        assertArrayEquals(longArrayOf(0L, 41_667L, 83_334L), actual)
    }

    @Test fun sourcePtsRestartAfterPauseDoesNotCollapseFramesToMicroseconds() {
        val clock = WivraVideoPtsNormalizer()
        val actual = listOf(
            1_000_000L, 1_041_667L, 1_083_334L,
            0L, 41_667L, 83_334L
        ).map(clock::next).toLongArray()
        assertArrayEquals(
            longArrayOf(0L, 41_667L, 83_334L, 125_001L, 166_668L, 208_335L),
            actual
        )
    }

    @Test fun largeForwardPtsJumpDoesNotFreezePlaybackForMinutes() {
        val clock = WivraVideoPtsNormalizer()
        val actual = listOf(0L, 40_000L, 8_040_000L, 8_080_000L)
            .map(clock::next).toLongArray()
        assertArrayEquals(longArrayOf(0L, 40_000L, 80_000L, 120_000L), actual)
    }

    @Test fun repeatedPtsUsesLastValidFrameCadence() {
        val clock = WivraVideoPtsNormalizer()
        val actual = listOf(0L, 40_000L, 40_000L, 40_000L, 80_000L)
            .map(clock::next).toLongArray()
        assertArrayEquals(longArrayOf(0L, 40_000L, 80_000L, 120_000L, 160_000L), actual)
    }

    @Test fun newSegmentStartsAtZeroAndNegativePtsIsRejected() {
        val firstPart = WivraVideoPtsNormalizer()
        firstPart.next(90_000L)
        firstPart.next(132_000L)
        assertEquals(0L, WivraVideoPtsNormalizer().next(3_000_000L))
        assertThrows(IllegalArgumentException::class.java) {
            firstPart.next(-1L)
        }
    }
}
