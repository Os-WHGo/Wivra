package com.oswhgo.wivra

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.CRC32

/** Progressive export core on the JVM: order, totals, CRC-32, container and cleanup. */
class WivraProgressiveExportSessionTest {
    private val webmHead = byteArrayOf(0x1A, 0x45, 0xDF.toByte(), 0xA3.toByte(), 1, 2, 3, 4)
    private fun mp4Head() = byteArrayOf(0, 0, 0, 0x18) + "ftypisom".toByteArray()
    private fun crcOf(vararg parts: ByteArray) = CRC32().apply { parts.forEach { update(it) } }.value
    private fun payload(size: Int, seed: Int) = ByteArray(size) { ((it * 31 + seed) and 0xFF).toByte() }

    @Test fun chunksAreWrittenInOrderAndSealedWhenTotalsMatch() {
        val out = ByteArrayOutputStream()
        var synced = 0
        val session = WivraProgressiveExportSession(7, "video/webm", out, sync = { synced++ })
        val a = webmHead + payload(5000, 1)
        val b = payload(7000, 2)
        assertEquals(a.size.toLong(), session.append(0, a))
        assertEquals((a.size + b.size).toLong(), session.append(1, b))
        assertEquals(crcOf(a, b), session.finish((a.size + b.size).toLong(), crcOf(a, b), 2))
        assertEquals(1, synced)
        assertArrayEquals(a + b, out.toByteArray())
        assertEquals(WivraProgressiveExportSession.State.FINISHED, session.state)
    }

    @Test fun outOfOrderOrRepeatedChunkIsRejectedPermanently() {
        val session = WivraProgressiveExportSession(1, "video/webm", ByteArrayOutputStream())
        session.append(0, webmHead)
        assertThrows(WivraProgressiveExportSession.IntegrityException::class.java) { session.append(2, payload(10, 1)) }
        assertThrows(IOException::class.java) { session.append(1, payload(10, 1)) }
        assertEquals(WivraProgressiveExportSession.State.FAILED, session.state)
    }

    @Test fun mismatchedCrcBytesOrChunksNeverSeal() {
        for (case in 0..2) {
            val session = WivraProgressiveExportSession(1, "video/webm", ByteArrayOutputStream())
            val data = webmHead + payload(100, case)
            session.append(0, data)
            val bytes = if (case == 0) data.size + 1L else data.size.toLong()
            val crc = if (case == 1) crcOf(data) xor 1L else crcOf(data)
            val chunks = if (case == 2) 2 else 1
            assertThrows(WivraProgressiveExportSession.IntegrityException::class.java) { session.finish(bytes, crc, chunks) }
            assertEquals(WivraProgressiveExportSession.State.FAILED, session.state)
        }
    }

    @Test fun containerHeaderMustMatchMime() {
        val wrong = WivraProgressiveExportSession(1, "video/mp4", ByteArrayOutputStream())
        wrong.append(0, webmHead)
        assertThrows(WivraProgressiveExportSession.IntegrityException::class.java) {
            wrong.finish(webmHead.size.toLong(), crcOf(webmHead), 1)
        }
        val mp4 = WivraProgressiveExportSession(1, "video/mp4;codecs=avc1,opus", ByteArrayOutputStream())
        mp4.append(0, mp4Head())
        mp4.finish(mp4Head().size.toLong(), crcOf(mp4Head()), 1)
        // A header split across the first two chunks is still recognised.
        val split = WivraProgressiveExportSession(1, "video/webm", ByteArrayOutputStream())
        split.append(0, byteArrayOf(0x1A, 0x45))
        split.append(1, byteArrayOf(0xDF.toByte(), 0xA3.toByte(), 9))
        split.finish(5, crcOf(byteArrayOf(0x1A, 0x45), byteArrayOf(0xDF.toByte(), 0xA3.toByte(), 9)), 2)
    }

