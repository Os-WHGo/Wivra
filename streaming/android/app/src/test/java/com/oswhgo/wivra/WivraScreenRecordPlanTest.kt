package com.oswhgo.wivra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// W99 (Claude): sizes, bitrate and the storage stop of the local screen recording.
class WivraScreenRecordPlanTest {
    @Test fun keepsTheScreenShapeAtMost1920AndMultiplesOf16() {
        val tall = WivraScreenRecordPlan.forScreen(1080, 2400)          // 20:9 phone, portrait
        assertEquals(1920, tall.long)
        assertEquals(864, tall.short)
        val same = WivraScreenRecordPlan.forScreen(2400, 1080)          // landscape gives the same encoder size
        assertEquals(tall, same)
        val small = WivraScreenRecordPlan.forScreen(720, 1280)          // never upscaled
        assertEquals(1280, small.long)
        assertEquals(720, small.short)
        for (s in listOf(tall, small, WivraScreenRecordPlan.forScreen(1170, 2532))) {
            assertEquals(0, s.long % 16); assertEquals(0, s.short % 16)
            assertTrue(s.bitrate in WivraScreenRecordPlan.MIN_BITRATE..WivraScreenRecordPlan.MAX_BITRATE)
        }
    }

    @Test fun stopsBeforeThePhoneRunsOutOfSpace() {
        val size = WivraScreenRecordPlan.forScreen(1080, 2400)
        val minute = WivraScreenRecordPlan.bytesPerMinute(size, true)
        assertTrue(minute > 0)
        val reserve = WivraScreenRecordPlan.RESERVE_BYTES
        assertTrue(WivraScreenRecordPlan.mustStopForSpace(reserve + minute - 1, size, true))
        assertFalse(WivraScreenRecordPlan.mustStopForSpace(reserve + minute, size, true))
        assertEquals(10L, WivraScreenRecordPlan.minutesThatFit(reserve + 10 * minute, size, true))
        assertEquals(0L, WivraScreenRecordPlan.minutesThatFit(0L, size, true))
    }

    @Test fun clockText() {
        assertEquals("00:00", WivraScreenRecordPlan.clock(-5))
        assertEquals("01:05", WivraScreenRecordPlan.clock(65_000))
        assertEquals("1:00:01", WivraScreenRecordPlan.clock(3_601_000))
    }
}
