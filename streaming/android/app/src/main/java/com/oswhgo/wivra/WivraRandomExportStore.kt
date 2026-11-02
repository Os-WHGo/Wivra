package com.oswhgo.wivra

import android.content.ContentValues
import android.content.Context
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.MediaStore
import java.io.File
import java.io.FileInputStream
import java.io.IOException
import java.security.MessageDigest
import java.nio.file.Files
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
        if (estimatedBytes <= 0 || estimatedBytes > WivraRandomAccessExportSession.MAX_OUTPUT_BYTES)
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

    /**
     * A .mp4 extension cannot make HEVC/VP9 or Opus into iOS/gallery-safe
     * H.264/AAC. This v2-only check is performed against Android's extractor
     * report for the actual final bytes, not requested WebCodecs settings.
     * WebM retains its existing independent seek and duration preflight.
     */
    internal fun compatibleAcceleratedTrack(mime: String, trackMime: String): Boolean {
        if (mime != "video/mp4") return true
        return when {
            trackMime.startsWith("video/") -> trackMime == MediaFormat.MIMETYPE_VIDEO_AVC
            trackMime.startsWith("audio/") -> trackMime == MediaFormat.MIMETYPE_AUDIO_AAC
            else -> true
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
                if (!compatibleAcceleratedTrack(mime, trackMime)) return null
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
                val descriptor = resolver.openFileDescriptor(uri, "w")
                    ?: throw IOException("No se pudo escribir en la galería.")
                ParcelFileDescriptor.AutoCloseOutputStream(descriptor).use { out ->
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


    /**
     * Files left sealed when gallery publication failed survive process death.
     * Inspect on the device, reject symlinks/path escapes, and never mistake a
     * filename or extension for evidence that a recording is playable.
     */
    data class Recovered(val name: String, val mime: String, val bytes: Long,
                         val sha256: String, val media: WivraRandomAccessExportSession.Media)

    private val sealedName = Regex("""^Wivra_Fast_[A-Za-z0-9_-]{6,80}\.(mp4|webm)$""")
    /** Pure filename boundary; file identity and media bytes are checked separately. */
    internal fun isRecoverableFilename(name: String): Boolean = name.matches(sealedName)

    private fun validateSealed(context: Context, file: File): Recovered? {
        val root = directory(context).canonicalFile
        if (!isRecoverableFilename(file.name) || !file.isFile ||
            Files.isSymbolicLink(file.toPath()) || file.canonicalFile.parentFile != root ||
            file.length() <= 0 || file.length() > WivraRandomAccessExportSession.MAX_OUTPUT_BYTES)
            return null
        val mime = if (file.name.endsWith(".mp4")) "video/mp4" else "video/webm"
        return try {
            val media = inspect(file, mime) ?: return null
            if (!media.video || media.durationMs <= 0) return null
            val hash = digest()
            var actual = 0L
            FileInputStream(file).use { input ->
                val chunk = ByteArray(1024 * 1024)
                while (true) {
                    val count = input.read(chunk)
                    if (count < 0) break
                    hash.update(chunk, 0, count)
                    actual += count
                }
            }
            if (actual != file.length()) return null
            Recovered(file.name, mime, actual, shaString(hash.digest()), media)
        } catch (_: Exception) { null }
    }

    /** Read-only catalog. Never publishes, edits or deletes a saved original. */
    @JvmStatic
    fun recovered(context: Context): List<Recovered> {
        return directory(context).listFiles().orEmpty()
            .filter { it.isFile && isRecoverableFilename(it.name) }
            .sortedByDescending { it.lastModified() }.take(100)
            .mapNotNull { validateSealed(context, it) }
    }

    /**
     * An explicit native user action may republish ONE verified private file.
     * A newly created MediaStore row is SHA-256 verified before it is visible;
     * the sealed source survives any failure. No arbitrary path or deletion API.
     */
    @JvmStatic
    fun restore(context: Context, selectedName: String): Published {
        if (!isRecoverableFilename(selectedName)) throw IOException("Nombre de recuperación inválido.")
        val file = File(directory(context), selectedName)
        val verified = validateSealed(context, file)
            ?: throw IOException("El archivo privado no supera la verificación.")
        val expected = WivraRandomAccessExportSession.Saved(
            file, verified.bytes, verified.sha256, verified.media)
        val owner = java.util.UUID.randomUUID().toString()
        var token: Int
        do { token = random.nextInt(Int.MAX_VALUE - 1) + 1 }
        while (active.containsKey(token) || finished.containsKey(token))
        return publish(context, token, owner, verified.mime, expected)
    }

    /** Only stale, incomplete Wivra v2 temp files, never finalized private videos. */
    fun cleanupOrphanPartials(context: Context): Int {
        // Another live editor Activity may own an active random-write session.
        // Never mistake its partial file for a crash orphan.
        if (active.isNotEmpty()) return 0
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
