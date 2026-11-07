package com.oswhgo.wivra

import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor

/**
 * Ray-Ban «solo vídeo» + independent microphone: pure timing and input rules (no Android classes, JVM-tested
 * against streaming/contracts/rayban-audio-sync.json). — Claude
 *
 * Everything is measured on ONE monotonic phone clock (SystemClock.elapsedRealtimeNanos):
 * - video: arrival time of every HEVC sample of a part, together with its DAT presentation time. The part's
 *   start is anchored at min(arrival − pts) + firstPts, the least-delayed sample, so one late Bluetooth packet
 *   cannot shift the whole part. If DAT pts regress inside a part, the first arrival is used instead.
 * - audio: read-completion times of AudioRecord, the first sample estimated as first read − first chunk length.
 * The glasses' own link latency is NOT known to Wivra: it is reported as unmeasured, never invented.
 */
object WivraRayBanSync {
    const val SAMPLE_RATE = 48_000
    /** Drift is only corrected after this much audio: below it, read jitter is larger than real clock drift. */
    const val DRIFT_MIN_SECONDS = 300.0
    /** A measured audio clock further than this from nominal is treated as a measurement problem, not drift. */
    const val DRIFT_MAX_PPM = 2_000.0

    class PartClock {
        var firstArrivalNs = -1L; private set
        var firstPtsUs = -1L; private set
        var lastPtsUs = -1L; private set
        var samples = 0; private set
        var ptsMonotonic = true; private set
        private var minDeltaNs = Long.MAX_VALUE

        fun observe(arrivalNs: Long, ptsUs: Long) {
            if (arrivalNs <= 0L || ptsUs < 0L) return
            if (samples == 0) { firstArrivalNs = arrivalNs; firstPtsUs = ptsUs }
            else if (ptsUs < lastPtsUs) ptsMonotonic = false
            lastPtsUs = ptsUs
            samples++
            val delta = arrivalNs - ptsUs * 1_000L
            if (delta < minDeltaNs) minDeltaNs = delta
        }

        /** Monotonic phone time of the part's first sample, or -1 when nothing arrived. */
        val startNs: Long get() = when {
            samples == 0 -> -1L
            ptsMonotonic -> minDeltaNs + firstPtsUs * 1_000L
            else -> firstArrivalNs
        }

        /** Span of DAT presentation times (the frame interval of the last sample is not added: unknown). */
        val durationUs: Long get() = if (samples > 1 && ptsMonotonic) lastPtsUs - firstPtsUs else 0L
    }

    data class AudioClock(
        val firstReadNs: Long,
        val firstChunkFrames: Long,
        val lastReadNs: Long,
        val totalFrames: Long,
        val sampleRate: Int = SAMPLE_RATE
    ) {
        val firstSampleNs: Long get() = firstReadNs - firstChunkFrames * 1_000_000_000L / sampleRate
        private val measuredSpanSeconds: Double get() = (lastReadNs - firstReadNs) / 1e9
        private val measuredRate: Double? get() {
            val frames = totalFrames - firstChunkFrames
            return if (firstReadNs > 0 && lastReadNs > firstReadNs && frames > 0) frames / measuredSpanSeconds else null
        }

        /** Measured clock difference in ppm after ≥ 10 s of audio, else null (too short to say anything). */
        val driftPpm: Double? get() = measuredRate?.takeIf { measuredSpanSeconds >= 10.0 }?.let { (it / sampleRate - 1.0) * 1e6 }

        val driftCorrected: Boolean get() {
            val ppm = driftPpm ?: return false
            return measuredSpanSeconds >= DRIFT_MIN_SECONDS && abs(ppm) <= DRIFT_MAX_PPM
        }

        /** Frames per second of the phone clock actually delivered by this microphone. */
        val effectiveRate: Double get() = if (driftCorrected) measuredRate!! else sampleRate.toDouble()
    }

    /**
     * The exact WAV frames that belong to one video part, plus the residual offset in seconds
     * (> 0: the audio slice starts after the part's first frame; < 0: before). No resampling: PCM is copied.
     */
    data class Slice(val startFrame: Long, val endFrame: Long, val offsetSeconds: Double)

    fun slice(audio: AudioClock, partStartNs: Long, partDurationUs: Long): Slice? {
        if (partStartNs <= 0L || audio.totalFrames <= 0L || audio.firstReadNs <= 0L) return null
        val rate = audio.effectiveRate
        val t0 = (partStartNs - audio.firstSampleNs) / 1e9
        val start = if (t0 <= 0) 0L else floor(t0 * rate + 0.5).toLong()
        if (start >= audio.totalFrames) return null
        val duration = if (partDurationUs > 0) partDurationUs / 1e6 else return null
        val end = minOf(audio.totalFrames, ceil((t0 + duration) * rate).toLong())
        if (end <= start) return null
        val sliceStartSeconds = start / rate
        return Slice(start, end, sliceStartSeconds - t0)
    }

    // ── Microphone choice: the glasses' own (HFP) microphone is never chosen by Wivra ──
    enum class Choice(val id: String) {
        OFF("off"), PHONE("phone"), WIRED_USB("usb"), BLUETOOTH("bluetooth");
        companion object {
            val DEFAULT = PHONE
            fun from(id: String?) = entries.firstOrNull { it.id == id }
        }
    }

    enum class Kind { BUILTIN, WIRED, USB, BLUETOOTH, OTHER }

    data class Input(val id: Int, val kind: Kind, val name: String?)

    private val glassesName = Regex("""ray[- ]?ban|\bmeta\b|oakley|glasses|gafas|lunettes|brille|occhiali|óculos|oculos""", RegexOption.IGNORE_CASE)

    fun looksLikeGlasses(name: String?): Boolean = name != null && glassesName.containsMatchIn(name)

    /**
     * Bluetooth inputs need a readable, non-glasses name (an unnamed Bluetooth microphone could be the
     * glasses). Wired/USB/built-in inputs are excluded only if their name says they are glasses.
     */
    fun eligible(input: Input, choice: Choice): Boolean = when (choice) {
        Choice.OFF -> false
        Choice.PHONE -> input.kind == Kind.BUILTIN && !looksLikeGlasses(input.name)
        Choice.WIRED_USB -> (input.kind == Kind.WIRED || input.kind == Kind.USB) && !looksLikeGlasses(input.name)
        Choice.BLUETOOTH -> input.kind == Kind.BLUETOOTH && !input.name.isNullOrBlank() && !looksLikeGlasses(input.name)
    }

    fun pick(inputs: List<Input>, choice: Choice): Input? = inputs.firstOrNull { eligible(it, choice) }

    /** Other choices that are connected right now, offered when the chosen one is missing or lost. */
    fun alternatives(inputs: List<Input>, missing: Choice): List<Choice> =
        listOf(Choice.PHONE, Choice.WIRED_USB, Choice.BLUETOOTH).filter { it != missing && pick(inputs, it) != null }

    /** Audio status recorded in the sync manifest: ready, partial (route lost midway; audio until then kept) or failed. */
    fun audioStatus(bytes: Long, error: String?): String = when {
        bytes <= 0L -> "failed"
        error == null -> "ready"
        error.startsWith("Could not finalize") -> "failed"
        else -> "partial"
    }
}
