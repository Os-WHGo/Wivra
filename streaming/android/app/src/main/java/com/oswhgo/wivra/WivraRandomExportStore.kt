package com.oswhgo.wivra

import android.content.ContentResolver
import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.os.Bundle
import android.os.Build
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
    private val pendingMediaName = Regex("""^Wivra_Fast_[0-9]{10,17}_[0-9a-f]{1,8}\.(mp4|webm)$""")
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
        val media: WivraRandomAccessExportSession.Media,
        val alreadyPublished: Boolean = false
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

    internal fun validEstimatedBytes(estimatedBytes: Long): Boolean =
        estimatedBytes > 0 && estimatedBytes <= WivraRandomAccessExportSession.MAX_OUTPUT_BYTES

    /** Pure predicate for app-owned, interrupted v2 MediaStore rows. */
    internal fun isOwnedPendingV2MediaRow(
        name: String?, mime: String?, relativePath: String?, ownerPackage: String?,
        pending: Int, expectedPackage: String
    ): Boolean {
        if (pending != 1 || name == null || !pendingMediaName.matches(name) ||
            relativePath != WivraExportStore.FOLDER || ownerPackage != expectedPackage)
            return false
        return when {
            name.endsWith(".mp4") -> mime == "video/mp4"
            name.endsWith(".webm") -> mime == "video/webm"
            else -> false
        }
    }

    fun begin(context: Context, mime: String, estimatedBytes: Long, owner: String): Int {
        if (mime != "video/mp4" && mime != "video/webm") throw IOException("Contenedor inválido.")
        if (!validEstimatedBytes(estimatedBytes))
            throw IOException("Tamaño estimado fuera del límite seguro.")
        if (WivraExportStore.freeBytes(context) < estimatedBytes + MIN_FREE_BYTES)
            throw IOException("Espacio insuficiente para la exportación y reserva del sistema.")
        var token: Int
        do { token = random.nextInt(Int.MAX_VALUE - 1) + 1 }
        while (active.containsKey(token) || finished.containsKey(token))
        active[token] = Active(owner, WivraRandomAccessExportSession.create(directory(context), mime, estimatedBytes), mime)
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

    // W74: record ordinary file freshness before the platform's asynchronous
    // codec/readback work. This is defense-in-depth, not immutable inode proof.
    private data class RecoveryStamp(val bytes: Long, val modifiedMs: Long)

    private fun recoveryStamp(file: File, root: File): RecoveryStamp? {
        if (!isRecoverableFilename(file.name) || !file.isFile ||
            Files.isSymbolicLink(file.toPath()) || file.canonicalFile.parentFile != root)
            return null
        val bytes = file.length()
        val modified = file.lastModified()
        if (bytes <= 0L || bytes > WivraRandomAccessExportSession.MAX_OUTPUT_BYTES ||
            modified <= 0L) return null
        return RecoveryStamp(bytes, modified)
    }

    // Filter cheap but important file/path checks BEFORE applying the bounded
    // 100-result limit. Noise and symlinks must not hide a legitimate recording.
    // The final validator repeats these checks after media inspection and SHA.
    internal fun recoveryCandidates(folder: File, limit: Int = 100): List<File> {
        require(limit in 1..100)
        if (!folder.isDirectory || Files.isSymbolicLink(folder.toPath())) return emptyList()
        val root = folder.canonicalFile
        return folder.listFiles().orEmpty()
            .filter { recoveryStamp(it, root) != null }
            .sortedWith(compareByDescending<File> { it.lastModified() }
                .thenByDescending { it.name })
            .take(limit)
    }

    private fun validateSealed(context: Context, file: File): Recovered? {
        val root = directory(context).canonicalFile
        val initialStamp = recoveryStamp(file, root) ?: return null
        val mime = if (file.name.endsWith(".mp4")) "video/mp4" else "video/webm"
        return try {
            val media = inspect(file, mime) ?: return null
            if (!media.video || media.durationMs <= 0 ||
                recoveryStamp(file, root) != initialStamp) return null
            val hash = digest()
            var actual = 0L
            FileInputStream(file).use { input ->
                val chunk = ByteArray(1024 * 1024)
                while (true) {
                    val count = input.read(chunk)
                    if (count < 0) break
                    hash.update(chunk, 0, count)
                    actual += count
                    if (actual > initialStamp.bytes) return null
                }
            }
            if (actual != initialStamp.bytes ||
                recoveryStamp(file, root) != initialStamp) return null
            Recovered(file.name, mime, actual, shaString(hash.digest()), media)
        } catch (_: Exception) { null }
    }

    /** Read-only catalog. Never publishes, edits or deletes a saved original. */
    @JvmStatic
    fun recovered(context: Context): List<Recovered> {
        return recoveryCandidates(directory(context))
            .mapNotNull { validateSealed(context, it) }
    }

    /**
     * Never republish the same sealed recording if a previous MediaStore
     * publication completed but the app was killed before it acknowledged it.
     * Query only this app's OWN completed exports in its own Movies folder.
     * Never delete or modify existing rows and never trust their names as
     * proof: read the bytes, SHA-256 and real media metadata again.
     */
    internal fun isVerifiedRecoveryCopy(
        expectedBytes: Long, actualBytes: Long,
        expectedSha: String, actualSha: String,
        expectedDurationMs: Long, actualDurationMs: Long,
        expectsAudio: Boolean, actualAudio: Boolean,
        actualVideo: Boolean, isWebm: Boolean,
        hasDuration: Boolean, seekIndex: Boolean
    ): Boolean = expectedBytes > 0L && expectedBytes == actualBytes &&
        expectedSha.length == 64 && expectedSha.equals(actualSha, ignoreCase = true) &&
        actualVideo && actualDurationMs > 0L &&
        kotlin.math.abs(actualDurationMs - expectedDurationMs) <= 1500L &&
        (!expectsAudio || actualAudio) &&
        (!isWebm || (hasDuration && seekIndex))

    private fun existingRecoveryCopy(context: Context, expected: Recovered): Published? {
        val resolver = context.contentResolver
        val collection = MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        val columns = arrayOf(
            MediaStore.MediaColumns._ID,
            MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.SIZE,
            MediaStore.MediaColumns.IS_PENDING,
            MediaStore.MediaColumns.MIME_TYPE,
            MediaStore.MediaColumns.RELATIVE_PATH,
            MediaStore.MediaColumns.OWNER_PACKAGE_NAME
        )
        val query = Bundle().apply {
            putInt(MediaStore.QUERY_ARG_MATCH_PENDING, MediaStore.MATCH_EXCLUDE)
            putString(ContentResolver.QUERY_ARG_SQL_SELECTION,
                "${MediaStore.MediaColumns.RELATIVE_PATH} = ? AND " +
                "${MediaStore.MediaColumns.OWNER_PACKAGE_NAME} = ? AND " +
                "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ? AND " +
                "${MediaStore.MediaColumns.SIZE} = ?")
            putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS,
                arrayOf(WivraExportStore.FOLDER, context.packageName,
                    "${PREFIX}%", expected.bytes.toString()))
        }
        // Do not continue to produce a possibly duplicate gallery copy if
        // ownership or completeness cannot be determined by the provider.
        val cursor = try { resolver.query(collection, columns, query, null) }
        catch (error: Exception) {
            throw IOException("No se pudo comprobar duplicados de galería.", error)
        } ?: throw IOException("Catálogo de galería no disponible para recuperación.")
        cursor.use {
            var inspected = 0
            val id = it.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
            val nameColumn = it.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
            val size = it.getColumnIndexOrThrow(MediaStore.MediaColumns.SIZE)
            val pendingColumn = it.getColumnIndexOrThrow(MediaStore.MediaColumns.IS_PENDING)
            val mime = it.getColumnIndexOrThrow(MediaStore.MediaColumns.MIME_TYPE)
            val folder = it.getColumnIndexOrThrow(MediaStore.MediaColumns.RELATIVE_PATH)
            val owner = it.getColumnIndexOrThrow(MediaStore.MediaColumns.OWNER_PACKAGE_NAME)
            while (it.moveToNext()) {
                if (++inspected > 250)
                    throw IOException("Demasiados videos propios para comprobar recuperación.")
                val name = it.getString(nameColumn) ?: continue
                if (!name.startsWith(PREFIX) ||
                    it.getInt(pendingColumn) != 0 ||
                    it.getString(owner) != context.packageName ||
                    it.getString(folder) != WivraExportStore.FOLDER ||
                    it.getString(mime) != expected.mime ||
                    it.getLong(size) != expected.bytes) continue
                val uri = ContentUris.withAppendedId(collection, it.getLong(id))
                var actualBytes = 0L
                val hash = digest()
                try {
                    (resolver.openInputStream(uri) ?:
                        throw IOException("No se pudo releer video previo de Wivra.")).use { input ->
                        val buffer = ByteArray(1024 * 1024)
                        while (true) {
                            val n = input.read(buffer)
                            if (n < 0) break
                            actualBytes += n
                            if (actualBytes > expected.bytes) break
                            hash.update(buffer, 0, n)
                        }
                    }
                } catch (error: Exception) {
                    throw IOException("No se pudo comprobar copia previa; sin duplicar.", error)
                }
                val actualSha = shaString(hash.digest())
                if (actualBytes != expected.bytes ||
                    !expected.sha256.equals(actualSha, ignoreCase = true))
                    continue
                // A matching hash with corrupt playback metadata is NOT a
                // successful recovery; protect the sealed original.
                val gallery = try { WivraExportFinalizer.inspect(context, uri, expected.mime) }
                catch (error: Exception) {
                    throw IOException("Copia previa inválida; privado conservado.", error)
                }
                if (!isVerifiedRecoveryCopy(
                    expected.bytes, actualBytes, expected.sha256, actualSha,
                    expected.media.durationMs, gallery.durationMs,
                    expected.media.audio, gallery.audio, gallery.video,
                    expected.mime == "video/webm",
                    gallery.declaresDuration, gallery.seekIndex))
                    throw IOException("Copia previa no reproduce correctamente; privado conservado.")
                return Published(uri, name, expected.mime, expected.bytes,
                    expected.sha256, expected.media, alreadyPublished = true)
            }
        }
        return null
    }

    /**
     * An explicit native user action may republish ONE verified private file.
     * A newly created MediaStore row is SHA-256 verified before it is visible;
     * the sealed source survives any failure. No arbitrary path or deletion API.
     */
    @JvmStatic
    @Synchronized
    fun restore(context: Context, selectedName: String): Published {
        if (!isRecoverableFilename(selectedName)) throw IOException("Nombre de recuperación inválido.")
        val file = File(directory(context), selectedName)
        val verified = validateSealed(context, file)
            ?: throw IOException("El archivo privado no supera la verificación.")
        // Process-death replay safety: if a prior gallery copy was already
        // published and verified, return it instead of creating a duplicate.
        // The private sealed file remains recoverable until explicitly handled.
        existingRecoveryCopy(context, verified)?.let { return it }
        val expected = WivraRandomAccessExportSession.Saved(
            file, verified.bytes, verified.sha256, verified.media)
        val owner = java.util.UUID.randomUUID().toString()
        var token: Int
        do { token = random.nextInt(Int.MAX_VALUE - 1) + 1 }
        while (active.containsKey(token) || finished.containsKey(token))
        return publish(context, token, owner, verified.mime, expected)
    }

    /**
     * Remove orphaned pending MediaStore rows from interrupted v2 publication.
     * All bridge operations share one IO executor, so cleanup cannot race an
     * in-flight publish. Every candidate is checked again in DELETE selection.
     */
    private fun cleanupOrphanPendingMediaRows(context: Context): Int {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return 0
        val resolver = context.contentResolver
        val collection = MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        val projection = arrayOf(
            MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME,
            MediaStore.MediaColumns.MIME_TYPE, MediaStore.MediaColumns.RELATIVE_PATH,
            MediaStore.MediaColumns.OWNER_PACKAGE_NAME, MediaStore.MediaColumns.IS_PENDING
        )
        val query = Bundle().apply {
            putInt(MediaStore.QUERY_ARG_MATCH_PENDING, MediaStore.MATCH_ONLY)
            putString(ContentResolver.QUERY_ARG_SQL_SELECTION,
                "${MediaStore.MediaColumns.RELATIVE_PATH} = ? AND " +
                "${MediaStore.MediaColumns.OWNER_PACKAGE_NAME} = ? AND " +
                "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ? AND " +
                "${MediaStore.MediaColumns.IS_PENDING} = ?")
            putStringArray(ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS,
                arrayOf(WivraExportStore.FOLDER, context.packageName, "${PREFIX}%", "1"))
        }
        val cursor = try { resolver.query(collection, projection, query, null) }
            catch (_: Exception) { null } ?: return 0
        var removed = 0
        cursor.use {
            val idColumn = it.getColumnIndex(MediaStore.MediaColumns._ID)
            val nameColumn = it.getColumnIndex(MediaStore.MediaColumns.DISPLAY_NAME)
            val mimeColumn = it.getColumnIndex(MediaStore.MediaColumns.MIME_TYPE)
            val folderColumn = it.getColumnIndex(MediaStore.MediaColumns.RELATIVE_PATH)
            val ownerColumn = it.getColumnIndex(MediaStore.MediaColumns.OWNER_PACKAGE_NAME)
            val pendingColumn = it.getColumnIndex(MediaStore.MediaColumns.IS_PENDING)
            if (idColumn < 0 || nameColumn < 0 || mimeColumn < 0 || folderColumn < 0 ||
                ownerColumn < 0 || pendingColumn < 0) return@use
            var inspected = 0
            while (it.moveToNext() && inspected < 250) {
                inspected++
                val name = it.getString(nameColumn)
                val mime = it.getString(mimeColumn)
                val folder = it.getString(folderColumn)
                val ownerPackage = it.getString(ownerColumn)
                val pending = it.getInt(pendingColumn)
                if (!isOwnedPendingV2MediaRow(name, mime, folder, ownerPackage,
                        pending, context.packageName)) continue
                val uri = ContentUris.withAppendedId(collection, it.getLong(idColumn))
                val deleted = try {
                    resolver.delete(uri,
                        "${MediaStore.MediaColumns.IS_PENDING} = ? AND " +
                        "${MediaStore.MediaColumns.RELATIVE_PATH} = ? AND " +
                        "${MediaStore.MediaColumns.OWNER_PACKAGE_NAME} = ? AND " +
                        "${MediaStore.MediaColumns.DISPLAY_NAME} = ? AND " +
                        "${MediaStore.MediaColumns.MIME_TYPE} = ?",
                        arrayOf("1", WivraExportStore.FOLDER, context.packageName, name, mime))
                } catch (_: Exception) { 0 }
                if (deleted == 1) removed++
            }
        }
        return removed
    }

    /** Only stale, incomplete Wivra v2 temp files, never finalized private videos. */
    fun cleanupOrphanPartials(context: Context): Int {
        var count = cleanupOrphanPendingMediaRows(context)
        if (active.isNotEmpty()) return count
        val dir = directory(context)
        for (file in dir.listFiles().orEmpty()) {
            if (file.isFile && file.name.startsWith(PREFIX) && file.name.endsWith(".partial")) {
                if (file.delete()) count++
            }
        }
        return count
    }
}
