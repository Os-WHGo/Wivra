package com.oswhgo.wivra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class WivraCameraProPolicyTest {
    @Test fun nightNeedsManualSensorAndAUsefulShutter() {
        assertNull(WivraCameraProPolicy.nightPlan(false, 2_000_000_000L, 100, 3200))
        assertNull(WivraCameraProPolicy.nightPlan(true, null, 100, 3200))
        assertNull(WivraCameraProPolicy.nightPlan(true, 100_000_000L, 100, 3200))   // 1/10 s max: no gain
        assertEquals(WivraCameraProPolicy.NightPlan(1_000_000_000L, 800), WivraCameraProPolicy.nightPlan(true, 30_000_000_000L, 50, 6400))
        assertEquals(WivraCameraProPolicy.NightPlan(500_000_000L, 400), WivraCameraProPolicy.nightPlan(true, 500_000_000L, 100, 400))
        assertNull(WivraCameraProPolicy.nightPlan(true, 1_000_000_000L, 800, 100))
    }

    @Test fun exposureStepsStayInRangeAndReadNaturally() {
        assertEquals(2, WivraCameraProPolicy.stepIndex(2, 1, -2, 2))
        assertEquals(-2, WivraCameraProPolicy.stepIndex(-2, -1, -2, 2))
        assertEquals(1, WivraCameraProPolicy.stepIndex(0, 1, -12, 12))
        assertEquals("+0.7 EV", WivraCameraProPolicy.evLabel(2, 1, 3))
        assertEquals("−1.0 EV", WivraCameraProPolicy.evLabel(-2, 1, 2))
        assertEquals("0 EV", WivraCameraProPolicy.evLabel(0, 1, 6))
        assertEquals("0 EV", WivraCameraProPolicy.evLabel(3, 1, 0))
        assertEquals("1 s", WivraCameraProPolicy.shutterLabel(1_000_000_000L))
        assertEquals("1/4 s", WivraCameraProPolicy.shutterLabel(250_000_000L))
    }
}
