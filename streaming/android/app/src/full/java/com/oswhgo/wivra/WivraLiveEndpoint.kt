package com.oswhgo.wivra

import java.net.URI

/**
 * A URL preflight, NOT a platform eligibility check.
 * Stream keys are not printed, stored, serialized or returned here.
 * Only the user's direct RTMP/RTMPS server can receive a key.
 */
internal object WivraLiveEndpoint {
    fun valid(input: String): Boolean {
        if (input.length !in 12..1500 || input != input.trim() ||
            input.any { it.isWhitespace() || Character.isISOControl(it) }) return false
        return try {
            val uri = URI(input)
            val segments = (uri.rawPath ?: "").split('/').filter { it.isNotEmpty() }
            uri.scheme?.lowercase() in setOf("rtmp", "rtmps") &&
                !uri.host.isNullOrBlank() && uri.rawUserInfo == null &&
                uri.rawFragment == null && segments.size >= 2
        } catch (_: Exception) { false }
    }

    fun displayHost(input: String): String? {
        // Never expose RTMP application path, stream key, query or credentials.
        if (!valid(input)) return null
        return URI(input).host?.take(120)
    }
}
