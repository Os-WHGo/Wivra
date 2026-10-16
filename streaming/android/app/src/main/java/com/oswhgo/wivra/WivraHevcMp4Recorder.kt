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
    private var firstPtsUs = -1L
    private var lastPtsUs = -1L
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
                    val output = File.createTempFile("wivra_rayban_", ".mp4", pendingDir(context))
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
                        firstPtsUs = ptsUs
                    } catch (e: Exception) {
                        writer.release()
                        output.delete()
                        throw e
                    }
                }
                if (!started || isCodecConfig && !syncFrame) return
                val relative = (ptsUs - firstPtsUs).coerceAtLeast(lastPtsUs + 1L)
                val info = MediaCodec.BufferInfo().apply {
                    set(0, packet.size, relative,
                        if (syncFrame) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0)
                }
                muxer!!.writeSampleData(track, ByteBuffer.wrap(packet), info)
                lastPtsUs = relative
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
        val valid = started && !failed && writtenSamples >= 2
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
        local
    }

    // Kept for existing instrumentation callers; recording UI uses the explicit
    // finishToPending + publishPending path instead.
    fun finishAndSave(): Uri? = finishToPending()?.let { publishPending(context, it) }

    companion object {
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

        /** Publish to Movies/Wivra ONLY after a user selects Save. */
        fun publishPending(context: Context, local: File): Uri? {
            if (!isPending(context, local) || local.length() <= 0L) return null
            try {
                val resolver = context.contentResolver
                val values = ContentValues().apply {
                    put(MediaStore.Video.Media.DISPLAY_NAME,
                        "Wivra_RayBan_" + System.currentTimeMillis() + ".mp4")
                    put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
                    put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/Wivra/")
                    put(MediaStore.Video.Media.IS_PENDING, 1)
                }
                val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
                    ?: throw IOException("Video collection refused new file")
                return try {
                    resolver.openOutputStream(uri, "w")?.use { output ->
                        local.inputStream().use { it.copyTo(output) }
                    } ?: throw IOException("Video collection refused write")
                    if (resolver.update(uri, ContentValues().apply {
                        put(MediaStore.Video.Media.IS_PENDING, 0)
                    }, null, null) != 1) throw IOException("Video could not be published")
                    // If the private copy cannot be deleted, avoid claiming the
                    // pending folder is empty: recovery UI can resolve it later.
                    local.delete()
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
