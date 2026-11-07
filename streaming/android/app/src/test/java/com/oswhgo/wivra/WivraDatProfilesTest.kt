package com.oswhgo.wivra

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

// Ray-Ban Meta profiles, «Automático» and stream statistics against the vectors shared with iPhone.
class WivraDatProfilesTest {
    private val vectors: JSONObject by lazy {
        val f = listOf("../../contracts/dat-profiles.json", "../contracts/dat-profiles.json", "streaming/contracts/dat-profiles.json")
            .map(::File).first { it.isFile }
        JSONObject(f.readText())
    }

    private fun observed(o: JSONObject, profile: String) = WivraDatAuto.Observed(
        WivraDatProfile.from(profile)!!, o.getDouble("seconds"), o.getDouble("measuredFps"),
        o.getInt("stalls"), o.getInt("receivedHeight"), o.getBoolean("thermal"))

    @Test fun theProfileTableMatchesTheSharedContract() {
        val list = vectors.getJSONArray("profiles")
        assertEquals(list.length(), WivraDatProfile.entries.size)
        for (i in 0 until list.length()) {
            val p = list.getJSONObject(i)
            val k = WivraDatProfile.from(p.getString("id"))!!
            assertEquals(p.getInt("width"), k.width); assertEquals(p.getInt("height"), k.height); assertEquals(p.getInt("fps"), k.fps)
        }
        assertEquals(vectors.getString("default"), WivraDatProfile.DEFAULT.id)
    }

    @Test fun automaticStartFollowsTheSharedVectors() {
        val list = vectors.getJSONArray("start")
        for (i in 0 until list.length()) {
            val v = list.getJSONObject(i)
            val last = if (v.isNull("last")) null else v.getJSONObject("last").let { observed(it, it.getString("profile")) }
            assertEquals(v.getString("why"), v.getString("expect"), WivraDatAuto.start(last, v.getBoolean("thermalNow")).id)
        }
    }

    @Test fun suggestionsFollowTheSharedVectors() {
        val list = vectors.getJSONArray("suggest")
        for (i in 0 until list.length()) {
            val v = list.getJSONObject(i)
            val got = WivraDatAuto.suggest(observed(v.getJSONObject("window"), v.getString("current")), v.getDouble("sinceLast"))
            assertEquals(v.getString("why"), if (v.isNull("expect")) null else v.getString("expect"), got?.id)
        }
    }

    @Test fun statisticsFromFrameArrivalTimes() {
        val s = vectors.getJSONObject("stats")
        val stats = WivraDatStreamStats(s.getInt("nominalFps"))
        val times = s.getJSONArray("framesMs")
        for (i in 0 until times.length()) stats.frame(times.getLong(i), s.getInt("width"), s.getInt("height"), s.getInt("bytesPerFrame"))
        val snap = stats.snapshot(); val e = s.getJSONObject("expect")
        assertEquals(e.getInt("frames"), snap.frames)
        assertEquals(e.getInt("stalls"), snap.stalls)
        assertEquals(e.getDouble("seconds"), snap.seconds, 0.001)
        assertTrue("fps ${snap.fps}", snap.fps in e.getDouble("fpsMin")..e.getDouble("fpsMax"))
        assertTrue("p95 ${snap.p95IntervalMs}", snap.p95IntervalMs in e.getDouble("p95IntervalMsMin")..e.getDouble("p95IntervalMsMax"))
        assertEquals(e.getLong("maxGapMs"), snap.maxGapMs)
        assertEquals(896, snap.height)
    }
}
