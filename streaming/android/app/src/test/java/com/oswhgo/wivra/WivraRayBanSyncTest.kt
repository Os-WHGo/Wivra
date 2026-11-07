package com.oswhgo.wivra

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

// Ray-Ban «solo vídeo» + independent microphone: timing and input rules against streaming/contracts/rayban-audio-sync.json.
class WivraRayBanSyncTest {
    private val v: JSONObject by lazy {
        val f = listOf("../../contracts/rayban-audio-sync.json", "../contracts/rayban-audio-sync.json", "streaming/contracts/rayban-audio-sync.json")
            .map(::File).first { it.isFile }
        JSONObject(f.readText())
    }

    @Test fun partClocksAnchorOnTheLeastDelayedSample() {
        val list = v.getJSONArray("partClocks")
        for (i in 0 until list.length()) {
            val c = list.getJSONObject(i)
            val clock = WivraRayBanSync.PartClock()
            val samples = c.getJSONArray("samples")
            for (k in 0 until samples.length()) samples.getJSONArray(k).let { clock.observe(it.getLong(0), it.getLong(1)) }
            assertEquals(c.getString("why"), c.getLong("expectStartNs"), clock.startNs)
            assertEquals(c.getString("why"), c.getLong("expectDurationUs"), clock.durationUs)
            assertEquals(c.getString("why"), c.getBoolean("expectMonotonic"), clock.ptsMonotonic)
        }
    }

    @Test fun audioSlicesFollowTheSharedVectors() {
        val list = v.getJSONArray("audio")
        for (i in 0 until list.length()) {
            val a = list.getJSONObject(i)
            val c = a.getJSONObject("clock")
            val clock = WivraRayBanSync.AudioClock(c.getLong("firstReadNs"), c.getLong("firstChunkFrames"), c.getLong("lastReadNs"), c.getLong("totalFrames"))
            assertEquals(a.getString("why"), a.getLong("expectFirstSampleNs"), clock.firstSampleNs)
            assertEquals(a.getString("why"), a.getDouble("expectDriftPpm"), clock.driftPpm!!, 0.01)
            assertEquals(a.getString("why"), a.getBoolean("expectCorrected"), clock.driftCorrected)
            val slices = a.getJSONArray("slices")
            for (k in 0 until slices.length()) {
                val s = slices.getJSONObject(k)
                val got = WivraRayBanSync.slice(clock, s.getLong("partStartNs"), s.getLong("durationUs"))
                if (s.isNull("expect")) { assertNull(s.getString("why"), got); continue }
                val e = s.getJSONArray("expect")
                assertEquals(s.getString("why"), e.getLong(0), got!!.startFrame)
                assertEquals(s.getString("why"), e.getLong(1), got.endFrame)
                assertEquals(s.getString("why"), e.getDouble(2), got.offsetSeconds, 1e-6)
            }
        }
    }

    @Test fun theGlassesMicrophoneIsNeverChosen() {
        val names = v.getJSONArray("glassesNames")
        for (i in 0 until names.length()) {
            val n = names.getJSONArray(i)
            val name = if (n.isNull(0)) null else n.getString(0)
            assertEquals(name ?: "null", n.getBoolean(1), WivraRayBanSync.looksLikeGlasses(name))
        }
        val cases = v.getJSONArray("inputs")
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val raw: JSONArray = c.getJSONArray("list")
            val inputs = (0 until raw.length()).map { k -> raw.getJSONArray(k).let {
                WivraRayBanSync.Input(it.getInt(0), WivraRayBanSync.Kind.valueOf(it.getString(1)), if (it.isNull(2)) null else it.getString(2)) } }
            val pick = c.getJSONObject("pick")
            for (key in pick.keys()) {
                val got = WivraRayBanSync.pick(inputs, WivraRayBanSync.Choice.from(key)!!)?.id
                assertEquals(c.getString("why") + " / " + key, if (pick.isNull(key)) null else pick.getInt(key), got)
            }
            val alt = c.getJSONObject("alternativesWhenMissing")
            for (key in alt.keys()) {
                val want = alt.getJSONArray(key).let { a -> (0 until a.length()).map { a.getString(it) } }
                assertEquals(c.getString("why") + " / " + key, want,
                    WivraRayBanSync.alternatives(inputs, WivraRayBanSync.Choice.from(key)!!).map { it.id })
            }
        }
    }

    @Test fun audioStatusNeverHidesALostMicrophone() {
        val list = v.getJSONArray("audioStatus")
        for (i in 0 until list.length()) {
            val s = list.getJSONArray(i)
            assertEquals(s.getString(2), WivraRayBanSync.audioStatus(s.getLong(0), if (s.isNull(1)) null else s.getString(1)))
        }
    }
}
