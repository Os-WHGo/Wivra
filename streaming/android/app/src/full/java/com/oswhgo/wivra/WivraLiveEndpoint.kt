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
            val rawPath = uri.rawPath ?: return false
            val decodedPath = uri.path ?: return false
            // Keep every segment boundary unchanged across percent decoding.
            // URI.path can turn %2F into a new slash and %0A into a control.
            if (!rawPath.startsWith("/") || rawPath.endsWith("/") ||
                rawPath.contains("//") || !decodedPath.startsWith("/")) return false
            val rawSegments = rawPath.drop(1).split('/')
            val decodedSegments = decodedPath.drop(1).split('/')
            val validSegments = rawSegments.size == decodedSegments.size &&
                decodedSegments.size >= 2 &&
                decodedSegments.all { segment ->
                    segment.isNotEmpty() && segment != "." && segment != ".." &&
                        segment.none { char ->
                            char == '\\' || char == '/' || char.isWhitespace() ||
                                Character.isISOControl(char)
                        }
                }
            uri.scheme?.lowercase() in setOf("rtmp", "rtmps") &&
                !uri.host.isNullOrBlank() && uri.rawUserInfo == null &&
                uri.rawFragment == null && uri.rawQuery == null &&
                (uri.port == -1 || uri.port in 1..65535) && validSegments
        } catch (_: Exception) { false }
    }

    fun displayHost(input: String): String? {
        // Never expose RTMP application path, stream key, query or credentials.
        if (!valid(input)) return null
        return URI(input).host?.take(120)
    }
}
