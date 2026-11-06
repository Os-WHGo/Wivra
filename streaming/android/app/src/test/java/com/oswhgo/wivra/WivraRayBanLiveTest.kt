package com.oswhgo.wivra

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.ByteBuffer

// Ray-Ban → LIVE (Android): colour conversion, bounded frame hand-over and output plan, against rayban-live.json.
class WivraRayBanLiveTest {
    private val v: JSONObject by lazy {
        val f = listOf("../../contracts/rayban-live.json", "../contracts/rayban-live.json", "streaming/contracts/rayban-live.json")
            .map(::File).first { it.isFile }
        JSONObject(f.readText())
    }

    @Test fun i420ToArgbMatchesTheSharedVector() {
        val c = v.getJSONObject("i420")
        val bytes = c.getJSONArray("bytes").let { a -> ByteArray(a.length()) { a.getInt(it).toByte() } }
        val out = IntArray(8)
        assertTrue(WivraI420Argb.convert(bytes, c.getInt("width"), c.getInt("height"), out))
        val want = c.getJSONArray("argb")
        for (i in 0 until want.length()) assertEquals("pixel $i", want.getString(i), "%08X".format(out[i]))
        val neutral = v.getJSONArray("i420Neutral")
        for (i in 0 until neutral.length()) {
            val n = neutral.getJSONArray(i)
            val frame = ByteArray(6).also { it.fill(n.getInt(0).toByte(), 0, 4); it[4] = 128.toByte(); it[5] = 128.toByte() }
            val px = IntArray(4)
            assertTrue(WivraI420Argb.convert(frame, 2, 2, px))
            assertEquals(n.getString(1), "%08X".format(px[3]))
        }
        assertFalse("wrong size", WivraI420Argb.convert(ByteArray(11), 4, 2, out))
        assertFalse("odd width", WivraI420Argb.convert(ByteArray(12), 3, 2, out))
    }

    @Test fun theNewestFrameWinsAndOlderOnesAreCountedAsDropped() {
        val slot = WivraLatestFrameSlot()
        for (k in 1..3) assertTrue(slot.offer(ByteBuffer.wrap(ByteArray(6) { k.toByte() }), 2, 2))
        var seen = -1
        assertTrue(slot.take { frame, w, h -> assertEquals(2, w); assertEquals(2, h); seen = frame[0].toInt() })
        assertEquals(3, seen)
        assertEquals(3L, slot.offered)
        assertEquals(2L, slot.dropped)
        assertFalse("nothing new", slot.take { _, _, _ -> })
        assertFalse("bad size", slot.offer(ByteBuffer.wrap(ByteArray(5)), 2, 2))
        assertTrue(slot.offer(ByteBuffer.wrap(ByteArray(6) { 9 }), 2, 2))
        assertTrue(slot.take { frame, _, _ -> seen = frame[5].toInt() })
        assertEquals(9, seen)
    }

    @Test fun livePlanPerProfile() {
        val plans = v.getJSONArray("plans")
        for (i in 0 until plans.length()) {
            val p = plans.getJSONObject(i)
            val plan = WivraRayBanLivePlan.forProfile(WivraDatProfile.from(p.getString("profile"))!!, p.getBoolean("audio"))
            val e = p.getJSONArray("expect")
            assertEquals(p.getString("profile"), (0 until e.length()).map { e.getInt(it) },
                listOf(plan.width, plan.height, plan.fallbackWidth, plan.fallbackHeight, plan.fps, plan.videoBitrate,
                    plan.keyframeSeconds, plan.audioSampleRate, plan.audioBitrate))
        }
    }
}
