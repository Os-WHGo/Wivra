package com.oswhgo.wivra

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import android.provider.OpenableColumns
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentHashMap

/**
 * W98 (Claude). Automatic subtitles for long videos: the editor asks for the sound of ONE short piece
 * (≤ 35 s) of a file the person chose for it, already as 16 kHz mono 16-bit PCM, so the whole sound is
 * never in memory. Only files handed to the editor through its file chooser are readable here (by name
 * and size); never an arbitrary path. Nothing is written or sent anywhere.
 */
object WivraAudioSegments {
    const val RATE = 16_000
    const val MAX_SECONDS = 35.0
    private val granted = ConcurrentHashMap<String, Uri>()

    private fun key(name: String, size: Long) = "$size|$name"

    /** Remember the files the person gave the editor (called from the file chooser result). */
    fun remember(context: Context, uris: Array<Uri>?) {
        for (uri in uris ?: return) {
            try {
                context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { c ->
                    if (c.moveToFirst() && !c.isNull(0) && !c.isNull(1)) granted[key(c.getString(0), c.getLong(1))] = uri
                }
            } catch (_: Exception) { /* not readable: the editor falls back to its own path */ }
        }
    }

    fun lookup(name: String, size: Long): Uri? = granted[key(name, size)]

    /** Pure: interleaved 16-bit samples at any rate/channels → 16 kHz mono 16-bit (box average). */
    fun toMono16k(interleaved: ShortArray, channels: Int, rate: Int): ShortArray {
        if (channels <= 0 || rate <= 0 || interleaved.isEmpty()) return ShortArray(0)
        val frames = interleaved.size / channels
        val mono = FloatArray(frames) { f -> var s = 0f; for (c in 0 until channels) s += interleaved[f * channels + c]; s / channels }
        val n = (frames.toLong() * RATE / rate).toInt()
        val ratio = rate.toDouble() / RATE
        return ShortArray(n) { i ->
            val a = (i * ratio).toInt(); val b = maxOf(a + 1, ((i + 1) * ratio).toInt()).coerceAtMost(frames)
            var s = 0f; for (j in a until b) s += mono[j]
            (s / maxOf(1, b - a)).toInt().coerceIn(-32768, 32767).toShort()
        }
    }

    /** W104: bytes per sample of a decoder output encoding (0 = not supported). */
    fun bytesPerSample(encoding: Int): Int = when (encoding) {
        AudioFormat.ENCODING_PCM_16BIT -> 2
        AudioFormat.ENCODING_PCM_FLOAT, AudioFormat.ENCODING_PCM_32BIT -> 4
        AudioFormat.ENCODING_PCM_8BIT -> 1
        AudioFormat.ENCODING_PCM_24BIT_PACKED -> 3
        else -> 0
    }

    /**
     * W104 (pure): decoder output bytes (little-endian) → 16-bit samples. Some phones decode to float
     * or other widths instead of 16-bit; reading those as 16-bit would turn the voice into noise.
     */
    fun pcmToShorts(raw: ByteArray, encoding: Int): ShortArray {
        val bps = bytesPerSample(encoding)
        require(bps > 0) { "encoding" }
        val n = raw.size / bps
        val b = java.nio.ByteBuffer.wrap(raw).order(ByteOrder.LITTLE_ENDIAN)
        return ShortArray(n) { i ->
            val at = i * bps
            when (encoding) {
                AudioFormat.ENCODING_PCM_16BIT -> b.getShort(at)
                AudioFormat.ENCODING_PCM_FLOAT -> {
                    val f = b.getFloat(at)
                    if (f.isNaN()) 0.toShort() else (f.coerceIn(-1f, 1f) * 32767f).toInt().toShort()
                }
                AudioFormat.ENCODING_PCM_32BIT -> (b.getInt(at) shr 16).toShort()
                AudioFormat.ENCODING_PCM_8BIT -> (((raw[at].toInt() and 0xFF) - 128) shl 8).toShort()
                else -> {      // 24-bit packed: keep the two most significant bytes
                    ((raw[at + 2].toInt() shl 8) or (raw[at + 1].toInt() and 0xFF)).toShort()
                }
            }
        }
    }

