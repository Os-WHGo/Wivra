package com.oswhgo.wivra

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.provider.MediaStore

/**
 * Only previously PUBLISHED, nonempty, app-owned Ray-Ban MP4 files may be
 * offered directly to the one Wivra editor via the Android file chooser.
 *
 * The private "Decidir después" files are deliberately excluded: these are
 * never in MediaStore and must not appear before the user's Save decision.
 * No READ_MEDIA_VIDEO, storage-wide scan, network request or file:// URI.
 */
object WivraSavedRayBanVideos {
    private const val CAPTURE_FOLDER = "Movies/Wivra/"
    private const val NAME_PREFIX = "Wivra_RayBan_"
    private const val MAX_RESULTS = 12

    data class SavedVideo(val uri: Uri, val title: String)

    @JvmStatic
    fun latestSaved(context: Context): List<SavedVideo> {
        val columns = arrayOf(
            MediaStore.Video.Media._ID,
            MediaStore.Video.Media.DISPLAY_NAME
        )
        val predicate =
            "${MediaStore.Video.Media.RELATIVE_PATH} = ? AND " +
            "${MediaStore.Video.Media.DISPLAY_NAME} LIKE ? AND " +
            "${MediaStore.Video.Media.MIME_TYPE} = ? AND " +
            "${MediaStore.Video.Media.IS_PENDING} = 0 AND " +
            "${MediaStore.Video.Media.SIZE} > 0 AND " +
            "${MediaStore.MediaColumns.OWNER_PACKAGE_NAME} = ?"
        val args = arrayOf(
            CAPTURE_FOLDER,
            "$NAME_PREFIX%",
            "video/mp4",
            context.packageName
        )
        val found = mutableListOf<SavedVideo>()
        return try {
            context.contentResolver.query(
                MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                columns,
                predicate,
                args,
                "${MediaStore.Video.Media.DATE_ADDED} DESC, " +
                    "${MediaStore.Video.Media._ID} DESC"
            )?.use { cursor ->
                val idColumn = cursor.getColumnIndexOrThrow(MediaStore.Video.Media._ID)
                val nameColumn = cursor.getColumnIndexOrThrow(
                    MediaStore.Video.Media.DISPLAY_NAME
                )
                while (cursor.moveToNext() && found.size < MAX_RESULTS) {
                    val title = cursor.getString(nameColumn) ?: continue
                    // Defense in depth if MediaStore provider ignores filtering.
                    if (!title.startsWith(NAME_PREFIX) || !title.endsWith(".mp4", true)) {
                        continue
                    }
                    val uri = ContentUris.withAppendedId(
                        MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                        cursor.getLong(idColumn)
                    )
                    found.add(SavedVideo(uri, title.take(90)))
                }
            }
            found
        } catch (_: SecurityException) {
            emptyList()
        } catch (_: IllegalArgumentException) {
            emptyList()
        }
    }
}
