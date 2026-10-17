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
import java.nio.file.Files
import java.nio.file.AtomicMoveNotSupportedException
import java.nio.file.StandardCopyOption

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
        val wav = privateWav(context, privateVideo)
        val timing = File(directory(context), privateVideo.name.removeSuffix(".mp4") + ".wivra.json")
        val videoGone = !privateVideo.exists() || privateVideo.delete()
        val wavGone = !wav.exists() || wav.delete()
        val timingGone = !timing.exists() || timing.delete()
        return videoGone && wavGone && timingGone
    }


    /** Private WAV sidecar with the same stem as its Wivra-owned pending MP4. */
    fun privateWav(context: Context, video: File): File {
        require(isWivraPrivate(context, video)) { "Not a Wivra private video" }
        return File(directory(context), video.name.removeSuffix(".mp4") + ".wav")
    }

    /**
     * A valid RIFF prefix is NOT proof that the WAV capture succeeded.
     * In particular, AudioRecord may write seconds of sound and then lose the
     * explicitly chosen USB/Bluetooth route. Only a finalized matching timing
     * manifest (written on a successful recorder callback) can certify a pair.
     * This accepts version-2 sidecars created by the previous beta.
     */
    fun hasUsableWav(context: Context, video: File): Boolean {
        val wav = privateWav(context, video)
        val timing = File(directory(context), video.name.removeSuffix(".mp4") + ".wivra.json")
        if (!wav.isFile || !timing.isFile || wav.length() <= 44L) return false
        return try {
            val metadata = org.json.JSONObject(timing.readText())
            val dataBytes = wav.length() - 44L
            if (metadata.optInt("schemaVersion") < 2 ||
                metadata.optString("audioStatus", "ready") != "ready" ||
                metadata.optString("originalVideoFile") != video.name ||
                metadata.optString("originalAudioFile") != wav.name ||
                metadata.optString("audioFormat") != "pcm16-48000-mono-wav" ||
                metadata.optLong("audioBytes", -1L) != dataBytes ||
                metadata.optString("timebase") != "elapsedRealtimeNanos" ||
                dataBytes <= 0L || dataBytes > 2_000_000_000L ||
                dataBytes % 2L != 0L) return false

            java.io.RandomAccessFile(wav, "r").use { input ->
                val header = ByteArray(44)
                input.readFully(header)
                fun tag(at: Int, text: String) =
                    String(header, at, 4, Charsets.US_ASCII) == text
                fun u16(at: Int): Int =
                    (header[at].toInt() and 255) or
                        ((header[at + 1].toInt() and 255) shl 8)
                fun u32(at: Int): Long =
                    (0..3).fold(0L) { n, i ->
                        n or ((header[at + i].toLong() and 255L) shl (i * 8))
                    }
                tag(0, "RIFF") && tag(8, "WAVE") && tag(12, "fmt ") &&
                    tag(36, "data") && u32(4) == wav.length() - 8L &&
                    u32(16) == 16L && u16(20) == 1 && u16(22) == 1 &&
                    u32(24) == 48_000L && u32(28) == 96_000L &&
                    u16(32) == 2 && u16(34) == 16 && u32(40) == dataBytes
            }
        } catch (_: Exception) { false }
    }

    private fun insertPending(
        context: Context, collection: Uri, name: String,
        mime: String, folder: String, file: File
    ): Uri {
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, name)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, folder)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val resolver = context.contentResolver
        val uri = resolver.insert(collection, values)
            ?: throw IOException("Could not stage capture media")
        try {
            resolver.openOutputStream(uri, "w")?.use { output ->
                file.inputStream().use { input -> input.copyTo(output, 128 * 1024) }
            } ?: throw IOException("Could not write capture media")
            return uri
        } catch (error: Exception) {
            resolver.delete(uri, null, null)
            throw error
        }
    }

    data class SavedPair(val video: Uri, val audio: Uri)

    /**
     * Both assets stay IS_PENDING until their full contents have been copied.
     * On failure, roll back both gallery rows and retain both private originals.
     * MediaStore is NOT a transactional database; a process crash can leave
     * pending items for system cleanup. Never claim system-level atomicity.
     */
    fun publishPair(context: Context, video: File): SavedPair {
        require(isWivraPrivate(context, video)) { "Not an owned Wivra video" }
        require(video.isFile && video.length() > 0L) { "Empty pending video" }
        require(hasUsableWav(context, video)) { "No finalized WAV sidecar" }
        val wav = privateWav(context, video)
        val resolver = context.contentResolver
        val name = "Wivra_Phone_" + System.currentTimeMillis() + "_" + UUID.randomUUID()
        var videoUri: Uri? = null
        var audioUri: Uri? = null
        try {
            videoUri = insertPending(
                context, MediaStore.Video.Media.EXTERNAL_CONTENT_URI,
                "$name.mp4", "video/mp4", VIDEO_FOLDER, video
            )
            audioUri = insertPending(
                context, MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                "$name.wav", "audio/wav", "Music/Wivra/", wav
            )
            // Persist the actual pair identity BEFORE making either MediaStore
            // row public or deleting the private originals. A broken/missing
            // sidecar must never turn WAV+MP4 into two unlinked editor assets.
            val timingFile = File(directory(context),
                video.name.removeSuffix(".mp4") + ".wivra.json")
            require(timingFile.isFile && !Files.isSymbolicLink(timingFile.toPath())) {
                "Finalized WAV association not available"
            }
            val data = org.json.JSONObject(timingFile.readText())
            require(data.optString("originalVideoFile") == video.name &&
                data.optString("originalAudioFile") == wav.name &&
                data.optString("audioStatus") == "ready") {
                "WAV association no longer matches capture"
            }
            data.put("publishedVideoUri", videoUri.toString())
            data.put("publishedAudioUri", audioUri.toString())
            val tmp = Files.createTempFile(timingFile.parentFile.toPath(),
                "wivra-association-", ".tmp")
            try {
                Files.write(tmp, data.toString(2).toByteArray(Charsets.UTF_8))
                try {
                    Files.move(tmp, timingFile.toPath(),
                        StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING)
                } catch (_: AtomicMoveNotSupportedException) {
                    Files.move(tmp, timingFile.toPath(), StandardCopyOption.REPLACE_EXISTING)
                }
            } finally { Files.deleteIfExists(tmp) }
            val visible = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
            if (resolver.update(videoUri, visible, null, null) != 1 ||
                resolver.update(audioUri, visible, null, null) != 1) {
                throw IOException("Could not publish complete recording")
            }
            video.delete()
            wav.delete()
            return SavedPair(videoUri, audioUri)
        } catch (error: Exception) {
            audioUri?.let { resolver.delete(it, null, null) }
            videoUri?.let { resolver.delete(it, null, null) }
            throw error
        }
    }

    /** Only WAV files saved by Wivra itself, never scan the user's music. */
    @JvmStatic fun latestSavedWav(context: Context): List<SavedMedia> {
        val columns = arrayOf(MediaStore.Audio.Media._ID, MediaStore.Audio.Media.DISPLAY_NAME)
        val results = mutableListOf<SavedMedia>()
        val where = "${MediaStore.Audio.Media.RELATIVE_PATH} = ? AND " +
            "${MediaStore.Audio.Media.DISPLAY_NAME} LIKE ? AND " +
            "${MediaStore.Audio.Media.MIME_TYPE} = ? AND " +
            "${MediaStore.Audio.Media.IS_PENDING} = 0 AND " +
            "${MediaStore.Audio.Media.SIZE} > 44 AND " +
            "${MediaStore.MediaColumns.OWNER_PACKAGE_NAME} = ?"
        return try {
            context.contentResolver.query(
                MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, columns, where,
                arrayOf("Music/Wivra/", "$PUBLISHED_PREFIX%", "audio/wav", context.packageName),
                "${MediaStore.Audio.Media.DATE_ADDED} DESC"
            )?.use { cursor ->
                val id = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID)
                val name = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME)
                while (cursor.moveToNext() && results.size < MAX_RECENTS) {
                    val title = cursor.getString(name) ?: continue
                    if (title.startsWith(PUBLISHED_PREFIX) && title.endsWith(".wav", true)) {
                        results.add(SavedMedia(
                            ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI,
                                cursor.getLong(id)), title.take(96)
                        ))
                    }
                }
            }
            results
        } catch (_: SecurityException) { emptyList() }
          catch (_: IllegalArgumentException) { emptyList() }
    }

    /**
     * Approximate timing only; first read completion and CameraX Start
     * event do NOT mean first audio sample and first video frame timestamps.
     */
    fun saveSidecarTiming(
        context: Context, video: File, videoStartNs: Long, audioReadNs: Long,
        audioBytes: Long
    ) {
        require(isWivraPrivate(context, video)) { "Invalid video path" }
        val track = org.json.JSONObject().apply {
            put("schemaVersion", 2)
            put("cameraSource", "android-phone-camerax")
            put("originalVideoFile", video.name)
            put("originalAudioFile", privateWav(context, video).name)
            put("audioFormat", "pcm16-48000-mono-wav")
            put("audioStatus", "ready")
            put("audioBytes", audioBytes)
            put("audioDurationSeconds", audioBytes.toDouble() / 96_000.0)
            put("timebase", "elapsedRealtimeNanos")
            put("audioStartOffsetSeconds", if (videoStartNs > 0L && audioReadNs > 0L)
                (audioReadNs - videoStartNs) / 1_000_000_000.0
                else org.json.JSONObject.NULL)
            put("timestampPrecision", "approximate; CameraX Start and WAV read completion")
            put("muxedFromTrackIDs", org.json.JSONArray())
            put("tracks", org.json.JSONArray().put(org.json.JSONObject().apply {
                put("id", "audio-1")
                put("kind", "audio")
                put("role", "voice_primary")
                put("source", "android-phone-mic")
                put("file", privateWav(context, video).name)
                put("channelCount", 1)
                put("sampleRateHz", 48000)
            }))
        }
        val timing = File(directory(context), video.name.removeSuffix(".mp4") + ".wivra.json")
        val temp = File(directory(context), timing.name + ".tmp")
        try {
            temp.writeText(track.toString(2))
            if (!temp.renameTo(timing)) throw IOException("Could not persist audio timing")
        } finally { temp.delete() }
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
