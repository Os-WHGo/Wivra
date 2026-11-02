package com.oswhgo.wivra

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayOutputStream
import java.io.File

/** Real Chromium MediaRecorder WebM: the Kotlin rewrite must equal the JS rewrite byte for byte. */
class WivraWebmSeekableTest {
    private fun fixture(name: String): ByteArray {
        val candidates = listOf("../../../app/tests/fixtures/mediarecorder", "../../app/tests/fixtures/mediarecorder", "app/tests/fixtures/mediarecorder")
        val file = candidates.map { File(it, name) }.firstOrNull { it.isFile } ?: error("fixture $name not found from ${File(".").absolutePath}")
        return file.readBytes()
    }

    @Test fun rewriteMatchesTheEditorJsImplementationExactly() {
        val src = fixture("chromium-vp8-opus.webm")
        val out = ByteArrayOutputStream()
        val result = WivraWebmSeekable.rewrite(WivraWebmSeekable.ArraySource(src), out)
        assertArrayEquals(fixture("chromium-vp8-opus.seekable-js.webm"), out.toByteArray())
        assertEquals(out.size().toLong(), result.bytesWritten)
        assertTrue(result.durationMs > 1800 && result.durationMs < 2600)
        assertTrue(result.cues in 1..result.clusters)
    }

    @Test fun originalHasNoDurationOrCuesAndRepairedHasBothWithIdenticalBlocks() {
        val src = WivraWebmSeekable.ArraySource(fixture("chromium-vp8-opus.webm"))
        val before = WivraWebmSeekable.analyze(src)
        assertFalse(before.hasDuration); assertFalse(before.hasCues)
        val out = ByteArrayOutputStream(); val result = WivraWebmSeekable.rewrite(src, out)
        val fixed = WivraWebmSeekable.ArraySource(out.toByteArray())
        val after = WivraWebmSeekable.analyze(fixed)
        assertTrue(after.hasDuration); assertTrue(after.hasCues)
        assertEquals(before.durationTicks, after.durationTicks)
        assertEquals(WivraWebmSeekable.blocksCrc(src), WivraWebmSeekable.blocksCrc(fixed))
        assertEquals(WivraWebmSeekable.blocksCrc(src), result.blocksCrc32)
        assertEquals(mapOf(1L to "video", 2L to "audio").values.toSet(), after.trackTypes.values.toSet())
    }

    @Test fun truncatedRecordingKeepsCompleteBlocksOnly() {
        val bytes = fixture("chromium-vp8-opus.webm")
        val cut = WivraWebmSeekable.ArraySource(bytes.copyOf(bytes.size - 777))
        val a = WivraWebmSeekable.analyze(cut)
        assertTrue(a.truncated)
        val out = ByteArrayOutputStream(); WivraWebmSeekable.rewrite(cut, out)
        assertTrue(WivraWebmSeekable.analyze(WivraWebmSeekable.ArraySource(out.toByteArray())).hasCues)
    }

    @Test fun notAWebmIsRejectedWithoutWriting() {
        val out = ByteArrayOutputStream()
        val failed = runCatching { WivraWebmSeekable.rewrite(WivraWebmSeekable.ArraySource(ByteArray(64) { 7 }), out) }
        assertTrue(failed.isFailure); assertEquals(0, out.size())
    }
}
