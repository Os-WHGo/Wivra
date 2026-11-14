package com.oswhgo.wivra

import java.io.Closeable
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.io.RandomAccessFile
import java.security.MessageDigest
import java.util.TreeMap

/**
 * P0-W native v2 storage primitive, intentionally separate from the existing
 * MediaRecorder append/CRC v1 store. Does not expose a WebView bridge or gallery
 * publication yet. The caller MUST supply a real on-disk media inspector.
 *
 * Only an app-owned, newly created .partial file is ever modified or deleted.
 * The final file is kept in the same private directory; no shared-media
 * publication is implied by [Saved]. All calls are serialized by the instance.
 */
class WivraRandomAccessExportSession private constructor(
    private val partial: File,
    val mime: String,
    private val reservedBytes: Long
) : Closeable {
    enum class State { OPEN, SEALED, FAILED, ABORTED }
    data class Ack(val seq: Int, val writtenBytes: Int, val maxEnd: Long)
    data class Media(val video: Boolean, val audio: Boolean, val durationMs: Long)
    data class Saved(val file: File, val bytes: Long, val sha256: String, val media: Media)
    class IntegrityException(message: String) : IOException(message)

    companion object {
        const val MAX_WRITE_BYTES = 1024 * 1024
        const val MAX_OUTPUT_BYTES = 16L * 1024 * 1024 * 1024

        fun create(
            privateDirectory: File,
            mime: String,
            reservedBytes: Long = MAX_OUTPUT_BYTES
        ): WivraRandomAccessExportSession {
            require(mime == "video/mp4" || mime == "video/webm") { "Invalid random media container" }
            require(reservedBytes in 1..MAX_OUTPUT_BYTES) { "Invalid reserved output size" }
            if (!privateDirectory.isDirectory && !privateDirectory.mkdirs())
                throw IOException("Cannot create app-private export directory.")
            val extension = if (mime == "video/mp4") "mp4" else "webm"
            val partial = File.createTempFile("Wivra_Fast_", ".$extension.partial", privateDirectory)
            return try {
                WivraRandomAccessExportSession(partial, mime, reservedBytes)
            } catch (error: Exception) {
                partial.delete()
                throw error
            }
        }

        private fun digest(file: File): String {
            val sha = MessageDigest.getInstance("SHA-256")
            FileInputStream(file).use { input ->
                val buffer = ByteArray(1024 * 1024)
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    sha.update(buffer, 0, count)
                }
            }
            return sha.digest().joinToString("") { "%02x".format(it.toInt() and 0xff) }
        }

        private fun validHeader(file: File, mime: String): Boolean {
            val header = ByteArray(8)
            val n = FileInputStream(file).use { it.read(header) }
            return if (mime == "video/mp4") {
                n >= 8 && header.copyOfRange(4, 8).contentEquals("ftyp".toByteArray(Charsets.US_ASCII))
            } else {
                n >= 4 && header.copyOfRange(0, 4).contentEquals(
                    byteArrayOf(0x1a, 0x45, 0xdf.toByte(), 0xa3.toByte()))
            }
        }
    }

    private val output = RandomAccessFile(partial, "rw")
    private data class ByteRange(val start: Long, val end: Long)
    private val covered = TreeMap<Long, Long>()
    private val writeRanges = mutableListOf<ByteRange>()
    private val patchRanges = mutableListOf<ByteRange>()
    var state = State.OPEN
        private set
    var maxEnd = 0L
        private set
    var writes = 0
        private set

    private fun recordCoverage(start: Long, end: Long) {
        var low = start
        var high = end
        val lower = covered.floorEntry(low)
        if (lower != null && lower.value >= low) {
            low = lower.key
            high = maxOf(high, lower.value)
            covered.remove(lower.key)
        }
        while (true) {
            val next = covered.ceilingEntry(low) ?: break
            if (next.key > high) break
            high = maxOf(high, next.value)
            covered.remove(next.key)
        }
        covered[low] = high
    }

    private fun validateWriteRange(start: Long, end: Long) {
        val overlaps = writeRanges.filter { start < it.end && end > it.start }
        if (overlaps.isEmpty()) return
        val alreadyCovered = covered.floorEntry(start)?.let { start >= it.key && end <= it.value } == true
        val duplicate = writeRanges.any { it.start == start && it.end == end }
        val overlapsPriorPatch = patchRanges.any { start < it.end && end > it.start }
        if (!alreadyCovered || duplicate || overlapsPriorPatch)
            throw IntegrityException("Random write overlaps existing bytes outside a unique contained patch.")
        // A contained overwrite is allowed for container-header/index patching,
        // but two patches may never rewrite the same byte range.
        patchRanges.add(ByteRange(start, end))
    }

    @Synchronized
    fun writeAt(seq: Int, position: Long, data: ByteArray): Ack {
        if (state != State.OPEN) throw IntegrityException("Random export is not open.")
        if (seq != writes || seq < 0 || data.isEmpty() || data.size > MAX_WRITE_BYTES ||
            position < 0 || position > reservedBytes - data.size.toLong())
            throw IntegrityException("Invalid random offset, sequence or write size.")
        val end = position + data.size
        validateWriteRange(position, end)
        try {
            output.seek(position)
            output.write(data)
            writeRanges.add(ByteRange(position, end))
            recordCoverage(position, end)
            maxEnd = maxOf(maxEnd, end)
            writes++
            return Ack(seq, data.size, maxEnd)
        } catch (error: IOException) {
            state = State.FAILED
            throw error
        }
    }

    /**
     * Requires total coverage, exact size, a full disk read SHA-256, a valid
     * container signature AND the caller's media inspection of the FINAL bytes.
     * No rename occurs on missing audio/video or partial writes.
     */
    @Synchronized
    fun finish(
        expectedBytes: Long,
        expectedWrites: Int,
        expectedDurationMs: Long,
        expectAudio: Boolean,
        inspect: (File) -> Media?
    ): Saved {
        if (state != State.OPEN) throw IntegrityException("Random export is not open.")
        try {
            if (maxEnd == 0L || expectedBytes != maxEnd || expectedWrites != writes ||
                expectedDurationMs <= 0L || covered.size != 1 ||
                covered.firstKey() != 0L || covered.firstEntry().value != maxEnd)
                throw IntegrityException("Random output contains gaps or incorrect totals.")
            output.fd.sync()
            output.close()
            if (partial.length() != maxEnd || !validHeader(partial, mime))
                throw IntegrityException("Random output is incomplete or has an invalid header.")
            val hash = digest(partial)
            val media = inspect(partial)
                ?: throw IntegrityException("Final output is not decodable.")
            if (!media.video || media.durationMs <= 0L || media.audio != expectAudio)
                throw IntegrityException("Required video/audio track is missing or unexpectedly present.")
            // Duration is deliberately not treated as proof of frame-perfect
            // alignment; browser and device QA must check A/V drift separately.
            // Never allow the inspector to mutate the bytes after validation.
            // The sealed result must match the bytes verified above.
            if (partial.length() != maxEnd || digest(partial) != hash)
                throw IntegrityException("Output changed during native media inspection.")
            val completed = File(partial.parentFile, partial.name.removeSuffix(".partial"))
            if (completed.exists() || !partial.renameTo(completed))
                throw IOException("Could not atomically seal private accelerated output.")
            state = State.SEALED
            return Saved(completed, maxEnd, hash, media)
        } catch (error: Exception) {
            state = State.FAILED
            try { output.close() } catch (_: IOException) { }
            partial.delete()
            throw error
        }
    }

    @Synchronized
    fun abort() {
        if (state == State.SEALED || state == State.ABORTED) return
        state = State.ABORTED
        try { output.close() } catch (_: IOException) { }
        partial.delete()
    }

    override fun close() = abort()
}
