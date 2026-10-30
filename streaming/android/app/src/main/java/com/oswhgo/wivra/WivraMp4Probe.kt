package com.oswhgo.wivra

import android.media.MediaCodecList
import android.media.MediaExtractor
import android.media.MediaFormat
import java.io.File
import java.io.FileInputStream

/**
 * Read-only inspection of a PRIVATE, finalized Ray-Ban MP4 checkpoint.
 * A recognized HEVC track is not proof of smooth playback or valid timestamps.
 * Never moves, deletes, publishes or transcodes the source.
 */
internal object WivraMp4Probe {
    data class Report(
        val hasHevcTrack: Boolean,
        val hasSample: Boolean,
        val decoderListed: Boolean,
        val durationUs: Long,
        val width: Int,
        val height: Int
    ) {
        val appearsReadable get() = hasHevcTrack && hasSample
    }

    fun inspect(file: File): Report {
        val invalid = Report(false, false, false, 0, 0, 0)
        if (!file.isFile || file.length() <= 0L) return invalid
        val extractor = MediaExtractor()
        return try {
            FileInputStream(file).use { input ->
                extractor.setDataSource(input.fd)
                var track = -1
                var format: MediaFormat? = null
                for (i in 0 until extractor.trackCount) {
                    val candidate = extractor.getTrackFormat(i)
                    if (candidate.getString(MediaFormat.KEY_MIME) ==
                        MediaFormat.MIMETYPE_VIDEO_HEVC) {
                        track = i
                        format = candidate
                        break
                    }
                }
                if (track < 0 || format == null) invalid else {
                    val video = format
                    extractor.selectTrack(track)
                    val firstSample = extractor.sampleTrackIndex == track &&
                        extractor.sampleTime >= 0L
                    val hasDecoder = runCatching {
                        MediaCodecList(MediaCodecList.REGULAR_CODECS)
                            .findDecoderForFormat(video) != null
                    }.getOrDefault(false)
                    Report(true, firstSample, hasDecoder,
                        if (video.containsKey(MediaFormat.KEY_DURATION))
                            video.getLong(MediaFormat.KEY_DURATION) else 0L,
                        if (video.containsKey(MediaFormat.KEY_WIDTH))
                            video.getInteger(MediaFormat.KEY_WIDTH) else 0,
                        if (video.containsKey(MediaFormat.KEY_HEIGHT))
                            video.getInteger(MediaFormat.KEY_HEIGHT) else 0)
                }
            }
        } catch (_: Exception) {
            invalid
        } finally {
            extractor.release()
        }
    }
}
