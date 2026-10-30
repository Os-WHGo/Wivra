package com.oswhgo.wivra

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WivraLiveEndpointTest {
    @Test fun acceptsRtmpAndEncryptedRtmps() {
        assertTrue(WivraLiveEndpoint.valid("rtmp://localhost/live/key123"))
        assertTrue(WivraLiveEndpoint.valid("rtmps://stream.example.org:443/app/key123"))
        assertEquals("stream.example.org",
            WivraLiveEndpoint.displayHost("rtmps://stream.example.org/app/private-token"))
    }

    @Test fun rejectsEmptyHttpFileAndLocalDataSchemes() {
        for (value in listOf("", "https://site.example/live/key",
            "file:///tmp/live/key", "rtmps://stream.example.org",
            "rtmp://stream.example.org/live", "rtmp://", "rtmps://host/live/")) {
            assertFalse(value, WivraLiveEndpoint.valid(value))
        }
    }

    @Test fun refusesUrlWithEmbeddedUserCredentialsOrFragment() {
        assertFalse(WivraLiveEndpoint.valid("rtmps://alice:secret@example.org/app/key"))
        assertFalse(WivraLiveEndpoint.valid("rtmps://example.org/app/key#fragment"))
    }

    @Test fun rejectsWhitespaceControlsAndOversizedTokens() {
        assertFalse(WivraLiveEndpoint.valid(" rtmps://example.org/app/key"))
        assertFalse(WivraLiveEndpoint.valid("rtmps://example.org/app/key\n"))
        assertFalse(WivraLiveEndpoint.valid("rtmps://example.org/app/" + "a".repeat(2000)))
    }

    @Test fun aDisplayedHostNeverIncludesThePrivateKey() {
        val url = "rtmps://video.example.net/live/this-is-a-private-broadcast-secret"
        assertEquals("video.example.net", WivraLiveEndpoint.displayHost(url))
        assertFalse(WivraLiveEndpoint.displayHost(url)!!.contains("secret"))
    }
}
