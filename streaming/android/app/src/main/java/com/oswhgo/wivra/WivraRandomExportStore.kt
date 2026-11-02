package com.oswhgo.wivra

import android.content.ContentValues
import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.provider.MediaStore
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap

/**
 * Experimental random-write protocol v2. Never substitutes v1 MediaRecorder.
 * Bytes are patched in a NEW app-private file, validated, then copied into a
 * NEW pending MediaStore item. Only an independently re-read, inspected copy
 * can become visible in Movies/Wivra. No existing user video is overwritten.
 *
 * The bridge serializes all calls on its single IO executor. A fully sealed
 * private file is deliberately preserved if gallery publication fails, to
 * avoid losing a verified long recording. A future recovery UI may surface it.
 */
object WivraRandomExportStore {
    private const val MIN_FREE_BYTES = WivraExportStore.MIN_FREE_BYTES
    private const val DIR = "accelerated-v2"
    private const val PREFIX = "Wivra_Fast_"
    private val random = SecureRandom()
    private data class Active(
        val owner: String,
        val session: WivraRandomAccessExportSession,
        val mime: String
    )
    data class Published(
        val uri: Uri,
        val name: String,
        val mime: String,
        val bytes: Long,
        val sha256: String,
        val media: WivraRandomAccessExportSession.Media
    )
    private val active = ConcurrentHashMap<Int, Active>()
    private val finished = ConcurrentHashMap<Int, Pair<String, Published>>()

    private fun directory(context: Context) = File(context.filesDir, DIR)
    private fun digest() = MessageDigest.getInstance("SHA-256")
    private fun shaString(hash: ByteArray) =
        hash.joinToString("") { "%02x".format(it.toInt() and 0xff) }
    private fun requireOwner(token: Int, owner: String): Active =
        active[token]?.takeIf { it.owner == owner }
            ?: throw IOException("Sesión acelerada desconocida.")

    fun begin(context: Context, mime: String, estimatedBytes: Long, owner: String): Int {
        if (mime != "video/mp4" && mime != "video/webm") throw IOException("Contenedor inválido.")
        if (estimatedBytes < 0 || estimatedBytes > WivraRandomAccessExportSession.MAX_OUTPUT_BYTES)
            throw IOException("Tamaño estimado fuera del límite seguro.")
        if (WivraExportStore.freeBytes(context) < estimatedBytes + MIN_FREE_BYTES)
            throw IOException("Espacio insuficiente para la exportación y reserva del sistema.")
        var token: Int
        do { token = random.nextInt(Int.MAX_VALUE - 1) + 1 }
        while (active.containsKey(token) || finished.containsKey(token))
        active[token] = Active(owner, WivraRandomAccessExportSession.create(directory(context), mime), mime)
        return token
    }

    fun writeAt(context: Context, token: Int, seq: Int, position: Long, bytes: ByteArray, owner: String):
        WivraRandomAccessExportSession.Ack {
        val item = requireOwner(token, owner)
        try {
            val nextEnd = position + bytes.size
            if (nextEnd > item.session.maxEnd &&
                WivraExportStore.freeBytes(context) < MIN_FREE_BYTES)
                throw IOException("Espacio libre insuficiente para continuar el video.")
            return item.session.writeAt(seq, position, bytes)
        } catch (error: Exception) {
            abort(token, owner)
            throw error
        }
    }

    /** Real Android track metadata + sample probing. Not a hardware decode claim. */
    private fun inspect(file: File, mime: String): WivraRandomAccessExportSession.Media? {
        val retriever = MediaMetadataRetriever()
        val extractor = MediaExtractor()
        try {
            retriever.setDataSource(file.absolutePath)
            extractor.setDataSource(file.absolutePath)
            val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                ?.toLongOrNull() ?: return null
            var video = false
            var audio = false
            var videoTrack = -1
            for (i in 0 until extractor.trackCount) {
                val format = extractor.getTrackFormat(i)
                val trackMime = format.getString(MediaFormat.KEY_MIME) ?: continue
                if (trackMime.startsWith("video/")) { video = true; videoTrack = i }
                if (trackMime.startsWith("audio/")) audio = true
            }
            if (!video || videoTrack < 0 || duration <= 0) return null
            extractor.selectTrack(videoTrack)
            val probe = java.nio.ByteBuffer.allocate(64 * 1024)
            if (extractor.readSampleData(probe, 0) <= 0) return null
            if (mime == "video/webm") {
                FileInputStream(file).channel.use { ch ->
                    val seek = WivraWebmSeekable.analyze(WivraExportFinalizer.FileChannelSource(ch))
                    if (!seek.hasDuration || !seek.hasCues) return null
                }
            }
            return WivraRandomAccessExportSession.Media(video, audio, duration)
        } finally {
            try { extractor.release() } catch (_: Exception) { }
            try { retriever.release() } catch (_: Exception) { }
        }
    }

