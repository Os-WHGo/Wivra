package com.oswhgo.wivra

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Android emulator/device-only tests, not real Ray-Ban HEVC QA.
 * Build CI compiles the instrumentation APK but does not execute it.
 */
@RunWith(AndroidJUnit4::class)
class WivraHevcMp4RecorderTest {
    @Test fun zeroFramesCannotPublishEmptyMp4() {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val mux = WivraHevcMp4Recorder(app)
        assertNull(mux.finishAndSave())
        mux.discard()
    }

    @Test fun malformedPacketNeverCreatesAMovie() {
        val app = InstrumentationRegistry.getInstrumentation().targetContext
        val mux = WivraHevcMp4Recorder(app)
        mux.consume(byteArrayOf(1, 2, 3, 4, 5), 0, 504, 896, false)
        mux.consume(ByteArray(8), -1, 504, 896, false)
        assertNull(mux.finishAndSave())
        mux.discard()
    }
}
