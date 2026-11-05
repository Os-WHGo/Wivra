package com.oswhgo.wivra

/**
 * Pure multicamera decisions for Android (no Android imports, JVM-testable).
 * Mirrors core/multicam-plan.mjs: same PiP numbers, same pair choice, same
 * "never delete bytes that may be playable" rule. Choosing a pair here is NOT
 * evidence that the phone can record two cameras; only a verified take is.
 * — Claude
 */
object WivraMulticamPolicy {
    enum class Facing { BACK, FRONT, EXTERNAL, UNKNOWN }

    enum class Corner { BOTTOM_RIGHT, BOTTOM_LEFT, TOP_LEFT, TOP_RIGHT;
        fun next(): Corner = values()[(ordinal + 1) % values().size]
    }

    data class CameraEntry(val id: String, val facing: Facing)

    /** Normalized frame rectangle, origin top-left, 0..1. */
    data class Rect(val x: Double, val y: Double, val w: Double, val h: Double)

    /** CameraX CompositionSettings values (NDC: centre origin, Y up). */
    data class Composition(val offsetX: Float, val offsetY: Float, val scale: Float)

    enum class TakeStatus { KEPT, NEEDS_REVIEW, EMPTY }

    data class Plan(val dual: Boolean, val primaryId: String?, val secondaryId: String?, val reason: String)

    private fun round6(v: Double) = Math.round(v * 1_000_000.0) / 1_000_000.0

    fun pipRect(
        corner: Corner, scale: Double = 0.3, margin: Double = 0.04,
        frameWidth: Int = 1080, frameHeight: Int = 1920
    ): Rect {
        require(frameWidth > 0 && frameHeight > 0) { "Invalid frame size" }
        val s = scale.coerceIn(0.15, 0.5)
        val mx = margin.coerceIn(0.0, 0.1)
        val my = mx * frameWidth / frameHeight
        val left = corner == Corner.BOTTOM_LEFT || corner == Corner.TOP_LEFT
        val top = corner == Corner.TOP_LEFT || corner == Corner.TOP_RIGHT
        return Rect(
            round6(if (left) mx else 1 - mx - s),
            round6(if (top) my else 1 - my - s),
            round6(s), round6(s)
        )
    }

    fun composition(rect: Rect): Composition {
        val cx = rect.x + rect.w / 2
        val cy = rect.y + rect.h / 2
        return Composition(round6(cx * 2 - 1).toFloat(), round6(1 - cy * 2).toFloat(), round6(rect.w).toFloat())
    }

    /** The primary camera fills the frame. */
    val FULL_FRAME = Composition(0f, 0f, 1f)

    /**
     * Pick the concurrent pair to bind. `pairs` must come from the running
     * phone (CameraManager.getConcurrentCameraIds or CameraX
     * availableConcurrentCameraInfos), never from a model list.
     */
    fun plan(
        cameras: List<CameraEntry>, pairs: List<Set<String>>,
        primaryFacing: Facing = Facing.BACK, secondaryFacing: Facing = Facing.FRONT
    ): Plan {
        if (cameras.isEmpty()) return Plan(false, null, null, "no-camera")
        val primary = cameras.firstOrNull { it.facing == primaryFacing } ?: cameras.first()
        if (cameras.size < 2) return Plan(false, primary.id, null, "one-camera")
        val known = cameras.map { it.id }.toSet()
        val valid = pairs.filter { it.size == 2 && known.containsAll(it) }
        val wanted = cameras.firstOrNull { it.facing == secondaryFacing && it.id != primary.id }
        if (wanted != null && valid.any { it == setOf(primary.id, wanted.id) })
            return Plan(true, primary.id, wanted.id, "concurrent-pair")
        val withPrimary = valid.firstOrNull { primary.id in it }
        if (withPrimary != null)
            return Plan(true, primary.id, withPrimary.first { it != primary.id }, "concurrent-pair")
        val any = valid.firstOrNull() ?: return Plan(false, primary.id, null, "no-concurrent-pair")
        // The requested primary is in no pair: keep the requested FACING.
        val facingOf = cameras.associate { it.id to it.facing }
        val p = any.firstOrNull { facingOf[it] == primaryFacing } ?: any.sorted().first()
        return Plan(true, p, any.first { it != p }, "concurrent-pair")
    }

    /**
     * Classify a finalized CameraX take whatever its Finalize error code:
     * `verified` is WivraCaptureMediaVerifier's result on the private file.
     * A file with bytes is never classified EMPTY: the owner decides.
     */
    fun classifyTake(bytes: Long, verified: Boolean): TakeStatus = when {
        bytes <= 0L -> TakeStatus.EMPTY
        verified -> TakeStatus.KEPT
        else -> TakeStatus.NEEDS_REVIEW
    }

    /** After a loss mid-recording: continue only if another camera remains. */
    fun shouldContinueAfterLoss(activeAfterLoss: Int, ownerStopped: Boolean): Boolean =
        activeAfterLoss > 0 && !ownerStopped

    /** Space for one more take; same threshold as the single-camera activity. */
    fun hasRoomForTake(usableBytes: Long): Boolean = usableBytes >= 200L * 1024 * 1024
}
