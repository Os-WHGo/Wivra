package com.oswhgo.wivra

import android.content.Context
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.media.MediaMetadataRetriever
import android.media.MediaMuxer
import android.net.Uri
import android.os.ParcelFileDescriptor
import java.io.FileInputStream
import java.io.IOException
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.channels.FileChannel

/**
 * Makes a verified MediaRecorder export playable like a normal video: real duration and
 * seeking in galleries. Never re-encodes. WebM → own header rewrite (WivraWebmSeekable);
 * fragmented MP4 → MediaExtractor/MediaMuxer remux into a regular MP4 (full moov).
 * The verified original is never deleted by this class; the caller decides which file to
 * publish only after [inspect] confirms the repaired one. — Claude
 */
object WivraExportFinalizer {
    data class Media(
        val container: String, val durationMs: Long, val video: Boolean, val audio: Boolean,
        val declaresDuration: Boolean, val seekIndex: Boolean,
    )

    class FileChannelSource(private val channel: FileChannel) : WivraWebmSeekable.Source {
        override val size: Long get() = channel.size()
        override fun readFully(position: Long, dst: ByteArray, off: Int, len: Int) {
            val buffer = ByteBuffer.wrap(dst, off, len); var p = position
            while (buffer.hasRemaining()) { val n = channel.read(buffer, p); if (n < 0) throw IOException("Fin de archivo inesperado."); p += n }
        }
    }

    fun containerOf(mime: String): String = if (WivraProgressiveExportSession.normalizedMime(mime) == "video/mp4") "mp4" else "webm"

    /** WebM rewrite from [source] into [out]; returns the copied-blocks CRC to compare with the source. */
    fun rewriteWebm(context: Context, source: Uri, out: OutputStream): Pair<WivraWebmSeekable.Result, Long> {
        val pfd = context.contentResolver.openFileDescriptor(source, "r") ?: throw IOException("No se pudo releer el video.")
        pfd.use { FileInputStream(it.fileDescriptor).channel.use { ch ->
            val src = FileChannelSource(ch)
            val before = WivraWebmSeekable.blocksCrc(src)
            return WivraWebmSeekable.rewrite(src, out) to before
        } }
    }

    /** Copies every audio/video sample of a (fragmented) MP4 into a regular MP4. Throws if a track is not supported. */
    fun remuxMp4(context: Context, source: Uri, target: ParcelFileDescriptor): Int {
        val extractor = MediaExtractor()
        var muxer: MediaMuxer? = null
        try {
            extractor.setDataSource(context, source, null)
            muxer = MediaMuxer(target.fileDescriptor, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
            val map = IntArray(extractor.trackCount) { -1 }; var maxInput = 1024 * 1024
            for (i in 0 until extractor.trackCount) {
                val format = extractor.getTrackFormat(i); val mime = format.getString(MediaFormat.KEY_MIME) ?: continue
                if (!mime.startsWith("video/") && !mime.startsWith("audio/")) continue
                map[i] = muxer.addTrack(format)   // throws for codecs MP4 cannot carry here (e.g. Opus on some versions)
                extractor.selectTrack(i)
                if (format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)) maxInput = maxOf(maxInput, format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE))
            }
            if (map.none { it >= 0 }) throw IOException("El MP4 no tiene pistas de audio ni video.")
            muxer.start()
            val buffer = ByteBuffer.allocate(maxInput); val info = MediaCodec.BufferInfo(); var samples = 0
            while (true) {
                val size = extractor.readSampleData(buffer, 0); if (size < 0) break
                val track = map[extractor.sampleTrackIndex]
                if (track >= 0) {
                    info.set(0, size, maxOf(0L, extractor.sampleTime),
                        if (extractor.sampleFlags and MediaExtractor.SAMPLE_FLAG_SYNC != 0) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0)
                    muxer.writeSampleData(track, buffer, info); samples++
                }
                extractor.advance()
            }
            muxer.stop()
            if (samples == 0) throw IOException("El MP4 no tenía muestras.")
            return samples
        } finally {
            try { muxer?.release() } catch (_: Exception) { }
            extractor.release()
        }
    }

    /** What a gallery player will see: duration and tracks, from the Android media framework itself. */
    fun inspect(context: Context, uri: Uri, mime: String): Media {
        val retriever = MediaMetadataRetriever()
        try {
            retriever.setDataSource(context, uri)
            val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0L
            val video = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO) == "yes"
            val audio = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO) == "yes"
            val container = containerOf(mime)
            var declares = duration > 0; var seek = container == "mp4"
            if (container == "webm") {
                context.contentResolver.openFileDescriptor(uri, "r")?.use { pfd -> FileInputStream(pfd.fileDescriptor).channel.use { ch ->
                    val a = WivraWebmSeekable.analyze(FileChannelSource(ch)); declares = a.hasDuration; seek = a.hasCues
                } }
            }
            return Media(container, duration, video, audio, declares, seek)
        } finally {
            try { retriever.release() } catch (_: Exception) { }
        }
    }
}
