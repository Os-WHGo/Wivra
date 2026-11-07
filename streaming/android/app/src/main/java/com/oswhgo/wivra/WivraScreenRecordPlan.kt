package com.oswhgo.wivra

import kotlin.math.max
import kotlin.math.min

/**
 * W99 (Claude, owner decision 2A): pure numbers for the local screen recording
 * (no Android types, so the JVM tests check them). The recording itself lives in
 * the full edition only (WivraScreenRecordService); nothing here sends anything.
 */
object WivraScreenRecordPlan {
    /** Encoder size in RootEncoder's convention: landscape values + rotation 90 = portrait video. */
    data class Size(val long: Int, val short: Int, val bitrate: Int)

    const val FPS = 30
    const val MAX_LONG = 1920
    const val MIN_BITRATE = 2_000_000
    const val MAX_BITRATE = 10_000_000
    const val AUDIO_BITRATE = 128_000
    /** Always leave this much free space for the phone itself. */
    const val RESERVE_BYTES = 300L * 1024 * 1024

    private fun down16(v: Double): Int = max(16, (v / 16).toInt() * 16)

    /** Keeps the screen's own shape, at most 1920 on the long side, sides multiple of 16. */
    fun forScreen(widthPx: Int, heightPx: Int): Size {
        require(widthPx > 0 && heightPx > 0) { "screen size" }
        val long = max(widthPx, heightPx).toDouble()
        val short = min(widthPx, heightPx).toDouble()
        val scale = min(1.0, MAX_LONG / long)
        val l = down16(long * scale)
        val s = down16(short * scale)
        // About 0.13 bits per pixel at 30 fps: ~6.5 Mbps for 1920×864, ~2.9 Mbps for 1280×576.
        val bitrate = (l.toDouble() * s * FPS * 0.13).toLong()
            .coerceIn(MIN_BITRATE.toLong(), MAX_BITRATE.toLong()).toInt()
        return Size(l, s, bitrate)
    }

    /** Bytes per minute of the finished MP4 (video + optional microphone). */
    fun bytesPerMinute(size: Size, withMic: Boolean): Long =
        (size.bitrate.toLong() + if (withMic) AUDIO_BITRATE else 0) * 60 / 8

    /** Stop (and keep what was recorded) when less than the reserve + one more minute is free. */
    fun mustStopForSpace(freeBytes: Long, size: Size, withMic: Boolean): Boolean =
        freeBytes < RESERVE_BYTES + bytesPerMinute(size, withMic)

    /** Whole minutes that still fit, for the confirmation dialog (never negative). */
    fun minutesThatFit(freeBytes: Long, size: Size, withMic: Boolean): Long =
        max(0L, (freeBytes - RESERVE_BYTES) / bytesPerMinute(size, withMic))

    fun clock(elapsedMs: Long): String {
        val s = max(0L, elapsedMs) / 1000
        return if (s >= 3600) "%d:%02d:%02d".format(s / 3600, s / 60 % 60, s % 60)
        else "%02d:%02d".format(s / 60, s % 60)
    }
}
