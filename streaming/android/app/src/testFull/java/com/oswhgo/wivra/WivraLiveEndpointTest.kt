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

    @Test fun rejectsAmbiguousOrEncodedRTMPPaths() {
        val invalid = listOf(
            "rtmps://example.org/live//key",
            "rtmps://example.org/live/key/",
            "rtmps://example.org/live/./key",
            "rtmps://example.org/live/../key",
            "rtmps://example.org/live/%2E%2E",
            "rtmps://example.org/live/%2Fchild",
            "rtmps://example.org/live/line%0Abreak",
            "rtmps://example.org/live/nul%00byte",
            "rtmps://example.org/live/a%5Cb",
            "rtmps://example.org/live/with%20space",
            "rtmps://example.org/live/key?token=secret",
            "rtmps://example.org:0/live/key"
        )
        for (value in invalid) {
            assertFalse(value.take(32), WivraLiveEndpoint.valid(value))
            assertEquals(null, WivraLiveEndpoint.displayHost(value))
        }
        assertTrue(WivraLiveEndpoint.valid("rtmps://example.org/live/encoded%2Dkey"))
        assertTrue(WivraLiveEndpoint.valid("rtmp://localhost:1935/app/key"))
    }

    @Test fun aDisplayedHostNeverIncludesThePrivateKey() {
        val url = "rtmps://video.example.net/live/this-is-a-private-broadcast-secret"
        assertEquals("video.example.net", WivraLiveEndpoint.displayHost(url))
        assertFalse(WivraLiveEndpoint.displayHost(url)!!.contains("secret"))
    }
}
