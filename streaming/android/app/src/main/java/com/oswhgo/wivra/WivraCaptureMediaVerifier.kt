package com.oswhgo.wivra

import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import java.io.File
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.file.Files

/** Read-only native verifyFile implementation for completed private captures.
 * Walks the actual compressed samples and decodes both video boundaries. It is
 * deliberately separate from the cheap preview metadata probe. Run on IO, never UI.
 * Boundary decoding does not certify every frame, A/V sync or physical hardware.
 * — ChatGPT
 */
internal object WivraCaptureMediaVerifier {
    data class Report(val valid: Boolean, val samples: Long = 0, val durationUs: Long = 0, val reason: String = "")

    fun verifyFile(file: File, allowedRoot: File, requireHevc: Boolean = false): Report {
        val invalid = Report(false, reason = "file scope or properties")
        if (Files.isSymbolicLink(file.toPath()) || !file.isFile || file.length() <= 0 ||
            file.canonicalFile.parentFile != allowedRoot.canonicalFile) return invalid
        val size = file.length()
        val modified = file.lastModified()
        val extractor = MediaExtractor()
        val decoder = MediaMetadataRetriever()
        return try {
            FileInputStream(file).use { input ->
                extractor.setDataSource(input.fd)
                decoder.setDataSource(input.fd)
                var videoCount = 0
                var samples = 0L
                var durationUs = 0L
                var firstVideoPts = Long.MAX_VALUE
                var lastVideoPts = -1L
                var buffer = ByteBuffer.allocateDirect(1024 * 1024)
                for (track in 0 until extractor.trackCount) {
                    val format = extractor.getTrackFormat(track)
                    val mime = format.getString(MediaFormat.KEY_MIME) ?: return Report(false, reason = "missing track MIME")
                    if (!mime.startsWith("video/") && !mime.startsWith("audio/")) continue
                    if (mime.startsWith("video/")) {
                        if (requireHevc && mime != MediaFormat.MIMETYPE_VIDEO_HEVC) return Report(false, reason = "not HEVC")
                        videoCount++
                        if (format.containsKey(MediaFormat.KEY_DURATION))
                            durationUs = maxOf(durationUs, format.getLong(MediaFormat.KEY_DURATION))
                    }
                    extractor.selectTrack(track)
                    extractor.seekTo(0, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
                    var count = 0L
                    while (extractor.sampleTrackIndex >= 0) {
                        val bytes = extractor.sampleSize
                        if (bytes <= 0 || bytes > 16 * 1024 * 1024 || ++samples > 2_000_000 || Thread.currentThread().isInterrupted)
                            return Report(false, reason = "invalid or excessive sample payload: $bytes")
                        if (buffer.capacity() < bytes) buffer = ByteBuffer.allocateDirect(bytes.toInt())
                        buffer.clear()
                        if (extractor.readSampleData(buffer, 0).toLong() != bytes || extractor.sampleTime < 0)
                            return Report(false, reason = "unreadable sample or negative time")
                        if (mime.startsWith("video/")) {
                            firstVideoPts = minOf(firstVideoPts, extractor.sampleTime)
                            lastVideoPts = maxOf(lastVideoPts, extractor.sampleTime)
                        }
                        count++
                        if (!extractor.advance()) break
                    }
                    extractor.unselectTrack(track)
                    if (count == 0L) return Report(false, reason = "empty track $track")
                }
                // Some valid fragmented MP4s omit KEY_DURATION. Use the span
                // actually measured from video PTS, never a filename estimate.
                if (durationUs <= 0 && lastVideoPts > firstVideoPts) durationUs = lastVideoPts - firstVideoPts
                if (videoCount != 1 || durationUs <= 0) return Report(false, reason = "video tracks=$videoCount durationUs=$durationUs")
                for (time in longArrayOf(0, maxOf(0, durationUs - 1))) {
                    val image = decoder.getFrameAtTime(time, MediaMetadataRetriever.OPTION_CLOSEST)
                        ?: return Report(false, reason = "cannot decode boundary at $time us")
                    try { if (image.width <= 0 || image.height <= 0) return invalid }
                    finally { image.recycle() }
                }
                if (file.length() != size || file.lastModified() != modified) invalid
                else Report(true, samples, durationUs)
            }
        } catch (error: Exception) { Report(false, reason = "native ${error.javaClass.simpleName}") }
        finally {
            extractor.release()
            decoder.release()
        }
    }
}
