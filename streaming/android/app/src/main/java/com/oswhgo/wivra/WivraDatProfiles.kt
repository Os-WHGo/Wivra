package com.oswhgo.wivra

import kotlin.math.ceil
import kotlin.math.max

/**
 * Ray-Ban Meta camera stream profiles (DAT 1.0.1), the same table on Android and iPhone
 * (streaming/contracts/dat-profiles.json, checked by tests on both). Sizes and frame rates are the SDK's
 * documented values; the SDK itself may lower resolution, then fps (never below 15), when the Bluetooth
 * Classic link is short of bandwidth. Meta: lower resolution/fps gives better quality per frame. — Claude
 */
enum class WivraDatProfile(val id: String, val width: Int, val height: Int, val fps: Int) {
    ECONOMY("economy", 360, 640, 15),
    BALANCED("balanced", 504, 896, 24),
    MOTION("motion", 504, 896, 30),
    DETAIL("detail", 720, 1280, 15),
    MAX("max", 720, 1280, 30);

    companion object {
        val DEFAULT = BALANCED
        const val AUTO = "auto"
        fun from(id: String?): WivraDatProfile? = entries.firstOrNull { it.id == id }
    }
}

/**
 * «Automático»: chooses the profile for the NEXT camera start from what the last session really delivered,
 * and only SUGGESTS a lower profile during a session (changing a DAT profile restarts the camera, so it is
 * never done silently and never while recording or live). Hysteresis: judged after ≥ 10 s (≥ 30 s to step
 * up), at most one suggestion per minute, never suggests going up, never goes to 720p by itself.
 */
object WivraDatAuto {
    private val LADDER = listOf(WivraDatProfile.ECONOMY, WivraDatProfile.BALANCED, WivraDatProfile.MOTION)

    data class Observed(
        val profile: WivraDatProfile, val seconds: Double, val measuredFps: Double,
        val stalls: Int, val receivedHeight: Int, val thermal: Boolean
    )

    private fun unhealthy(o: Observed): Boolean =
        o.measuredFps < 0.75 * o.profile.fps ||
            o.stalls * 60.0 / max(1.0, o.seconds) > 2.0 ||
            (o.receivedHeight in 1 until o.profile.height)

    private fun lower(p: WivraDatProfile): WivraDatProfile? = when (p) {
        WivraDatProfile.ECONOMY -> null
        WivraDatProfile.BALANCED -> WivraDatProfile.ECONOMY
        else -> WivraDatProfile.BALANCED
    }

    fun start(last: Observed?, thermalNow: Boolean): WivraDatProfile {
        if (thermalNow) return WivraDatProfile.ECONOMY
        if (last == null) return WivraDatProfile.DEFAULT
        val base = if (last.profile in LADDER) last.profile else WivraDatProfile.BALANCED
        if (last.seconds < 10) return base
        if (last.thermal || unhealthy(last)) return lower(last.profile) ?: WivraDatProfile.ECONOMY
        val healthy = last.seconds >= 30 && last.measuredFps >= 0.95 * last.profile.fps && last.stalls == 0 &&
            last.receivedHeight >= last.profile.height
        if (healthy && last.profile in LADDER) return LADDER[minOf(LADDER.size - 1, LADDER.indexOf(last.profile) + 1)]
        return base
    }

    fun suggest(window: Observed, secondsSinceLastSuggestion: Double): WivraDatProfile? {
        if (window.seconds < 10 || secondsSinceLastSuggestion < 60) return null
        if (window.thermal || unhealthy(window)) return lower(window.profile)
        return null
    }
}

/**
 * Privacy-respecting stream diagnostics: only arrival times, sizes and byte counts of frames are kept
 * (bounded: the last 600 intervals), never pictures. A stall is a gap above max(500 ms, 4 frame periods).
 */
class WivraDatStreamStats(private val nominalFps: Int) {
    data class Snapshot(
        val frames: Int, val seconds: Double, val fps: Double, val p95IntervalMs: Double,
        val maxGapMs: Long, val stalls: Int, val width: Int, val height: Int, val mbps: Double
    )

    private val intervals = ArrayDeque<Long>()
    private var first = -1L
    private var last = -1L
    private var frames = 0
    private var stalls = 0
    private var maxGap = 0L
    private var bytes = 0L
    var width = 0; private set
    var height = 0; private set

    @Synchronized
    fun frame(uptimeMs: Long, w: Int, h: Int, payloadBytes: Int) {
        if (first < 0) first = uptimeMs
        if (last >= 0) {
            val gap = uptimeMs - last
            intervals.addLast(gap)
            if (intervals.size > 600) intervals.removeFirst()
            if (gap > max(500L, (4000.0 / max(1, nominalFps)).toLong())) stalls++
            if (gap > maxGap) maxGap = gap
        }
        last = uptimeMs
        frames++
        bytes += max(0, payloadBytes)
        if (w > 0 && h > 0) { width = w; height = h }
    }

    @Synchronized
    fun snapshot(): Snapshot {
        val seconds = if (frames > 1) (last - first) / 1000.0 else 0.0
        val sorted = intervals.sorted()
        val p95 = if (sorted.isEmpty()) 0.0 else sorted[max(0, ceil(0.95 * sorted.size).toInt() - 1)].toDouble()
        return Snapshot(frames, seconds, if (seconds > 0) (frames - 1) / seconds else 0.0, p95, maxGap, stalls,
            width, height, if (seconds > 0) bytes * 8 / seconds / 1_000_000 else 0.0)
    }
}
