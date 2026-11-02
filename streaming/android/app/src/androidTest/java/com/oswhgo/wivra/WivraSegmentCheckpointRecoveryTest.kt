package com.oswhgo.wivra

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.File
import java.util.UUID
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Run on an Android emulator or device. Checks private pending file lifecycle
 * only: these dummy files are deliberately NOT playable HEVC or glasses QA.
 * CI compiles the test APK but does not execute emulator instrumentation.
 */
@RunWith(AndroidJUnit4::class)
class WivraSegmentCheckpointRecoveryTest {
    @Test fun checkpointsAreGroupedAndUnfinishedPartIsNotOffered() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        val directory = File(context.filesDir, "wivra_pending_videos")
        assertTrue(directory.isDirectory || directory.mkdirs())
        val id = "wivra_rayban_" + UUID.randomUUID().toString().replace("-", "")
        val first = File(directory, "${id}_part0001.mp4")
        val second = File(directory, "${id}_part0002.mp4")
        val unfinished = File(directory, "${id}_part0003.writing")
        try {
            first.writeBytes(byteArrayOf(1))
            second.writeBytes(byteArrayOf(2))
            unfinished.writeBytes(byteArrayOf(3))
            val selected = WivraHevcMp4Recorder.listPendingRecordings(context)
                .first { it.id == id }
            assertEquals(2, selected.parts.size)
            assertEquals(first.name, selected.parts[0].name)
            assertEquals(second.name, selected.parts[1].name)
            assertFalse(selected.parts.contains(unfinished))
            assertFalse(WivraHevcMp4Recorder.discardPending(context, unfinished))
            val outside = File(context.cacheDir, first.name)
            outside.writeBytes(byteArrayOf(4))
            try {
                assertFalse(WivraHevcMp4Recorder.discardPending(context, outside))
            } finally {
                outside.delete()
            }
            assertTrue(WivraHevcMp4Recorder.discardPending(context, first))
            assertTrue(WivraHevcMp4Recorder.discardPending(context, second))
        } finally {
            first.delete()
            second.delete()
            unfinished.delete()
        }
    }
}