    fun finish(context: Context, token: Int, bytes: Long, writes: Int,
               expectedDurationMs: Long, expectAudio: Boolean, owner: String): Published {
        val item = requireOwner(token, owner)
        // Remove first so no late chunk can revive an already finalizing export.
        if (!active.remove(token, item)) throw IOException("Sesión acelerada ocupada.")
        val verified = item.session.finish(bytes, writes, expectedDurationMs, expectAudio) { file ->
            inspect(file, item.mime)
        }
        val tolerance = maxOf(1500L, minOf(5000L, expectedDurationMs / 100L))
        if (kotlin.math.abs(verified.media.durationMs - expectedDurationMs) > tolerance)
            throw IOException("La duración del archivo difiere de la exportación solicitada; copia privada conservada.")
        return publish(context, token, owner, item.mime, verified)
    }

    private fun publish(context: Context, token: Int, owner: String, mime: String,
                        verified: WivraRandomAccessExportSession.Saved): Published {
        if (WivraExportStore.freeBytes(context) < verified.bytes + MIN_FREE_BYTES)
            throw IOException("Sin espacio para verificar la copia de galería; copia privada conservada.")
        val ext = if (mime == "video/mp4") ".mp4" else ".webm"
        val name = PREFIX + System.currentTimeMillis() + "_" + Integer.toHexString(token) + ext
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, name)
            put(MediaStore.Video.Media.MIME_TYPE, mime)
            put(MediaStore.Video.Media.RELATIVE_PATH, WivraExportStore.FOLDER)
            put(MediaStore.Video.Media.IS_PENDING, 1)
        }) ?: throw IOException("No se pudo preparar la copia de galería.")
        try {
            val sha = digest()
            var copied = 0L
            FileInputStream(verified.file).use { input ->
                resolver.openFileDescriptor(uri, "w")?.use { descriptor ->
                    FileOutputStream(descriptor.fileDescriptor).use { out ->
                        val buffer = ByteArray(1024 * 1024)
                        while (true) {
                            val n = input.read(buffer)
                            if (n < 0) break
                            out.write(buffer, 0, n)
                            sha.update(buffer, 0, n)
                            copied += n
                        }
                        out.fd.sync()
                    }
                } ?: throw IOException("No se pudo escribir en la galería.")
            }
            if (copied != verified.bytes || shaString(sha.digest()) != verified.sha256)
                throw IOException("La copia de galería difiere del archivo verificado.")
            // Re-read the published media bytes, not just the bytes from memory.
            val diskSha = digest()
            var diskBytes = 0L
            resolver.openInputStream(uri)?.use { input ->
                val buffer = ByteArray(1024 * 1024)
                while (true) {
                    val n = input.read(buffer)
                    if (n < 0) break
                    diskSha.update(buffer, 0, n)
                    diskBytes += n
                }
            } ?: throw IOException("No se pudo releer la copia de galería.")
            if (diskBytes != verified.bytes || shaString(diskSha.digest()) != verified.sha256)
                throw IOException("La copia releída no coincide con SHA-256.")
            val gallery = WivraExportFinalizer.inspect(context, uri, mime)
            if (!gallery.video || gallery.durationMs <= 0 ||
                (verified.media.audio && !gallery.audio) ||
                kotlin.math.abs(gallery.durationMs - verified.media.durationMs) > 1500L ||
                (mime == "video/webm" && (!gallery.declaresDuration || !gallery.seekIndex)))
                throw IOException("El archivo de galería no supera inspección multimedia.")
            if (resolver.update(uri, ContentValues().apply {
                    put(MediaStore.Video.Media.IS_PENDING, 0)
                }, null, null) != 1)
                throw IOException("No se pudo publicar la copia verificada.")
            val published = Published(uri, name, mime, diskBytes, verified.sha256, verified.media)
            finished[token] = owner to published
            // Deletion is restricted to this exact verified private output.
            verified.file.delete()
            return published
        } catch (error: Exception) {
            try { resolver.delete(uri, null, null) } catch (_: Exception) { }
            // Important: leave verified.file in app-private recovery storage.
            throw error
        }
    }

    fun abort(token: Int, owner: String) {
        val item = active[token] ?: return
        if (item.owner != owner) return
        if (active.remove(token, item)) item.session.abort()
    }

    fun abortOwned(owner: String) {
        for ((token, item) in active.entries.toList()) if (item.owner == owner) abort(token, owner)
    }

    fun saved(token: Int, owner: String): Published? =
        finished[token]?.takeIf { it.first == owner }?.second

    /** Only stale, incomplete Wivra v2 temp files, never finalized private videos. */
    fun cleanupOrphanPartials(context: Context): Int {
        val dir = directory(context)
        var count = 0
        for (file in dir.listFiles().orEmpty()) {
            if (file.isFile && file.name.startsWith(PREFIX) && file.name.endsWith(".partial")) {
                if (file.delete()) count++
            }
        }
        return count
    }
}
