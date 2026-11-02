package com.oswhgo.wivra

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import java.nio.file.Files

@RunWith(AndroidJUnit4::class)
class WivraCaptureMediaVerifierTest {
    private val context get() = InstrumentationRegistry.getInstrumentation().targetContext

    @Test fun walksRealSamplesAndDecodesVideoWithoutChangingOriginal() {
        val file = File.createTempFile("capture-verifier-", ".mp4", context.cacheDir)
        try {
            InstrumentationRegistry.getInstrumentation().context.assets
                .open("ffmpeg-h264-aac-fragmented.mp4").use { input -> file.outputStream().use { input.copyTo(it) } }
            val original = file.readBytes()
            val report = WivraCaptureMediaVerifier.verifyFile(file, context.cacheDir)
            assertTrue(report.toString(), report.valid)
            assertTrue(report.samples > 10)
            assertTrue(report.durationUs > 1_000_000)
            assertFalse(WivraCaptureMediaVerifier.verifyFile(file, context.cacheDir, requireHevc = true).valid)
            assertArrayEquals(original, file.readBytes())
        } finally { file.delete() }
    }

    @Test fun rejectsTruncationMissingFilesAndEscapingLinksWithoutDeletingSources() {
        val file = File.createTempFile("capture-verifier-", ".mp4", context.cacheDir)
        val link = File(context.cacheDir, file.name + ".link")
        try {
            file.writeBytes(byteArrayOf(0, 0, 0, 24, 102, 116, 121, 112))
            val original = file.readBytes()
            assertFalse(WivraCaptureMediaVerifier.verifyFile(file, context.cacheDir).valid)
            assertFalse(WivraCaptureMediaVerifier.verifyFile(file, context.filesDir).valid)
            Files.createSymbolicLink(link.toPath(), file.toPath())
            assertFalse(WivraCaptureMediaVerifier.verifyFile(link, context.cacheDir).valid)
            assertArrayEquals(original, file.readBytes())
            assertFalse(WivraCaptureMediaVerifier.verifyFile(File(context.cacheDir, "absent-capture.mp4"), context.cacheDir).valid)
        } finally { link.delete(); file.delete() }
    }
}
