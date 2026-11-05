package com.oswhgo.wivra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Same numbers as core/tests/live-reconnect.test.mjs. — Claude */
class WivraLiveReconnectTest {
    @Test fun growingPausesThenGiveUp() {
        val r = WivraLiveReconnect()
        val delays = generateSequence { r.nextDelayMs() }.toList()
        assertEquals(listOf(2000L, 4000L, 8000L, 15000L, 15000L, 15000L), delays)
        assertTrue(r.gaveUp)
        assertNull(r.nextDelayMs())
    }

    @Test fun successResetsAndRejectionsNeverRetry() {
        val r = WivraLiveReconnect()
        r.nextDelayMs(); r.nextDelayMs()
        r.connected()
        assertEquals(0, r.attempt)
        assertEquals(2000L, r.nextDelayMs())
        assertNull(r.nextDelayMs(neverRetry = true))
        assertTrue(r.gaveUp)
    }
}
