package com.oswhgo.wivra

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.os.StatFs
import android.provider.MediaStore
import java.io.IOException
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap

/**
 * Progressive editor export straight into the gallery (Movies/Wivra), without
 * holding the whole video in memory and without a temporary second copy.
 *
 * The MediaStore row stays IS_PENDING (invisible to other apps and the gallery)
 * while chunks arrive. It becomes visible only after the editor's totals match,
 * the file is synced and a full re-read from disk reproduces the same CRC-32.
 * Every failure, cancel or app restart deletes the partial row. Calls must come
 * from ONE background thread per process (see WivraExportBridge). — Claude
 */
object WivraExportStore {
    const val FOLDER = "Movies/Wivra/"
    const val PREFIX = "Wivra_Export_"
    /** Never fill the phone completely: other apps and the OS need room. */
    const val MIN_FREE_BYTES = 200L * 1024 * 1024
    /** Re-check free space at most every this many written bytes. */
    private const val SPACE_CHECK_BYTES = 16L * 1024 * 1024

    class InsufficientStorageException(message: String) : IOException(message)

    /**
     * bytes/crc32 = the file the user gets; recordedBytes/recordedCrc32 = the verified recording.
     * They differ when the container was repaired (duration + seek index), which never re-encodes.
     */
    data class Saved(
        val uri: Uri, val displayName: String, val bytes: Long, val crc32: Long, val mime: String,
        val recordedBytes: Long = bytes, val recordedCrc32: Long = crc32,
        val media: WivraExportFinalizer.Media? = null, val repair: String = "none", val repairNote: String = "",
    )

    private class Active(
        val session: WivraProgressiveExportSession,
        val uri: Uri,
        val descriptor: ParcelFileDescriptor,
        val displayName: String,
        val finalName: String,
        var nextSpaceCheck: Long,
    )

    private val random = SecureRandom()
    private val active = ConcurrentHashMap<Int, Active>()
    private val saved = ConcurrentHashMap<Int, Saved>()

    @JvmStatic
    fun freeBytes(context: Context): Long {
        val dir = context.getExternalFilesDir(null) ?: context.filesDir
        return StatFs(dir.path).availableBytes
    }

