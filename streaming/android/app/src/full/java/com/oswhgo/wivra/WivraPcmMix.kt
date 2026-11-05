package com.oswhgo.wivra

/**
 * Pure 16-bit PCM helpers to put a video's own sound into the LIVE audio
 * (no Android imports, JVM-tested). The decoder thread converts the video's
 * audio to the LIVE format (mono or stereo, 44.1 kHz) and writes it into the
 * ring; the microphone thread pulls exactly as many samples as each
 * microphone buffer holds and adds them, so the video sound advances at the
 * real-time pace of the LIVE audio. — Claude
 */
object WivraPcmMix {
    /** Thread-safe bounded ring of 16-bit samples. */
    class Ring(val capacity: Int) {
        private val data = ShortArray(capacity)
        private var head = 0
        private var size = 0
        private val lock = Any()

        fun available(): Int = synchronized(lock) { size }
        fun free(): Int = synchronized(lock) { capacity - size }

        /** Writes what fits; returns how many samples were written. */
        fun write(src: ShortArray, offset: Int = 0, count: Int = src.size - offset): Int = synchronized(lock) {
            val n = minOf(count, capacity - size)
            for (i in 0 until n) data[(head + size + i) % capacity] = src[offset + i]
            size += n
            n
        }

        /** Reads up to `count` samples into dst; returns how many were read. */
        fun read(dst: ShortArray, count: Int): Int = synchronized(lock) {
            val n = minOf(count, size)
            for (i in 0 until n) dst[i] = data[(head + i) % capacity]
            head = (head + n) % capacity
            size -= n
            n
        }

        fun clear() = synchronized(lock) { head = 0; size = 0 }
    }

    /** Interleaved input with `inChannels` → interleaved output with `outChannels` (1 or 2). */
    fun remixChannels(input: ShortArray, frames: Int, inChannels: Int, outChannels: Int): ShortArray {
        require(inChannels >= 1 && outChannels in 1..2)
        val out = ShortArray(frames * outChannels)
        for (f in 0 until frames) {
            if (outChannels == 1) {
                var sum = 0
                for (c in 0 until inChannels) sum += input[f * inChannels + c]
                out[f] = (sum / inChannels).toShort()
            } else {
                val l = input[f * inChannels]
                val r = if (inChannels >= 2) input[f * inChannels + 1] else l
                out[f * 2] = l
                out[f * 2 + 1] = r
            }
        }
        return out
    }

    /**
     * Streaming linear resampler for interleaved 16-bit audio. Keeps the last
     * input frame between calls so chunk boundaries do not click.
     */
    class Resampler(private val inRate: Int, private val outRate: Int, private val channels: Int) {
        private var pos = 0.0          // position in input frames, relative to `prev`
        private var prev = ShortArray(channels)
        private var hasPrev = false

        init { require(inRate > 0 && outRate > 0 && channels in 1..2) }

        fun process(input: ShortArray, frames: Int): ShortArray {
            if (frames <= 0) return ShortArray(0)
            if (inRate == outRate) return input.copyOf(frames * channels)
            val step = inRate.toDouble() / outRate
            // Virtual stream = [prev] + input; index 0 is prev when available.
            val base = if (hasPrev) 1 else 0
            val total = frames + base
            val out = ArrayList<Short>((frames * outRate / inRate + 2) * channels)
            fun sample(frame: Int, c: Int): Int =
                if (hasPrev && frame == 0) prev[c].toInt() else input[(frame - base) * channels + c].toInt()
            while (pos + 1 < total) {
                val i = pos.toInt()
                val t = pos - i
                for (c in 0 until channels) {
                    val a = sample(i, c)
                    val b = sample(i + 1, c)
                    out.add((a + (b - a) * t).toInt().toShort())
                }
                pos += step
            }
            for (c in 0 until channels) prev[c] = input[(frames - 1) * channels + c]
            hasPrev = true
            pos -= (total - 1)
            return out.toShortArray()
        }
    }

    /**
     * Adds `extra` (gain applied) into little-endian 16-bit `pcm` in place,
     * clamping instead of wrapping. Missing samples (extra shorter) add silence.
     */
    fun mixInto(pcm: ByteArray, size: Int, extra: ShortArray, extraCount: Int, gain: Float): ByteArray {
        val samples = minOf(size / 2, extraCount)
        for (i in 0 until samples) {
            val lo = pcm[2 * i].toInt() and 0xFF
            val hi = pcm[2 * i + 1].toInt()
            val mic = (hi shl 8) or lo
            val mixed = (mic + extra[i] * gain).toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
            pcm[2 * i] = (mixed and 0xFF).toByte()
            pcm[2 * i + 1] = ((mixed shr 8) and 0xFF).toByte()
        }
        return pcm
    }
}
