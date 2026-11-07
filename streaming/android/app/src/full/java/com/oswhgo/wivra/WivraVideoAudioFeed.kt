package com.oswhgo.wivra

import android.content.Context
import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import android.net.Uri
import com.pedro.encoder.input.audio.CustomAudioEffect
import java.nio.ByteOrder

/**
 * Decodes the audio track of a local video (picked by the owner) into the
 * LIVE audio format, a little ahead of time, into a bounded ring. Nothing is
 * uploaded except through the RTMP stream itself. — Claude
 */
class WivraVideoAudioFeed(
    private val context: Context,
    private val uri: Uri,
    private val outRate: Int,
    private val outChannels: Int
) {
    val ring = WivraPcmMix.Ring(outRate * outChannels * 2) // at most ~2 s ahead
    @Volatile private var playing = false
    @Volatile private var stopped = false
    @Volatile var ended = false
        private set
    @Volatile var hasAudio = true
        private set
    private var thread: Thread? = null

    fun play() {
        if (stopped) return
        playing = true
        if (thread == null) {
            thread = Thread({ decodeLoop() }, "WivraVideoAudioFeed").apply { isDaemon = true; start() }
        }
    }

    fun pause() { playing = false }

    fun stop() {
        stopped = true
        playing = false
        thread?.interrupt()
        thread = null
        ring.clear()
    }

    private fun sleepQuietly(ms: Long): Boolean = try { Thread.sleep(ms); true } catch (_: InterruptedException) { false }

    private fun decodeLoop() {
        val extractor = MediaExtractor()
        var codec: MediaCodec? = null
        try {
            extractor.setDataSource(context, uri, null)
            val track = (0 until extractor.trackCount).firstOrNull {
                extractor.getTrackFormat(it).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
            }
            if (track == null) { hasAudio = false; return }
            extractor.selectTrack(track)
            val format = extractor.getTrackFormat(track)
            val decoder = MediaCodec.createDecoderByType(format.getString(MediaFormat.KEY_MIME)!!)
            codec = decoder
            decoder.configure(format, null, null, 0)
            decoder.start()
            var inRate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
            var inChannels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
            var floatPcm = false
            var resampler = WivraPcmMix.Resampler(inRate, outRate, outChannels)
            val info = MediaCodec.BufferInfo()
            var inputDone = false
            while (!stopped) {
                // Stay at most ~2 s ahead of what the LIVE has consumed.
                if (!playing || ring.free() < outRate * outChannels / 5) {
                    if (!sleepQuietly(10)) return
                    continue
                }
                if (!inputDone) {
                    val inIndex = decoder.dequeueInputBuffer(5_000)
                    if (inIndex >= 0) {
                        val buffer = decoder.getInputBuffer(inIndex)!!
                        val size = extractor.readSampleData(buffer, 0)
                        if (size < 0) {
                            decoder.queueInputBuffer(inIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
                            inputDone = true
                        } else {
                            decoder.queueInputBuffer(inIndex, 0, size, extractor.sampleTime, 0)
                            extractor.advance()
                        }
                    }
                }
                val outIndex = decoder.dequeueOutputBuffer(info, 5_000)
                if (outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    val out = decoder.outputFormat
                    inRate = out.getInteger(MediaFormat.KEY_SAMPLE_RATE)
                    inChannels = out.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
                    floatPcm = out.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
                        out.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT
                    resampler = WivraPcmMix.Resampler(inRate, outRate, outChannels)
                } else if (outIndex >= 0) {
                    val out = decoder.getOutputBuffer(outIndex)!!.order(ByteOrder.LITTLE_ENDIAN)
                    out.position(info.offset)
                    out.limit(info.offset + info.size)
                    val samples: ShortArray = if (floatPcm) {
                        val f = out.asFloatBuffer()
                        ShortArray(f.remaining()) { (f.get().coerceIn(-1f, 1f) * Short.MAX_VALUE).toInt().toShort() }
                    } else {
                        val s = out.asShortBuffer()
                        ShortArray(s.remaining()).also { s.get(it) }
                    }
                    decoder.releaseOutputBuffer(outIndex, false)
                    val frames = samples.size / inChannels
                    if (frames > 0) {
                        val remixed = WivraPcmMix.remixChannels(samples, frames, inChannels, outChannels)
                        val converted = resampler.process(remixed, frames)
                        var written = 0
                        while (written < converted.size && !stopped) {
                            written += ring.write(converted, written)
                            if (written < converted.size && !sleepQuietly(10)) return
                        }
                    }
                    if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) {
                        ended = true
                        return
                    }
                }
            }
        } catch (_: Exception) {
            hasAudio = false
        } finally {
            runCatching { codec?.stop() }
            runCatching { codec?.release() }
            runCatching { extractor.release() }
        }
    }
}

/**
 * Mixes the video sound into the LIVE microphone buffer (RootEncoder calls
 * process() on its microphone thread, after the microphone volume and only
 * when the microphone is not muted). — Claude
 */
class WivraSceneAudioEffect : CustomAudioEffect() {
    @Volatile var feed: WivraVideoAudioFeed? = null
    @Volatile var active = false
    @Volatile var gain = 1f
    private var scratch = ShortArray(4096)

    override fun process(pcmBuffer: ByteArray): ByteArray {
        val source = feed ?: return pcmBuffer
        if (!active || gain <= 0f) return pcmBuffer
        val need = pcmBuffer.size / 2
        if (scratch.size < need) scratch = ShortArray(need)
        val got = source.ring.read(scratch, need)
        return WivraPcmMix.mixInto(pcmBuffer, pcmBuffer.size, scratch, got, gain)
    }
}