    @Test fun emptyOrOversizedChunksAreRefused() {
        val session = WivraProgressiveExportSession(1, "video/webm", ByteArrayOutputStream(), maxChunkBytes = 16)
        assertThrows(WivraProgressiveExportSession.IntegrityException::class.java) { session.append(0, ByteArray(0)) }
        val big = WivraProgressiveExportSession(1, "video/webm", ByteArrayOutputStream(), maxChunkBytes = 16)
        assertThrows(WivraProgressiveExportSession.IntegrityException::class.java) { big.append(0, ByteArray(17)) }
        val none = WivraProgressiveExportSession(1, "video/webm", ByteArrayOutputStream())
        assertThrows(WivraProgressiveExportSession.IntegrityException::class.java) { none.finish(0, 0, 0) }
    }

    @Test fun diskWriteFailureIsFinalAndAbortClosesOnce() {
        var closes = 0
        val failing = object : OutputStream() {
            override fun write(b: Int) = throw IOException("ENOSPC")
            override fun write(b: ByteArray, off: Int, len: Int) = throw IOException("ENOSPC")
            override fun close() { closes++ }
        }
        val session = WivraProgressiveExportSession(1, "video/webm", failing)
        assertThrows(IOException::class.java) { session.append(0, webmHead) }
        assertEquals(WivraProgressiveExportSession.State.FAILED, session.state)
        session.abort(); session.abort()
        assertEquals(WivraProgressiveExportSession.State.ABORTED, session.state)
        assertEquals(1, closes)
    }

    @Test fun binaryFrameParsingMatchesTheEditorLayout() {
        val body = payload(33, 4)
        val frame = ByteBuffer.allocate(16 + body.size).order(ByteOrder.LITTLE_ENDIAN)
            .putInt(WivraProgressiveExportSession.FRAME_MAGIC).putInt(-2).putInt(77).putInt(5).put(body).array()
        assertEquals("WVX1", String(frame, 0, 4, Charsets.US_ASCII))
        val parsed = WivraProgressiveExportSession.parseFrame(frame)!!
        assertEquals(0xFFFFFFFEL, parsed.rid)
        assertEquals(77, parsed.token)
        assertEquals(5, parsed.seq)
        assertEquals(33, parsed.length)
        assertArrayEquals(body, parsed.data.copyOfRange(parsed.offset, parsed.offset + parsed.length))
        assertNull(WivraProgressiveExportSession.parseFrame(frame.copyOf(16)))
        val bad = frame.copyOf(); bad[0] = 0
        assertNull(WivraProgressiveExportSession.parseFrame(bad))
        val noToken = frame.copyOf(); noToken[8] = 0; noToken[9] = 0; noToken[10] = 0; noToken[11] = 0
        assertNull(WivraProgressiveExportSession.parseFrame(noToken))
    }

    @Test fun measureRereadsBytesAndCrcLikeTheEditor() {
        val data = payload(3 * 1024 * 1024 + 17, 9)
        val (bytes, crc) = WivraProgressiveExportSession.measure(ByteArrayInputStream(data))
        assertEquals(data.size.toLong(), bytes)
        assertEquals(crcOf(data), crc)
        // Same check value the editor's JS implementation asserts for "123456789".
        assertEquals(0xCBF43926L, crcOf("123456789".toByteArray()))
    }

    @Test fun mimeNormalizationOnlyAllowsTwoVideoContainers() {
        assertEquals("video/mp4", WivraProgressiveExportSession.normalizedMime("video/mp4;codecs=avc1,mp4a.40.2"))
        assertEquals("video/webm", WivraProgressiveExportSession.normalizedMime("video/webm;codecs=vp8,opus"))
        assertEquals("video/webm", WivraProgressiveExportSession.normalizedMime("text/html"))
        assertEquals("webm", WivraProgressiveExportSession.extensionFor(null))
        assertTrue(WivraProgressiveExportSession.extensionFor("video/mp4") == "mp4")
    }
}