    private fun encodingOf(format: MediaFormat): Int =
        if (format.containsKey(MediaFormat.KEY_PCM_ENCODING)) format.getInteger(MediaFormat.KEY_PCM_ENCODING)
        else AudioFormat.ENCODING_PCM_16BIT      // the documented default of MediaCodec audio decoders

    /** Sound of [fromS, toS) of the file as 16 kHz mono PCM. Throws if the piece is too long or unreadable. */
    fun extract(context: Context, uri: Uri, fromS: Double, toS: Double): ShortArray {
        require(fromS >= 0 && toS > fromS && toS - fromS <= MAX_SECONDS) { "piece" }
        val ex = MediaExtractor()
        try {
            ex.setDataSource(context, uri, null)
            val track = (0 until ex.trackCount).firstOrNull { ex.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true }
                ?: return ShortArray(((toS - fromS) * RATE).toInt())      // a video without sound: silence
            val fmt = ex.getTrackFormat(track)
            ex.selectTrack(track)
            val fromUs = (fromS * 1_000_000).toLong(); val toUs = (toS * 1_000_000).toLong()
            ex.seekTo(fromUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)
            val codec = MediaCodec.createDecoderByType(fmt.getString(MediaFormat.KEY_MIME)!!)
            val out = java.io.ByteArrayOutputStream()
            var channels = fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT); var rate = fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            var encoding = AudioFormat.ENCODING_PCM_16BIT
            try {
                codec.configure(fmt, null, null, 0); codec.start()
                val info = MediaCodec.BufferInfo(); var inputDone = false; var done = false
                while (!done) {
                    if (!inputDone) {
                        val i = codec.dequeueInputBuffer(10_000)
                        if (i >= 0) {
                            val n = ex.readSampleData(codec.getInputBuffer(i)!!, 0)
                            if (n < 0 || ex.sampleTime > toUs + 200_000) { codec.queueInputBuffer(i, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inputDone = true }
                            else { codec.queueInputBuffer(i, 0, n, ex.sampleTime, 0); ex.advance() }
                        }
                    }
                    val o = codec.dequeueOutputBuffer(info, 10_000)
                    if (o == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        val of = codec.outputFormat
                        channels = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT); rate = of.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                        encoding = encodingOf(of)
                        require(bytesPerSample(encoding) > 0) { "encoding" }      // reported as UNREADABLE, never as noise
                    } else if (o >= 0) {
                        val buf = codec.getOutputBuffer(o)!!
                        if (info.size > 0 && info.presentationTimeUs >= fromUs - 100_000 && info.presentationTimeUs < toUs) {
                            // keep only the samples inside [from, to)
                            val frameBytes = bytesPerSample(encoding) * channels
                            val skip = if (info.presentationTimeUs < fromUs) (((fromUs - info.presentationTimeUs) * rate / 1_000_000).toInt() * frameBytes).coerceAtMost(info.size) else 0
                            val bytes = ByteArray(info.size - skip); buf.position(info.offset + skip); buf.get(bytes); out.write(bytes)
                        }
                        codec.releaseOutputBuffer(o, false)
                        if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0 || info.presentationTimeUs >= toUs) done = true
                    }
                }
            } finally { runCatching { codec.stop() }; codec.release() }
            val shorts = pcmToShorts(out.toByteArray(), encoding)
            val mono = toMono16k(shorts, channels, rate); val want = ((toS - fromS) * RATE).toInt()
            return if (mono.size >= want) mono.copyOf(want) else mono.copyOf(want)      // exact length: silence-padded at the end
        } finally { ex.release() }
    }
}
