package com.oswhgo.wivra

import java.io.Closeable
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.zip.CRC32

/**
 * Progressive export, platform-free core (pure JVM, unit-tested without Android).
 *
 * The editor sends MediaRecorder chunks (~1 s each) in strict order. Every chunk is
 * written to [output] immediately and released; nothing accumulates in memory.
 * [finish] seals the file only if byte count, chunk count and CRC-32 (the same
 * IEEE/zlib polynomial used in app/export-sink.mjs) all match what the editor
 * recorded, and the container header is plausible. Otherwise the owner deletes it.
 * — Claude
 */
class WivraProgressiveExportSession(
    val token: Int,
    val mime: String,
    private val output: OutputStream,
    private val sync: () -> Unit = {},
    private val maxChunkBytes: Int = MAX_CHUNK_BYTES,
) : Closeable {
    enum class State { OPEN, FINISHED, FAILED, ABORTED }

    class IntegrityException(message: String) : IOException(message)

    var state: State = State.OPEN
        private set
    var bytes: Long = 0L
        private set
    var chunks: Int = 0
        private set
    private val crc = CRC32()
    private val head = ByteArray(HEADER_PROBE_BYTES)
    private var headLength = 0

    val crc32: Long get() = crc.value

    /** Appends chunk [seq]; returns total bytes written so far. Any failure is final. */
    @Synchronized
    fun append(seq: Int, data: ByteArray, offset: Int = 0, length: Int = data.size - offset): Long {
        if (state != State.OPEN) throw IOException("La sesión de exportación no está abierta ($state).")
        if (seq != chunks) fail("Fragmento fuera de orden: llegó $seq, se esperaba $chunks.")
        if (length <= 0 || length > maxChunkBytes || offset < 0 || offset + length > data.size)
            fail("Tamaño de fragmento inválido: $length bytes.")
        try {
            output.write(data, offset, length)
        } catch (error: IOException) {
            state = State.FAILED
            throw error
        }
        crc.update(data, offset, length)
        if (headLength < head.size) {
            val n = minOf(head.size - headLength, length)
            System.arraycopy(data, offset, head, headLength, n)
            headLength += n
        }
        bytes += length
        chunks++
        return bytes
    }

    /**
     * Validates the editor's totals, flushes, syncs to the storage device and closes.
     * Returns the CRC-32 of everything written. Does NOT publish: the owner re-reads
     * the file from disk to verify it before making it visible.
     */
    @Synchronized
    fun finish(expectedBytes: Long, expectedCrc32: Long, expectedChunks: Int): Long {
        if (state != State.OPEN) throw IOException("La sesión de exportación no está abierta ($state).")
        if (chunks == 0 || bytes == 0L) fail("No se recibió ningún dato del video.")
        if (expectedBytes != bytes) fail("Bytes distintos: editor $expectedBytes, archivo $bytes.")
        if (expectedChunks != chunks) fail("Fragmentos distintos: editor $expectedChunks, archivo $chunks.")
        if ((expectedCrc32 and 0xFFFFFFFFL) != crc.value) fail("CRC-32 distinto entre el editor y el archivo.")
        if (!looksLikeContainer(mime, head, headLength)) fail("El archivo no empieza como un $mime válido.")
        try {
            output.flush()
            sync()
            output.close()
        } catch (error: IOException) {
            state = State.FAILED
            throw error
        }
        state = State.FINISHED
        return crc.value
    }

    /** Idempotent. Closes the stream; the owner deletes the partial file. */
    @Synchronized
    fun abort() {
        if (state == State.FINISHED || state == State.ABORTED) return
        state = State.ABORTED
        try { output.close() } catch (_: IOException) { /* already unusable */ }
    }

    override fun close() = abort()

    private fun fail(message: String): Nothing {
        state = State.FAILED
        throw IntegrityException(message)
    }

    /** One decoded Android WebMessage binary frame: 'WVX1', rid, token, seq (u32 LE) + payload. */
    class Frame(val rid: Long, val token: Int, val seq: Int, val data: ByteArray) {
        val offset: Int get() = FRAME_HEADER_BYTES
        val length: Int get() = data.size - FRAME_HEADER_BYTES
    }

    companion object {
        const val MAX_CHUNK_BYTES = 32 * 1024 * 1024
        const val FRAME_HEADER_BYTES = 16
        const val FRAME_MAGIC = 0x31585657 // "WVX1" little-endian
        private const val HEADER_PROBE_BYTES = 16

        /** Returns null for anything that is not a well-formed frame. Never copies the payload. */
        @JvmStatic
        fun parseFrame(data: ByteArray?): Frame? {
            if (data == null || data.size <= FRAME_HEADER_BYTES) return null
            val header = ByteBuffer.wrap(data, 0, FRAME_HEADER_BYTES).order(ByteOrder.LITTLE_ENDIAN)
            if (header.int != FRAME_MAGIC) return null
            val rid = header.int.toLong() and 0xFFFFFFFFL
            val token = header.int
            val seq = header.int
            if (token <= 0 || seq < 0) return null
            return Frame(rid, token, seq, data)
        }

        @JvmStatic
        fun normalizedMime(mime: String?): String =
            if (mime != null && mime.lowercase().startsWith("video/mp4")) "video/mp4" else "video/webm"

        @JvmStatic
        fun extensionFor(mime: String?): String =
            if (normalizedMime(mime) == "video/mp4") "mp4" else "webm"

        /** WebM/Matroska starts with the EBML magic; MP4/fMP4 with an 'ftyp' box. */
        @JvmStatic
        fun looksLikeContainer(mime: String, head: ByteArray, length: Int): Boolean =
            if (normalizedMime(mime) == "video/mp4") {
                length >= 8 && head[4] == 'f'.code.toByte() && head[5] == 't'.code.toByte() &&
                    head[6] == 'y'.code.toByte() && head[7] == 'p'.code.toByte()
            } else {
                length >= 4 && head[0] == 0x1A.toByte() && head[1] == 0x45.toByte() &&
                    head[2] == 0xDF.toByte() && head[3] == 0xA3.toByte()
            }

        /** Re-reads a finished file to prove what is on disk: (bytes, crc32). */
        @JvmStatic
        fun measure(input: InputStream): Pair<Long, Long> {
            val crc = CRC32()
            val buffer = ByteArray(1024 * 1024)
            var total = 0L
            input.use {
                while (true) {
                    val n = it.read(buffer)
                    if (n < 0) break
                    crc.update(buffer, 0, n)
                    total += n
                }
            }
            return total to crc.value
        }
    }
}
