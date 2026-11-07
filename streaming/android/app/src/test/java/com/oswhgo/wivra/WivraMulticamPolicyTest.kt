package com.oswhgo.wivra

import com.oswhgo.wivra.WivraMulticamPolicy.CameraEntry
import com.oswhgo.wivra.WivraMulticamPolicy.Corner
import com.oswhgo.wivra.WivraMulticamPolicy.Facing
import com.oswhgo.wivra.WivraMulticamPolicy.TakeStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Same numbers as core/tests/multicam-plan.test.mjs. — Claude */
class WivraMulticamPolicyTest {
    private val cams = listOf(
        CameraEntry("0", Facing.BACK), CameraEntry("1", Facing.FRONT), CameraEntry("2", Facing.BACK)
    )

    @Test fun pipGeometryMatchesTheJavaScriptContract() {
        val r = WivraMulticamPolicy.pipRect(Corner.BOTTOM_RIGHT, 0.3, 0.04, 1080, 1920)
        assertEquals(0.66, r.x, 1e-9)
        assertEquals(0.6775, r.y, 1e-9)
        assertEquals(0.3, r.w, 1e-9)
        val c = WivraMulticamPolicy.composition(r)
        assertEquals(0.62f, c.offsetX, 1e-6f)
        assertEquals(-0.655f, c.offsetY, 1e-6f)
        assertEquals(0.3f, c.scale, 1e-6f)
        val full = WivraMulticamPolicy.composition(WivraMulticamPolicy.Rect(0.0, 0.0, 1.0, 1.0))
        assertEquals(WivraMulticamPolicy.FULL_FRAME, full)
        for (corner in Corner.values()) {
            val k = WivraMulticamPolicy.pipRect(corner)
            assertTrue(corner.name, k.x >= 0 && k.y >= 0 && k.x + k.w <= 1.0 + 1e-9 && k.y + k.h <= 1.0 + 1e-9)
        }
        assertEquals(0.5, WivraMulticamPolicy.pipRect(Corner.TOP_LEFT, scale = 5.0).w, 1e-9)
        assertEquals(Corner.BOTTOM_LEFT, Corner.BOTTOM_RIGHT.next())
        assertEquals(Corner.BOTTOM_RIGHT, Corner.TOP_RIGHT.next())
    }

    @Test fun pairChoiceKeepsRequestedPrimaryAndFallsBackToSingle() {
        val dual = WivraMulticamPolicy.plan(cams, listOf(setOf("0", "1")))
        assertTrue(dual.dual); assertEquals("0", dual.primaryId); assertEquals("1", dual.secondaryId)
        val other = WivraMulticamPolicy.plan(cams, listOf(setOf("2", "1")))
        assertEquals("2" to "1", other.primaryId to other.secondaryId)
        val swapped = WivraMulticamPolicy.plan(cams, listOf(setOf("0", "1")), Facing.FRONT, Facing.BACK)
        assertEquals("1" to "0", swapped.primaryId to swapped.secondaryId)
        val none = WivraMulticamPolicy.plan(cams, emptyList())
        assertFalse(none.dual); assertEquals("0", none.primaryId); assertEquals("no-concurrent-pair", none.reason)
        val bogus = WivraMulticamPolicy.plan(cams, listOf(setOf("0", "9"), setOf("0")))
        assertFalse(bogus.dual)
        assertEquals("one-camera", WivraMulticamPolicy.plan(cams.take(1), listOf(setOf("0", "1"))).reason)
        val empty = WivraMulticamPolicy.plan(emptyList(), emptyList())
        assertNull(empty.primaryId); assertEquals("no-camera", empty.reason)
    }

    @Test fun takesWithBytesAreNeverDiscardedAutomatically() {
        assertEquals(TakeStatus.KEPT, WivraMulticamPolicy.classifyTake(9_000_000, verified = true))
        assertEquals(TakeStatus.NEEDS_REVIEW, WivraMulticamPolicy.classifyTake(4096, verified = false))
        assertEquals(TakeStatus.EMPTY, WivraMulticamPolicy.classifyTake(0, verified = false))
        assertTrue(WivraMulticamPolicy.shouldContinueAfterLoss(1, ownerStopped = false))
        assertFalse(WivraMulticamPolicy.shouldContinueAfterLoss(0, ownerStopped = false))
        assertFalse(WivraMulticamPolicy.shouldContinueAfterLoss(1, ownerStopped = true))
        assertFalse(WivraMulticamPolicy.hasRoomForTake(100L * 1024 * 1024))
    }
}
