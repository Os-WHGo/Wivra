package com.oswhgo.wivra

import android.content.Context
import android.os.SystemClock
import java.io.File
import java.util.UUID

/**
 * Independently playable HEVC MP4 checkpoints for a long Ray-Ban capture.
 *
 * A new part starts only at a new HEVC random-access frame. Parameter-set NALs
 * are replayed into its muxer so it can start independently. Previous parts
 * have already been closed and renamed to .mp4, and must NEVER be discarded
 * just because this or another app process stops unexpectedly.
 *
 * This is a video-only prototype pending real DAT codec/device validation.
 * Parts are NOT automatically merged into one movie.
 */
internal class WivraSegmentedHevcRecorder(
    private val context: Context,
    private val checkpointIntervalUs: Long = 30_000_000L
) {
    private val lock = Any()
    private val sessionKey = UUID.randomUUID().toString().replace("-", "")
    private val codecSets = mutableMapOf<Int, ByteArray>()
    private val finishedParts = mutableListOf<File>()
    private var recorder = WivraHevcMp4Recorder(context)
    private var segmentStartElapsedUs = -1L
    private var finishedSamples = 0
    private var nextPart = 1
    private var closed = false

    val samples: Int get() = synchronized(lock) { finishedSamples + recorder.samples }
    val checkpointCount: Int get() = synchronized(lock) { finishedParts.size }

    fun consume(
        packet: ByteArray, ptsUs: Long, width: Int, height: Int, isCodecConfig: Boolean
    ) = synchronized(lock) {
        if (closed || packet.isEmpty() || packet.size > 8 * 1024 * 1024 ||
            ptsUs < 0 || width !in 2..1920 || height !in 2..1920 ||
            width % 2 != 0 || height % 2 != 0) return@synchronized

        val nals = scanAnnexB(packet)
        var randomAccess = false
        for ((type, bytes) in nals) {
            if (type in 32..34) codecSets[type] = bytes
            if (type in 16..21) randomAccess = true
        }

        // DAT PTS can regress or reset when glasses pause/resume.
        // Use monotonic phone time only for checkpoint scheduling. The
        // MP4 muxer still receives the true per-frame DAT timestamps.
        val nowElapsedUs = SystemClock.elapsedRealtimeNanos() / 1_000L
        val canCheckpoint = segmentStartElapsedUs >= 0L &&
            nowElapsedUs - segmentStartElapsedUs >= checkpointIntervalUs &&
            recorder.samples >= 2 &&
            codecSets.keys.containsAll(setOf(32, 33, 34)) &&
            randomAccess && !isCodecConfig

        if (canCheckpoint) {
            closeCurrentPart()
            recorder = WivraHevcMp4Recorder(context)
            segmentStartElapsedUs = -1L
            // Each new HEVC segment needs VPS/SPS/PPS even if the SDK emits
            // them only once at the beginning of the whole capture.
            val config = codecSets.toSortedMap().values.fold(
                java.io.ByteArrayOutputStream()
            ) { out, bytes -> out.apply { write(bytes) } }.toByteArray()
            recorder.consume(config, ptsUs, width, height, true)
        }

        recorder.consume(packet, ptsUs, width, height, isCodecConfig)
        if (segmentStartElapsedUs < 0L && recorder.hasStarted) {
            segmentStartElapsedUs = nowElapsedUs
        }
    }

    /**
     * Close the active part. Already finalized checkpoints remain in private
     * storage even if MediaMuxer cannot close the final part.
     */
    fun finishToPending(): File? = synchronized(lock) {
        if (!closed) {
            closeCurrentPart()
            closed = true
        }
        finishedParts.lastOrNull()
    }

    /** Abandon only the current unfinished muxer, not finalized checkpoints. */
    fun discard() = synchronized(lock) {
        if (!closed) recorder.discard()
        closed = true
    }

    private fun closeCurrentPart() {
        val count = recorder.samples
        val pending = recorder.finishToPending()
        finishedSamples += count
        if (pending != null) {
            val partName = "wivra_rayban_${sessionKey}_part" +
                nextPart.toString().padStart(4, '0') + ".mp4"
            val renamed = File(pending.parentFile, partName)
            // Same-directory rename is atomic on the target filesystem.
            // If it fails, keep the original finalized MP4 as a standalone
            // pending item. Never overwrite or delete it.
            val ready = if (!renamed.exists() && pending.renameTo(renamed)) {
                renamed
            } else {
                pending
            }
            finishedParts.add(ready)
            nextPart++
        }
    }

    /**
     * NAL scanning is bounded by the incoming 8 MiB DAT packet. The original
     * packet is still written unchanged to the underlying MediaMuxer.
     */
    private fun scanAnnexB(packet: ByteArray): List<Pair<Int, ByteArray>> {
        val offsets = ArrayList<Pair<Int, Int>>()
        var i = 0
        while (i + 3 < packet.size) {
            val len = when {
                packet[i] == 0.toByte() && packet[i + 1] == 0.toByte() &&
                    packet[i + 2] == 1.toByte() -> 3
                i + 3 < packet.size && packet[i] == 0.toByte() &&
                    packet[i + 1] == 0.toByte() && packet[i + 2] == 0.toByte() &&
                    packet[i + 3] == 1.toByte() -> 4
                else -> 0
            }
            if (len > 0) {
                offsets.add(i to len)
                i += len
            } else {
                i++
            }
        }
        val result = ArrayList<Pair<Int, ByteArray>>()
        for (index in offsets.indices) {
            val (start, prefix) = offsets[index]
            val end = offsets.getOrNull(index + 1)?.first ?: packet.size
            if (start + prefix + 1 >= end) continue
            val type = (packet[start + prefix].toInt() and 0x7e) shr 1
            result.add(type to packet.copyOfRange(start, end))
        }
        return result
    }
}
