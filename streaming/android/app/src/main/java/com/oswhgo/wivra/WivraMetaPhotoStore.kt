package com.oswhgo.wivra

import android.content.ContentValues
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import com.meta.wearable.dat.camera.types.PhotoData
import java.io.IOException
import java.io.OutputStream
import java.nio.ByteBuffer

/**
 * Store an explicitly user-requested, stable DAT in-stream photo in the
 * Android MediaStore Pictures/Wivra collection. The WebView can then import
 * the same content:// URI through its existing image-capable file chooser.
 *
 * No second editor, no copying into JS, no network or cloud dependency.
 * Original HEIC bytes are preserved when DAT supplies HEIC. Decoded bitmaps
 * are encoded once as JPEG. Saving does not need READ_MEDIA_IMAGES on API 31+.
 */
object WivraMetaPhotoStore {
    private const val PHOTO_DIRECTORY = "Pictures/Wivra/"
    private const val FILE_PREFIX = "Wivra_RayBan_"
    private const val MAX_HEIC_BYTES = 40 * 1024 * 1024
    private const val MAX_BITMAP_PIXELS = 50_000_000L

    fun save(context: Context, photo: PhotoData): Uri = when (photo) {
        is PhotoData.Bitmap -> saveBitmap(context, photo.bitmap)
        is PhotoData.HEIC -> saveHeic(context, photo.data)
    }

    internal fun saveBitmap(context: Context, bitmap: Bitmap): Uri {
        val pixels = bitmap.width.toLong() * bitmap.height.toLong()
        require(pixels in 1..MAX_BITMAP_PIXELS) { "Invalid photo dimensions" }
        return writePhoto(context, "image/jpeg", "jpg") { output ->
            if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 92, output)) {
                throw IOException("JPEG encoder failed")
            }
        }
    }

    internal fun saveHeic(context: Context, data: ByteBuffer): Uri {
        val buffer = data.asReadOnlyBuffer()
        buffer.rewind()
        require(buffer.remaining() in 1..MAX_HEIC_BYTES) { "HEIC buffer exceeds safety limit" }
        return writePhoto(context, "image/heic", "heic") { output ->
            val chunk = ByteArray(64 * 1024)
            while (buffer.hasRemaining()) {
                val count = minOf(buffer.remaining(), chunk.size)
                buffer.get(chunk, 0, count)
                output.write(chunk, 0, count)
            }
        }
    }

    private inline fun writePhoto(
        context: Context, mime: String, ext: String,
        writer: (OutputStream) -> Unit
    ): Uri {
        val resolver = context.contentResolver
        val title = FILE_PREFIX + System.currentTimeMillis() + "." + ext
        val entry = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, title)
            put(MediaStore.Images.Media.MIME_TYPE, mime)
            put(MediaStore.Images.Media.RELATIVE_PATH, PHOTO_DIRECTORY)
            put(MediaStore.Images.Media.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, entry)
            ?: throw IOException("MediaStore refused to create photo")
        try {
            resolver.openOutputStream(uri, "w")?.use(writer)
                ?: throw IOException("MediaStore refused to write photo")
            val published = ContentValues().apply {
                put(MediaStore.Images.Media.IS_PENDING, 0)
            }
            if (resolver.update(uri, published, null, null) != 1) {
                throw IOException("MediaStore failed to publish photo")
            }
            return uri
        } catch (e: Exception) {
            // Do not leave an invisible partial image when the write failed.
            resolver.delete(uri, null, null)
            throw e
        }
    }

    /**
     * Only Wivra-owned captures in the dedicated local folder are offered to
     * the editor. Existing personal pictures are never enumerated or exposed.
     */
    @JvmStatic
    fun latestCapturedPhoto(context: Context): Uri? {
        val projection = arrayOf(MediaStore.Images.Media._ID)
        val predicate = "${MediaStore.Images.Media.RELATIVE_PATH} = ? AND " +
            "${MediaStore.Images.Media.DISPLAY_NAME} LIKE ? AND " +
            "${MediaStore.Images.Media.IS_PENDING} = 0"
        val args = arrayOf(PHOTO_DIRECTORY, "$FILE_PREFIX%")
        return try {
            context.contentResolver.query(
                MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                projection, predicate, args,
                "${MediaStore.Images.Media.DATE_ADDED} DESC, ${MediaStore.Images.Media._ID} DESC"
            )?.use { cursor ->
                if (!cursor.moveToFirst()) null
                else {
                    val id = cursor.getLong(0)
                    android.content.ContentUris.withAppendedId(
                        MediaStore.Images.Media.EXTERNAL_CONTENT_URI, id)
                }
            }
        } catch (_: SecurityException) {
            // Newer OS/enterprise policies may restrict image access.
            null
        }
    }
}
