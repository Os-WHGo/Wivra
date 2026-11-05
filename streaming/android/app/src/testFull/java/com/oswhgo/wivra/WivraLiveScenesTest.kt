package com.oswhgo.wivra

import com.oswhgo.wivra.WivraLiveScenes.Rect
import com.oswhgo.wivra.WivraLiveScenes.Slot
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** Same numbers as core/tests/live-scenes.test.mjs. — Claude */
class WivraLiveScenesTest {
    @Test fun scenesNeedTheirSources() {
        assertEquals(listOf("camera"), WivraLiveScenes.available(false, false))
        assertEquals(listOf("camera", "camera-video", "split", "video"), WivraLiveScenes.available(true, false))
        assertEquals(listOf("camera", "camera-image", "image"), WivraLiveScenes.available(false, true))
        assertNull(WivraLiveScenes.preset("video-camera")) // camera is never a layer on Android
    }

    @Test fun geometryMatchesJavaScript() {
        assertEquals(Rect(0.0, 0.341797, 1.0, 0.316406),
            WivraLiveScenes.contain(Rect(0.0, 0.0, 1.0, 1.0), 1920, 1080, 720, 1280))
        val l = WivraLiveScenes.layout("camera-video", 720, 1280, videoSize = 1920 to 1080)
        assertEquals(Rect(0.61, 0.747129, 0.35, 0.110742), l.layers.getValue(Slot.VIDEO).rect)
        assertFalse(l.layers.getValue(Slot.IMAGE).visible)
        assertFalse(l.layers.getValue(Slot.BACKDROP).visible)
        val split = WivraLiveScenes.layout("split", 480, 640, videoSize = 1920 to 1080)
        assertEquals(Rect(0.0, 0.5, 1.0, 0.5), split.layers.getValue(Slot.BACKDROP).rect)
        assertTrue(split.layers.getValue(Slot.VIDEO).rect.y >= 0.5)
        assertTrue(WivraLiveScenes.layout("image", 480, 640, imageSize = 10 to 10).micMuted)
    }

    @Test fun lostSourcesFallBackToCamera() {
        assertEquals("camera", WivraLiveScenes.fallbackFor("split", Slot.VIDEO))
        assertNull(WivraLiveScenes.fallbackFor("camera-image", Slot.VIDEO))
        assertEquals("camera", WivraLiveScenes.fallbackFor("image", Slot.IMAGE))
    }
}
