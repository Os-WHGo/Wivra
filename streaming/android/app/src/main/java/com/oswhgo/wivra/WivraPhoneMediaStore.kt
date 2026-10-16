package com.oswhgo.wivra

import android.content.ContentUris
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import java.io.File
import java.io.IOException
import java.util.UUID

/**
 * Private capture first; publication to the system gallery only after the
 * user chooses Keep. No permission to read the user's entire photo library.
 *
 * No attempt to present a half-written file as a successfully saved video.
 * Interrupted recordings may be incomplete but remain reviewable in private.
 */
object WivraPhoneMediaStore {
    private const val PENDING_DIR = "phone-pending"
    private const val PRIVATE_PREFIX = "pending-phone-"
    private const val PUBLISHED_PREFIX = "Wivra_Phone_"
    private const val VIDEO_FOLDER = "Movies/Wivra/"
    private const val PHOTO_FOLDER = "Pictures/Wivra/"
    private const val MAX_RECENTS = 12

    data class SavedMedia(val uri: Uri, val title: String)

    private fun directory(context: Context): File {
        val dir = File(context.filesDir, PENDING_DIR)
        if (!dir.isDirectory && !dir.mkdirs()) throw IOException("Cannot prepare private capture")
        return dir
    }

    fun createPrivateVideo(context: Context): File {
        val file = File(
            directory(context), PRIVATE_PREFIX +
                System.currentTimeMillis() + "-" + UUID.randomUUID().toString() + ".mp4"
        )
        if (!file.createNewFile()) throw IOException("Cannot create pending video")
        return file
    }

    private fun isWivraPrivate(context: Context, file: File): Boolean {
        val folder = directory(context).canonicalFile
        return file.canonicalFile.parentFile == folder &&
            file.name.startsWith(PRIVATE_PREFIX) && file.name.endsWith(".mp4")
    }

    fun pendingVideos(context: Context): List<File> =
        directory(context).listFiles()
            ?.filter { it.isFile && isWivraPrivate(context, it) && it.length() > 0L }
            ?.sortedByDescending { it.lastModified() }
            ?.take(30) ?: emptyList()

    /** Atomic-ish MediaStore publishing: hidden until copy fully closes. */
    fun publish(context: Context, privateVideo: File): Uri {
        require(isWivraPrivate(context, privateVideo)) { "Not a Wivra-owned pending video" }
        if (!privateVideo.isFile || privateVideo.length() == 0L)
            throw IOException("No valid pending MP4 data")
        val resolver = context.contentResolver
        val values = ContentValues().apply {
            put(MediaStore.Video.Media.DISPLAY_NAME,
                PUBLISHED_PREFIX + System.currentTimeMillis() + "_" + UUID.randomUUID() + ".mp4")
            put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
            put(MediaStore.Video.Media.RELATIVE_PATH, VIDEO_FOLDER)
            put(MediaStore.Video.Media.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, values)
            ?: throw IOException("Cannot prepare media collection")
        try {
            resolver.openOutputStream(uri, "w")?.use { output ->
                privateVideo.inputStream().use { input -> input.copyTo(output, 128 * 1024) }
            } ?: throw IOException("Cannot write media collection")
            val complete = ContentValues().apply {
                put(MediaStore.Video.Media.IS_PENDING, 0)
            }
            if (resolver.update(uri, complete, null, null) != 1)
                throw IOException("Could not publish completed video")
            // A failed private cleanup never undoes a successfully published file.
            privateVideo.delete()
            return uri
        } catch (error: Exception) {
            resolver.delete(uri, null, null)
            // Never delete the private original on a partial/failed copy.
            throw error
        }
    }

    fun discard(context: Context, privateVideo: File): Boolean {
        require(isWivraPrivate(context, privateVideo)) { "Not a Wivra-owned pending video" }
        return !privateVideo.exists() || privateVideo.delete()
    }

    fun videoCaptureValues(): ContentValues = ContentValues().apply {
        put(MediaStore.Video.Media.DISPLAY_NAME,
            PUBLISHED_PREFIX + System.currentTimeMillis() + ".mp4")
        put(MediaStore.Video.Media.MIME_TYPE, "video/mp4")
        put(MediaStore.Video.Media.RELATIVE_PATH, VIDEO_FOLDER)
    }

    fun photoCaptureValues(): ContentValues = ContentValues().apply {
        put(MediaStore.Images.Media.DISPLAY_NAME,
            PUBLISHED_PREFIX + System.currentTimeMillis() + "_" + UUID.randomUUID() + ".jpg")
        put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg")
        put(MediaStore.Images.Media.RELATIVE_PATH, PHOTO_FOLDER)
    }

    private fun latest(context: Context, video: Boolean): List<SavedMedia> {
        val collection = if (video) MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            else MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        val columns = arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME)
        val predicate = "${MediaStore.MediaColumns.RELATIVE_PATH} = ? AND " +
            "${MediaStore.MediaColumns.DISPLAY_NAME} LIKE ? AND " +
            "${MediaStore.MediaColumns.IS_PENDING} = 0 AND " +
            "${MediaStore.MediaColumns.SIZE} > 0 AND " +
            "${MediaStore.MediaColumns.OWNER_PACKAGE_NAME} = ?"
        val arguments = arrayOf(
            if (video) VIDEO_FOLDER else PHOTO_FOLDER,
            "$PUBLISHED_PREFIX%", context.packageName
        )
        val results = mutableListOf<SavedMedia>()
        return try {
            context.contentResolver.query(
                collection, columns, predicate, arguments,
                "${MediaStore.MediaColumns.DATE_ADDED} DESC, ${MediaStore.MediaColumns._ID} DESC"
            )?.use { cursor ->
                val idIndex = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
                val nameIndex = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
                while (cursor.moveToNext() && results.size < MAX_RECENTS) {
                    val name = cursor.getString(nameIndex) ?: continue
                    if (!name.startsWith(PUBLISHED_PREFIX) ||
                        !name.endsWith(if (video) ".mp4" else ".jpg", ignoreCase = true)) continue
                    results.add(SavedMedia(ContentUris.withAppendedId(
                        collection, cursor.getLong(idIndex)
                    ), name.take(96)))
                }
            }
            results
        } catch (_: SecurityException) {
            emptyList()
        } catch (_: IllegalArgumentException) {
            emptyList()
        }
    }

    @JvmStatic fun latestSavedVideos(context: Context): List<SavedMedia> = latest(context, true)
    @JvmStatic fun latestSavedPhotos(context: Context): List<SavedMedia> = latest(context, false)
}
