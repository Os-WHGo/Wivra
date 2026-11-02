package com.oswhgo.wivra

/**
 * Presents HEVC DAT samples on a strictly increasing MP4 timeline.
 *
 * Some glasses reset their source PTS after a cap-touch pause, and long
 * Bluetooth stalls can produce large forward jumps. Neither event should
 * collapse frames to 1 microsecond or create a multi-minute frozen picture.
 *
 * For normal frames, preserve the incoming duration. For discontinuities,
 * re-anchor at the latest observed frame cadence. Each independently playable
 * MP4 checkpoint starts with a new normalizer, so its timeline begins at 0.
 *
 * Pure Kotlin, no Android SDK clock or dependencies: deterministic unit tests.
 */
internal class WivraVideoPtsNormalizer(
    private val fallbackFrameDurationUs: Long = 41_667L,
    private val maxSourceGapUs: Long = 500_000L
) {
    init {
        require(fallbackFrameDurationUs in 1_000L..250_000L)
        require(maxSourceGapUs > fallbackFrameDurationUs)
    }

    private var previousSourceUs: Long? = null
    private var previousOutputUs: Long = -1L
    private var recentFrameDurationUs: Long = fallbackFrameDurationUs

    val lastPresentationUs: Long get() = previousOutputUs

    fun next(sourcePtsUs: Long): Long {
        require(sourcePtsUs >= 0L) { "DAT presentation time cannot be negative" }
        val previous = previousSourceUs
        if (previous == null) {
            previousSourceUs = sourcePtsUs
            previousOutputUs = 0L
            return 0L
        }

        val deltaUs = sourcePtsUs - previous
        // A 1-microsecond repeated timestamp is not an actual video frame
        // interval. Normal video cadence is generally 24-60 fps, but support
        // variable-rate sources without assuming 24 fps.
        val sourceStepValid = deltaUs in 1_000L..maxSourceGapUs
        val stepUs = if (sourceStepValid) deltaUs else recentFrameDurationUs

        // Only learn from plausible frame spacings, not a large buffer stall.
        if (deltaUs in 8_000L..100_000L) {
            recentFrameDurationUs = deltaUs
        }
        previousSourceUs = sourcePtsUs
        previousOutputUs = Math.addExact(previousOutputUs, stepUs)
        return previousOutputUs
    }
}
