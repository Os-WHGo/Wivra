package com.oswhgo.wivra

import android.content.ContentValues
import android.content.Context
import android.media.MediaCodec
import android.media.MediaFormat
import android.media.MediaMuxer
import android.net.Uri
import android.provider.MediaStore
import java.io.File
import java.io.IOException
import java.nio.ByteBuffer

/**
 * Video-only DAT HEVC passthrough. No experimental PCM/HFP or cloud service.
 * Receives Annex-B VPS/SPS/PPS plus video NALs from compressVideo=true stream.
 *
 * Operations are synchronized and run from a non-main coroutine. Do NOT write
 * decoded YUV frames here; the uncompressed preview remains a separate mode.
 * This cannot be declared playable without inspecting files from real glasses.
 */
internal class WivraHevcMp4Recorder(private val context: Context) {
    private val lock = Any()
    private val sets = mutableMapOf<Int, ByteArray>()
    private var file: File? = null
    private var muxer: MediaMuxer? = null
    private var track = -1
    private var started = false
    private val ptsNormalizer = WivraVideoPtsNormalizer()
    private var writtenSamples = 0
    private var failed = false

    val samples: Int get() = synchronized(lock) { writtenSamples }
    val hasStarted: Boolean get() = synchronized(lock) { started }

    fun consume(packet: ByteArray, ptsUs: Long, width: Int, height: Int, isCodecConfig: Boolean) {
        synchronized(lock) {
            if (failed || packet.isEmpty() || packet.size > 8 * 1024 * 1024 ||
                ptsUs < 0 || width !in 2..1920 || height !in 2..1920 ||
                width % 2 != 0 || height % 2 != 0) return
            try {
                val units = annexBNals(packet)
                var syncFrame = false
                for ((type, bytes) in units) {
                    if (type in 32..34) sets[type] = bytes
                    if (type in 16..21) syncFrame = true
                }
                if (!started && sets.keys.containsAll(setOf(32, 33, 34)) && syncFrame) {
                    val output = File.createTempFile("wivra_rayban_", ".writing", pendingDir(context))
                    val writer = MediaMuxer(output.absolutePath,
                        MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
                    val videoFormat = MediaFormat.createVideoFormat(
                        MediaFormat.MIMETYPE_VIDEO_HEVC, width, height)
                    val codecData = sets.toSortedMap().values.flatMap { it.toList() }.toByteArray()
                    videoFormat.setByteBuffer("csd-0", ByteBuffer.wrap(codecData))
                    try {
                        val index = writer.addTrack(videoFormat)
                        writer.start()
                        file = output
                        muxer = writer
                        track = index
                        started = true
                    } catch (e: Exception) {
                        writer.release()
                        output.delete()
                        throw e
                    }
                }
                if (!started || isCodecConfig && !syncFrame) return
                // Pause/resume can rewind DAT PTS. Rebase complete intervals
                // instead of collapsing resumed frames into 1-microsecond PTS.
                val relative = ptsNormalizer.next(ptsUs)
                val info = MediaCodec.BufferInfo().apply {
                    set(0, packet.size, relative,
                        if (syncFrame) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0)
                }
                muxer!!.writeSampleData(track, ByteBuffer.wrap(packet), info)
                writtenSamples += 1
            } catch (_: Exception) {
                // MediaMuxer may refuse malformed CSD/PTS; never claim success.
                failed = true
            }
        }
    }

    /**
     * Finalize and publish only after a decodable stream actually produced data.
     * MediaStore IS_PENDING means partial copies never become visible.
     */
    /**
     * Finalize to durable, app-private pending storage. Do not publish to the
     * device's gallery or delete the valid recording until the user decides.
     */
    fun finishToPending(): File? = synchronized(lock) {
        val local = file
        // A later malformed sample must not erase previously written valid frames.
        // MediaMuxer.stop() is still required to succeed before offering a file.
        val valid = started && writtenSamples >= 2
        val finalized = try {
            if (started) muxer?.stop()
            valid
        } catch (_: Exception) { false }
        try { muxer?.release() } catch (_: Exception) {}
        muxer = null
        started = false
        file = null
        if (!finalized || local == null || local.length() <= 0L) {
            local?.delete()
            return@synchronized null
        }
        // Only ready-to-review, fully finalized files get the .mp4 extension.
        // A process killed before MediaMuxer.stop() leaves .writing instead of
        // a misleading, apparently completed movie in the recovery list.
        val ready = File(local.parentFile, local.name.removeSuffix(".writing") + ".mp4")
        if (!local.renameTo(ready)) return@synchronized null
        ready
    }

    // Kept for existing instrumentation callers; recording UI uses the explicit
    // finishToPending + publishPending path instead.
    fun finishAndSave(): Uri? = finishToPending()?.let { publishPending(context, it) }

    /** One video session can include multiple independently playable MP4 parts. */
    data class PendingRecording(val id: String, val parts: List<File>)

    companion object {
        private val partNamePattern =
            Regex("""^(wivra_rayban_[0-9a-f]{32})_part[0-9]{4}\.mp4$""")

        /**
         * Group checkpointed files by recording session. Legacy single MP4s
         * remain independent recordings; nothing is silently merged or erased.
         */
        fun listPendingRecordings(context: Context): List<PendingRecording> =
            listPending(context)
                .groupBy { file ->
                    partNamePattern.matchEntire(file.name)?.groupValues?.get(1) ?: file.name
                }
                .map { (id, files) ->
                    PendingRecording(id, files.sortedBy { it.name })
                }
                .sortedByDescending { recording ->
                    recording.parts.maxOfOrNull { it.lastModified() } ?: 0L
                }

        private fun pendingDir(context: Context): File =
            File(context.filesDir, "wivra_pending_videos").apply {
                if (!exists() && !mkdirs()) throw IOException("Cannot create pending recordings")
            }

        private fun isPending(context: Context, file: File): Boolean =
            try {
                file.isFile && file.name.startsWith("wivra_rayban_") &&
                    file.extension == "mp4" &&
                    file.canonicalFile.parentFile == pendingDir(context).canonicalFile
            } catch (_: IOException) { false }

        fun listPending(context: Context): List<File> =
            try {
                pendingDir(context).listFiles()
                    ?.filter { isPending(context, it) && it.length() > 0L }
                    ?.sortedByDescending { it.lastModified() } ?: emptyList()
            } catch (_: IOException) { emptyList() }

        /**
         * Files left by Android process death are NOT finalized MP4s.
         * Expose their count for recovery diagnostics but never automatically
         * publish, rename or delete them. Confirmed checkpoint .mp4 files are
         * enumerated separately by listPendingRecordings().
         */
        fun listInterruptedCaptures(context: Context): List<File> =
            try {
                val folder = pendingDir(context).canonicalFile
                folder.listFiles()
                    ?.filter { file ->
                        file.isFile && file.name.startsWith("wivra_rayban_") &&
                            file.name.endsWith(".writing") &&
                            file.length() > 0L &&
                            file.canonicalFile.parentFile == folder
                    }
                    ?.sortedByDescending { it.lastModified() } ?: emptyList()
            } catch (_: IOException) { emptyList() }

        /** Publish to Movies/Wivra ONLY after a user selects Save. */
        @Synchronized
        fun publishPending(context: Context, local: File): Uri? {
            if (!isPending(context, local) || local.length() <= 0L) return null
            // A filename and MediaMuxer.stop() are not proof of readable media.
            // Rejected originals remain private for recovery; never delete them.
            if (!WivraCaptureMediaVerifier.verifyFile(local, pendingDir(context), requireHevc = true).valid) return null
            try {
                val resolver = context.contentResolver
                val previous = WivraCapturePublicationReceipt.recover(context, local)
                if (previous != null) {
                    if (resolver.update(previous, ContentValues().apply {
                        put(MediaStore.Video.Media.IS_PENDING, 0)
                    }, null, null) != 1) return null
                    if (local.delete()) WivraCapturePublicationReceipt.clear(local)
                    return previous
                }
                val values = ContentValues().apply {
                    // Several MP4 checkpoint parts can be saved in the same
                    // millisecond. Include the verified private source ID and
                    // part number to avoid ambiguous gallery names.
                    val safePartId = local.nameWithoutExtension
                        .removePrefix("wivra_rayban_")
                    put(MediaStore.Video.Media.DISPLAY_NAME,
                        "Wivra_RayBan_" + System.currentTimeMillis() +
                        "_" + safePartId + ".mp4")
                    put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                    put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/Wivra/")
                    put(MediaStore.Video.Media.IS_PENDING, 1)
                }
                val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
                    ?: throw IOException("Video collection refused new file")
                return try {
                    val digest = WivraMediaCopy.copyAndVerify(resolver, local, uri)
                    WivraCapturePublicationReceipt.stage(local, uri, digest)
                    if (resolver.update(uri, ContentValues().apply {
                        put(MediaStore.Video.Media.IS_PENDING, 0)
                    }, null, null) != 1) throw IOException("Video could not be published")
                    // If the private copy cannot be deleted, avoid claiming the
                    // pending folder is empty: recovery UI can resolve it later.
                    if (local.delete()) WivraCapturePublicationReceipt.clear(local)
                    uri
                } catch (_: Exception) {
                    resolver.delete(uri, null, null)
                    null // Pending source remains available for retry.
                }
            } catch (_: Exception) {
                return null
            }
        }

        /** Only invoke following a second, destructive-action confirmation. */
        fun discardPending(context: Context, local: File): Boolean =
            isPending(context, local) && local.delete()
    }

    fun discard() = synchronized(lock) {
        try { if (started) muxer?.stop() } catch (_: Exception) {}
        try { muxer?.release() } catch (_: Exception) {}
        muxer = null
        started = false
        file?.delete()
        file = null
        failed = true
    }

    private fun annexBNals(data: ByteArray): List<Pair<Int, ByteArray>> {
        val starts = ArrayList<Pair<Int, Int>>()
        var i = 0
        while (i + 3 < data.size) {
            val len = when {
                data[i] == 0.toByte() && data[i + 1] == 0.toByte() &&
                    data[i + 2] == 1.toByte() -> 3
                i + 3 < data.size && data[i] == 0.toByte() &&
                    data[i + 1] == 0.toByte() && data[i + 2] == 0.toByte() &&
                    data[i + 3] == 1.toByte() -> 4
                else -> 0
            }
            if (len == 0) { i++; continue }
            val header = i + len
            if (header < data.size &&
                !(header + 2 < data.size && data[header] == 0.toByte() &&
                    data[header + 1] == 0.toByte() &&
                    (data[header + 2] == 1.toByte() || data[header + 2] == 0.toByte()))) {
                starts.add(i to len)
            }
            i = header
        }
        val result = ArrayList<Pair<Int, ByteArray>>()
        for (j in starts.indices) {
            val (start, prefix) = starts[j]
            val end = if (j + 1 < starts.size) starts[j + 1].first else data.size
            if (start + prefix + 1 >= end) continue
            val type = (data[start + prefix].toInt() and 0x7e) shr 1
            result.add(type to data.copyOfRange(start, end))
        }
        return result
    }
}
