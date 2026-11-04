package com.oswhgo.wivra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WivraStrictJsonNumberTest {
    private fun assertRejected(block: () -> Unit) {
        try {
            block()
            throw AssertionError("Unsafe JSON primitive was accepted.")
        } catch (_: IllegalArgumentException) { }
    }
    @Test fun acceptsExactIntegerTokensWithinRange() {
        assertEquals(1024L, WivraStrictJsonNumber.requireLong(1024, "bytes"))
        val max = 16L * 1024 * 1024 * 1024
        assertEquals(max, WivraStrictJsonNumber.requireLong(max, "estimatedBytes", 1L, max))
        assertEquals(7, WivraStrictJsonNumber.requireInt(7, "seq", 0, 100))
    }
    @Test fun rejectsFractionsStringsBooleansNullAndNonFiniteNumbers() {
        assertRejected { WivraStrictJsonNumber.requireLong(1.5, "bytes") }
        assertRejected { WivraStrictJsonNumber.requireLong(1.0, "bytes") }
        assertRejected { WivraStrictJsonNumber.requireLong("1024", "bytes") }
        assertRejected { WivraStrictJsonNumber.requireLong(true, "bytes") }
        assertRejected { WivraStrictJsonNumber.requireLong(null, "bytes") }
        assertRejected { WivraStrictJsonNumber.requireLong(Double.NaN, "bytes") }
        assertRejected { WivraStrictJsonNumber.requireLong(Double.POSITIVE_INFINITY, "bytes") }
    }
    @Test fun rejectsOutOfRangeValues() {
        val max = 16L * 1024 * 1024 * 1024
        assertRejected { WivraStrictJsonNumber.requireLong(0, "bytes", 1L, max) }
        assertRejected { WivraStrictJsonNumber.requireLong(-1, "position", 0L, max) }
        assertRejected { WivraStrictJsonNumber.requireLong(max + 1, "bytes", 1L, max) }
        assertRejected { WivraStrictJsonNumber.requireInt(1L shl 32, "seq", 0, Int.MAX_VALUE) }
    }
    @Test fun booleansMustBeActualJsonBooleans() {
        assertTrue(WivraStrictJsonNumber.requireBoolean(true, "expectAudio"))
        assertFalse(WivraStrictJsonNumber.requireBoolean(false, "expectAudio"))
        assertRejected { WivraStrictJsonNumber.requireBoolean(1, "expectAudio") }
        assertRejected { WivraStrictJsonNumber.requireBoolean("true", "expectAudio") }
        assertRejected { WivraStrictJsonNumber.requireBoolean(null, "expectAudio") }
    }
}
