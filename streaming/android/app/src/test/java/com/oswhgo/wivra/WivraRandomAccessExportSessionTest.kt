package com.oswhgo.wivra

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.security.MessageDigest

/** Pure JVM tests: no claim of hardware codec, gallery or Ray-Ban QA. */
class WivraRandomAccessExportSessionTest {
    private fun folder(): File = createTempDir(prefix = "wivra-v2-")
    private fun mp4(): ByteArray = byteArrayOf(
        0, 0, 0, 16, 'f'.code.toByte(), 't'.code.toByte(),
        'y'.code.toByte(), 'p'.code.toByte(), 1, 2, 3, 4, 5, 6, 7, 8
    )
    private fun sha(bytes: ByteArray): String = MessageDigest.getInstance("SHA-256")
        .digest(bytes).joinToString("") { "%02x".format(it.toInt() and 0xff) }

    @Test fun patchHeaderAndVerifyFinalDiskBytes() {
        val dir = folder()
        try {
            val session = WivraRandomAccessExportSession.create(dir, "video/mp4")
            val source = mp4()
            assertEquals(16L, session.writeAt(0, 0, source).maxEnd)
            assertEquals(16L, session.writeAt(1, 12, byteArrayOf(9, 10)).maxEnd)
            assertEquals(2, session.writes)
            val saved = session.finish(16, 2, 1000, true) {
                assertTrue(it.name.endsWith(".partial"))
                WivraRandomAccessExportSession.Media(video = true, audio = true, durationMs = 1000)
            }
            val expected = source.copyOf().apply { this[12] = 9; this[13] = 10 }
            assertArrayEquals(expected, saved.file.readBytes())
            assertEquals(sha(expected), saved.sha256)
            assertEquals(WivraRandomAccessExportSession.State.SEALED, session.state)
            assertEquals(1, dir.listFiles()?.size)
            session.abort()
            assertTrue(saved.file.exists())
        } finally { dir.deleteRecursively() }
    }

    @Test fun outOfOrderRegionsRejectHolesBeforeMediaInspection() {
        val dir = folder()
        try {
            val session = WivraRandomAccessExportSession.create(dir, "video/mp4")
            session.writeAt(0, 4, mp4())
            var called = false
            try {
                session.finish(20, 1, 1000, false) {
                    called = true
                    WivraRandomAccessExportSession.Media(true, true, 1000)
                }
                fail("A random file with an unwritten prefix must be refused")
            } catch (_: WivraRandomAccessExportSession.IntegrityException) { }
            assertFalse(called)
            assertEquals(0, dir.listFiles()?.size)
            session.abort()
        } finally { dir.deleteRecursively() }
    }

    @Test fun neverSealMissingAudioOrCorruptHeader() {
        val dir = folder()
        try {
            val first = WivraRandomAccessExportSession.create(dir, "video/mp4")
            first.writeAt(0, 0, mp4())
            try {
                first.finish(16, 1, 1000, true) {
                    WivraRandomAccessExportSession.Media(true, false, 1000)
                }
                fail("Missing required audio was accepted")
            } catch (_: WivraRandomAccessExportSession.IntegrityException) { }
            val second = WivraRandomAccessExportSession.create(dir, "video/mp4")
            second.writeAt(0, 0, ByteArray(16))
            try {
                second.finish(16, 1, 1000, false) {
                    WivraRandomAccessExportSession.Media(true, true, 1000)
                }
                fail("Corrupt MP4 header was accepted")
            } catch (_: WivraRandomAccessExportSession.IntegrityException) { }
            assertEquals(0, dir.listFiles()?.size)
        } finally { dir.deleteRecursively() }
    }

    @Test fun abortAndInvalidWritesCannotOverwriteExistingUserFiles() {
        val dir = folder()
        try {
            val unrelated = File(dir, "important.mp4")
            unrelated.writeText("DO NOT TOUCH")
            val session = WivraRandomAccessExportSession.create(dir, "video/mp4")
            try {
                session.writeAt(1, 0, mp4())
                fail("Out of sequence write was accepted")
            } catch (_: WivraRandomAccessExportSession.IntegrityException) { }
            try {
                session.writeAt(0, 0, ByteArray(WivraRandomAccessExportSession.MAX_WRITE_BYTES + 1))
                fail("Oversized write was accepted")
            } catch (_: WivraRandomAccessExportSession.IntegrityException) { }
            session.abort()
            assertEquals(WivraRandomAccessExportSession.State.ABORTED, session.state)
            assertEquals("DO NOT TOUCH", unrelated.readText())
            assertEquals(1, dir.listFiles()?.size)
        } finally { dir.deleteRecursively() }
    }
    @Test fun mediaInspectorCannotChangeFileBeforePublication() {
        val dir = folder()
        try {
            val session = WivraRandomAccessExportSession.create(dir, "video/mp4")
            session.writeAt(0, 0, mp4())
            try {
                session.finish(16, 1, 1000, false) { file ->
                    file.writeBytes(ByteArray(16))
                    WivraRandomAccessExportSession.Media(true, true, 1000)
                }
                fail("Mutated output must not be published")
            } catch (_: WivraRandomAccessExportSession.IntegrityException) { }
            assertEquals(0, dir.listFiles()?.size)
        } finally { dir.deleteRecursively() }
    }


    @Test fun sealedRecoveryNamesCannotEscapeAppPrivateFolder() {
        assertTrue(WivraRandomExportStore.isRecoverableFilename("Wivra_Fast_1234567890.mp4"))
        assertTrue(WivraRandomExportStore.isRecoverableFilename("Wivra_Fast_1234567890.webm"))
        for (name in listOf(
            "../Wivra_Fast_1234567890.mp4",
            "Wivra_Fast_1234567890.mp4.partial",
            "Wivra_Fast_1234567890.mp4/../sensitive.mp4",
            "other.mp4",
            "Wivra_Fast_a.mp4",
            "Wivra_Fast_1234567890.mkv",
            "Wivra_Fast_1234567890\\\\.mp4"
        )) {
            assertFalse("Recovery accepted unsafe filename: $name",
                WivraRandomExportStore.isRecoverableFilename(name))
        }
    }

}
