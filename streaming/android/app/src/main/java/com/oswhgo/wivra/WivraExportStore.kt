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

    data class Saved(val uri: Uri, val displayName: String, val bytes: Long, val crc32: Long, val mime: String)

    private class Active(
        val session: WivraProgressiveExportSession,
        val uri: Uri,
        val descriptor: ParcelFileDescriptor,
        val displayName: String,
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
        // Unique name: MediaStore would silently rename a duplicate and the editor would show the wrong one.
        val displayName = PREFIX + System.currentTimeMillis() + "_" + Integer.toHexString(token) + "." +
            WivraProgressiveExportSession.extensionFor(cleanMime)
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
            active[token] = Active(session, uri, descriptor, displayName, SPACE_CHECK_BYTES)
            return token to displayName
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
    fun finish(context: Context, token: Int, bytes: Long, crc32: Long, chunks: Int): Saved {
        val item = active.remove(token) ?: throw IOException("Sesión de exportación desconocida.")
        val resolver = context.contentResolver
        try {
            item.session.finish(bytes, crc32, chunks)
            item.descriptor.close()
            // Prove what is actually on storage, not what we believe we wrote.
            val (diskBytes, diskCrc) = WivraProgressiveExportSession.measure(
                resolver.openInputStream(item.uri) ?: throw IOException("No se pudo releer el archivo."))
            if (diskBytes != bytes || diskCrc != (crc32 and 0xFFFFFFFFL))
                throw WivraProgressiveExportSession.IntegrityException("El archivo releído del disco no coincide con lo grabado.")
            val visible = ContentValues().apply { put(MediaStore.Video.Media.IS_PENDING, 0) }
            if (resolver.update(item.uri, visible, null, null) != 1)
                throw IOException("No se pudo publicar el video en la galería.")
            val result = Saved(item.uri, item.displayName, diskBytes, diskCrc, item.session.mime)
            saved[token] = result
            return result
        } catch (error: Exception) {
            item.session.abort()
            try { item.descriptor.close() } catch (_: IOException) { }
            // Never let a failed cleanup hide the original integrity/storage error.
            try { resolver.delete(item.uri, null, null) } catch (_: Exception) { }
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
