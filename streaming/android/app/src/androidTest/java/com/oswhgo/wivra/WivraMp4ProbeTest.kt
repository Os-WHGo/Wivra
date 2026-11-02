package com.oswhgo.wivra

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/** Offline device test. No wearable, recording, network or user media. */
@RunWith(AndroidJUnit4::class)
class WivraMp4ProbeTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun unrecognizedBytesCannotBeClaimedAsPlayableHevc() {
        val file = File.createTempFile("wivra-probe-", ".mp4", context.cacheDir)
        try {
            file.writeText("this is not a movie: probe must not alter it")
            val before = file.readBytes()
            val result = WivraMp4Probe.inspect(file)
            assertFalse(result.appearsReadable)
            assertFalse(result.hasHevcTrack)
            assertTrue(file.exists())
            assertTrue(file.readBytes().contentEquals(before))
        } finally {
            file.delete()
        }
    }

    @Test fun absentFileReturnsNonPlayableWithoutCreatingIt() {
        val file = File(context.cacheDir, "wivra-no-recording-to-inspect.mp4")
        file.delete()
        val result = WivraMp4Probe.inspect(file)
        assertFalse(result.appearsReadable)
        assertEquals(0L, result.durationUs)
        assertFalse(file.exists())
    }
}