    @JvmStatic
    fun begin(context: Context, mime: String?, estimatedBytes: Long): Pair<Int, String> {
        val free = freeBytes(context)
        val needed = maxOf(0L, estimatedBytes) + MIN_FREE_BYTES
        if (free < needed) throw InsufficientStorageException(
            "Espacio insuficiente: hay ${free / 1_000_000} MB libres y hacen falta unos ${needed / 1_000_000} MB.")
        val cleanMime = WivraProgressiveExportSession.normalizedMime(mime)
        var token: Int
        do { token = 1 + random.nextInt(Int.MAX_VALUE - 1) } while (active.containsKey(token) || saved.containsKey(token))
        // Unique names: MediaStore would silently rename a duplicate and the editor would show the wrong one.
        // The raw recording carries "_rec"; the repaired copy (or the raw one, renamed) gets the final name.
        val base = PREFIX + System.currentTimeMillis() + "_" + Integer.toHexString(token)
        val ext = "." + WivraProgressiveExportSession.extensionFor(cleanMime)
        val displayName = base + "_rec" + ext
        val finalName = base + ext
        val values = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, displayName)
            put(MediaStore.Video.Media.MIME_TYPE, cleanMime)
            put(MediaStore.Video.Media.RELATIVE_PATH, FOLDER)
            put(MediaStore.Video.Media.IS_PENDING, 1)
        }
        val resolver = context.contentResolver
        val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
            ?: throw IOException("No se pudo crear el archivo en la galería.")
        try {
            val descriptor = resolver.openFileDescriptor(uri, "w")
                ?: throw IOException("No se pudo abrir el archivo de la galería.")
            // Closing this stream also closes the descriptor, which lets MediaStore finalize the item.
            val stream = ParcelFileDescriptor.AutoCloseOutputStream(descriptor)
            val session = WivraProgressiveExportSession(token, cleanMime, stream, sync = { stream.fd.sync() })
            active[token] = Active(session, uri, descriptor, displayName, finalName, SPACE_CHECK_BYTES)
            return token to finalName
        } catch (error: Exception) {
            try { resolver.delete(uri, null, null) } catch (_: Exception) { }
            throw error
        }
    }

    @JvmStatic
    fun append(context: Context, token: Int, seq: Int, data: ByteArray, offset: Int, length: Int): Long {
        val item = active[token] ?: throw IOException("Sesión de exportación desconocida.")
        try {
            if (item.session.bytes >= item.nextSpaceCheck) {
                item.nextSpaceCheck = item.session.bytes + SPACE_CHECK_BYTES
                val free = freeBytes(context)
                if (free < MIN_FREE_BYTES / 2) throw InsufficientStorageException(
                    "El teléfono se quedó sin espacio (${free / 1_000_000} MB libres).")
            }
            return item.session.append(seq, data, offset, length)
        } catch (error: Exception) {
            abort(context, token)
            throw error
        }
    }

    @JvmStatic
    fun finish(context: Context, token: Int, bytes: Long, crc32: Long, chunks: Int, repair: Boolean = true): Saved {
        val item = active.remove(token) ?: throw IOException("Sesión de exportación desconocida.")
        val resolver = context.contentResolver
        val diskBytes: Long; val diskCrc: Long
        try {
            item.session.finish(bytes, crc32, chunks)
            item.descriptor.close()
            // Prove what is actually on storage, not what we believe we wrote.
            val measured = WivraProgressiveExportSession.measure(
                resolver.openInputStream(item.uri) ?: throw IOException("No se pudo releer el archivo."))
            diskBytes = measured.first; diskCrc = measured.second
            if (diskBytes != bytes || diskCrc != (crc32 and 0xFFFFFFFFL))
                throw WivraProgressiveExportSession.IntegrityException("El archivo releído del disco no coincide con lo grabado.")
        } catch (error: Exception) {
            item.session.abort()
            try { item.descriptor.close() } catch (_: IOException) { }
            // Never let a failed cleanup hide the original integrity/storage error.
            try { resolver.delete(item.uri, null, null) } catch (_: Exception) { }
            throw error
        }
        // The recording is verified. From here on it is only deleted once a repaired copy is
        // verified AND published; any repair failure publishes the verified recording instead.
        var repaired: Repaired? = null; var note = ""
        if (repair) {
            try { repaired = repairCopy(context, item, diskBytes) }
            catch (problem: Exception) { note = problem.message ?: problem.javaClass.simpleName }
        }
        val chosen = repaired
        if (chosen != null) {
            val ok = try { resolver.update(chosen.uri, ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }, null, null) == 1 } catch (_: Exception) { false }
            if (ok) {
                try { resolver.delete(item.uri, null, null) } catch (_: Exception) { }
            } else {
                note = "No se pudo publicar la copia reparada."
                try { resolver.delete(chosen.uri, null, null) } catch (_: Exception) { }
                repaired = null
            }
        }
        val done = repaired
        val result = if (done != null) {
            Saved(done.uri, done.displayName, done.bytes, diskCrc, item.session.mime, diskBytes, diskCrc,
                runCatching { WivraExportFinalizer.inspect(context, done.uri, item.session.mime) }.getOrNull(), done.method)
        } else {
            val visible = ContentValues().apply {
                put(MediaStore.Video.Media.IS_PENDING, 0)
                put(MediaStore.Video.Media.DISPLAY_NAME, item.finalName)
            }
            if (resolver.update(item.uri, visible, null, null) != 1) {
                try { resolver.delete(item.uri, null, null) } catch (_: Exception) { }
                throw IOException("No se pudo publicar el video en la galería.")
            }
            Saved(item.uri, item.finalName, diskBytes, diskCrc, item.session.mime, diskBytes, diskCrc,
                runCatching { WivraExportFinalizer.inspect(context, item.uri, item.session.mime) }.getOrNull(), "none", note)
        }
        saved[token] = result
        return result
    }

    private class Repaired(val uri: Uri, val displayName: String, val bytes: Long, val method: String)

    /** Writes a repaired (duration + seek index) copy as a NEW pending row and verifies it. */
    private fun repairCopy(context: Context, item: Active, recordedBytes: Long): Repaired {
        val free = freeBytes(context)
        if (free < recordedBytes + MIN_FREE_BYTES / 2) throw InsufficientStorageException(
            "Sin espacio para reparar la duración (${free / 1_000_000} MB libres); se guarda el original verificado.")
        val resolver = context.contentResolver
        val container = WivraExportFinalizer.containerOf(item.session.mime)
        val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME, item.finalName)
            put(MediaStore.Video.Media.MIME_TYPE, item.session.mime)
            put(MediaStore.Video.Media.RELATIVE_PATH, FOLDER)
            put(MediaStore.Video.Media.IS_PENDING, 1)
        }) ?: throw IOException("No se pudo crear la copia reparada.")
        try {
            val method: String
            val descriptor = resolver.openFileDescriptor(uri, "rw") ?: throw IOException("No se pudo abrir la copia reparada.")
            if (container == "webm") {
                val out = ParcelFileDescriptor.AutoCloseOutputStream(descriptor)
                val (result, sourceBlocks) = out.use { stream ->
                    val buffered = java.io.BufferedOutputStream(stream, 1024 * 1024)
                    val r = WivraExportFinalizer.rewriteWebm(context, item.uri, buffered)
                    buffered.flush(); stream.fd.sync(); r
                }
                // Proof: same audio/video blocks, plus Duration and Cues present in the new file.
                resolver.openFileDescriptor(uri, "r")?.use { pfd -> java.io.FileInputStream(pfd.fileDescriptor).channel.use { ch ->
                    val src = WivraExportFinalizer.FileChannelSource(ch)
                    val a = WivraWebmSeekable.analyze(src)
                    if (ch.size() != result.bytesWritten || !a.hasDuration || !a.hasCues ||
                        WivraWebmSeekable.blocksCrc(src, a) != sourceBlocks || sourceBlocks != result.blocksCrc32)
                        throw WivraProgressiveExportSession.IntegrityException("La copia reparada no coincide con la grabación.")
                } } ?: throw IOException("No se pudo releer la copia reparada.")
                method = "webm-cues"
            } else {
                descriptor.use { pfd -> WivraExportFinalizer.remuxMp4(context, item.uri, pfd); android.system.Os.fsync(pfd.fileDescriptor) }
                val original = WivraExportFinalizer.inspect(context, item.uri, item.session.mime)
                val copy = WivraExportFinalizer.inspect(context, uri, item.session.mime)
                if (!copy.video || copy.durationMs <= 0 || (original.audio && !copy.audio))
                    throw WivraProgressiveExportSession.IntegrityException("El MP4 reparado no tiene las mismas pistas.")
                method = "mp4-remux"
            }
            val size = resolver.openFileDescriptor(uri, "r")?.use { it.statSize } ?: -1L
            return Repaired(uri, item.finalName, size, method)
        } catch (error: Exception) {
            try { resolver.delete(uri, null, null) } catch (_: Exception) { }
            throw error
        }
    }

    /** Idempotent: closes and deletes the pending row. */
    @JvmStatic
    fun abort(context: Context, token: Int) {
        val item = active.remove(token) ?: return
        item.session.abort()
        try { item.descriptor.close() } catch (_: IOException) { }
        try { context.contentResolver.delete(item.uri, null, null) } catch (_: Exception) { }
    }

    @JvmStatic
    fun abortAll(context: Context) {
        for (token in active.keys.toList()) abort(context, token)
    }

    @JvmStatic
    fun savedExport(token: Int): Saved? = saved[token]

    @JvmStatic
    fun isActive(uri: Uri): Boolean = active.values.any { it.uri == uri }

    /**
     * Deletes Wivra-owned export rows still pending from a killed process. Only rows
     * with our prefix, folder and package; never a finished video or another app's file.
     */
    @JvmStatic
    fun cleanupOrphans(context: Context): Int {
        val resolver = context.contentResolver
        val collection = MediaStore.Video.Media.EXTERNAL_CONTENT_URI
        val args = Bundle().apply {
            putInt(MediaStore.QUERY_ARG_MATCH_PENDING, MediaStore.MATCH_ONLY)
            putString(android.content.ContentResolver.QUERY_ARG_SQL_SELECTION,
                "${MediaStore.MediaColumns.RELATIVE_PATH} = ? AND " +
                    "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ? AND " +
                    "${MediaStore.MediaColumns.OWNER_PACKAGE_NAME} = ?")
            putStringArray(android.content.ContentResolver.QUERY_ARG_SQL_SELECTION_ARGS,
                arrayOf(FOLDER, "$PREFIX%", context.packageName))
        }
        val orphans = mutableListOf<Uri>()
        try {
            resolver.query(collection, arrayOf(MediaStore.MediaColumns._ID), args, null)?.use { cursor ->
                val id = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
                while (cursor.moveToNext()) orphans += android.content.ContentUris.withAppendedId(collection, cursor.getLong(id))
            }
        } catch (_: SecurityException) {
            return 0
        }
        var deleted = 0
        for (uri in orphans) {
            if (isActive(uri)) continue
            try { deleted += resolver.delete(uri, null, null) } catch (_: Exception) { }
        }
        return deleted
    }
}
