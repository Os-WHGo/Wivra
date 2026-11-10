package com.oswhgo.wivra

import com.oswhgo.wivra.WivraLiveScenes.SourceAction
import org.junit.Assert.*
import org.junit.Test

/** Internal scene changes must remain available during LIVE; file pickers must not leave it. — Codex */
class WivraLiveSourceActionsTest {
    @Test fun beforeLiveAllSourceActionsAreAvailable() {
        assertEquals(SourceAction.entries.toList(), WivraLiveScenes.sourceActions(false))
    }

    @Test fun standbyAndInsetRemainAvailableOnAirAndWhileReconnecting() {
        // The host uses initiatedByUser, which stays true across reconnect and local-copy-only recording.
        assertEquals(listOf(SourceAction.STANDBY, SourceAction.MOVE_INSET, SourceAction.VIDEO_SOUND),
            WivraLiveScenes.sourceActions(true))
        for (blocked in listOf(SourceAction.PICK_VIDEO, SourceAction.PICK_IMAGE, SourceAction.REMOVE)) {
            assertFalse(WivraLiveScenes.sourceActions(true).contains(blocked))
        }
    }

    @Test fun standbyMutesOnlyItsSceneAndCameraRestoresAudio() {
        val pause = WivraLiveScenes.layout("image", 480, 640, imageSize = 480 to 640)
        assertTrue(pause.micMuted)
        assertTrue(pause.layers.getValue(WivraLiveScenes.Slot.IMAGE).visible)
        val camera = WivraLiveScenes.layout("camera", 480, 640)
        assertFalse(camera.micMuted)
        assertTrue(camera.layers.values.none { it.visible })
    }
}
