package com.oswhgo.wivra

/**
 * LIVE reconnection policy, mirror of core/live-reconnect.mjs (JVM-tested).
 * RootEncoder reconnects with the URL it already holds in memory; Wivra never
 * stores the key. The local MP4 copy is never stopped by a reconnection. — Claude
 */
class WivraLiveReconnect {
    companion object {
        val DELAYS_S = listOf(2, 4, 8, 15, 15, 15)
    }

    var attempt = 0
        private set
    var gaveUp = false
        private set

    /** Delay in ms before the next attempt, or null when it must give up. */
    fun nextDelayMs(neverRetry: Boolean = false): Long? {
        if (neverRetry || attempt >= DELAYS_S.size) {
            gaveUp = true
            return null
        }
        val delay = DELAYS_S[attempt] * 1000L
        attempt += 1
        gaveUp = false
        return delay
    }

    fun connected() {
        attempt = 0
        gaveUp = false
    }
}
