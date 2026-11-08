package com.oswhgo.wivra

/**
 * Keep DAT->LIVE capture/render ahead of the optional JPEG ImageView preview.
 * While LIVE is active, a 1 Hz local preview is sufficient to confirm framing;
 * every DAT frame still reaches the RootEncoder input independently.
 * This does not lower the SDK's requested resolution or the transmitted FPS.
 * Time uses Android's monotonic SystemClock.elapsedRealtime().
 */
object WivraRayBanPreviewBudget {
    const val PREVIEW_INTERVAL_MS = 160L
    const val LIVE_INTERVAL_MS = 1_000L

    fun shouldRefresh(nowMs: Long, previousMs: Long, live: Boolean): Boolean {
        if (nowMs < 0 || previousMs < 0 || nowMs < previousMs) return false
        return nowMs - previousMs >= (if (live) LIVE_INTERVAL_MS else PREVIEW_INTERVAL_MS)
    }
}
